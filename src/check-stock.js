const asyncPool = require('tiny-async-pool');

const { writeProgress, errorStockCheckResult } = require('./utils');
const { openChromeBrowser, openPage, navigateAndGetPageSource } = require('./chrome');
const { PROVIDERS, getProductUrl } = require('./providers');

const MAX_CONCURRENCY = 4;

async function openTabsForProviders() {
  await writeProgress('[opening Chrome]');
  const browser = await openChromeBrowser();

  let i = 0;
  const providerPages = {};
  await asyncPool(MAX_CONCURRENCY, Object.keys(PROVIDERS), async (providerKey) => {
    await writeProgress(`[${i++}/${Object.keys(PROVIDERS).length}]`, { overwrite: true });
    providerPages[providerKey] = await openPage(browser);
  });

  return { providerPages, browser };
}

async function closeTabsForProviders(browser, providerPages) {
  let i = 0;
  await asyncPool(MAX_CONCURRENCY, Object.keys(PROVIDERS), async (providerKey) => {
    await writeProgress(`[${i++}/${Object.keys(PROVIDERS).length}]`, { overwrite: true });
    await providerPages[providerKey].close();
  });

  await writeProgress(`[closing Chrome]`, { overwrite: true });
  await browser.close();
}

async function checkStock(products) {
  await writeProgress('Opening Chrome tabs for each provider... ', { start: true });
  let providerPages = null;
  let browser = null;
  try {
    ({ providerPages, browser } = await openTabsForProviders());
    await writeProgress('done!', { end: true, overwrite: true });
  } catch (e) {
    await writeProgress('failed!', { end: true, overwrite: true });
    throw e;
  }

  await writeProgress('Checking product stock... ', { start: true });
  await writeProgress('');

  let i = 0;
  const productStock = new Map();

  try {
    await asyncPool(MAX_CONCURRENCY, Object.keys(PROVIDERS), async (providerKey) => {
      const productsForProvider = products.filter((product) => product.provider === providerKey);

      for (const product of productsForProvider) {
        await writeProgress(`[${i++}/${products.length}]`, { overwrite: true });

        try {
          const response = await navigateAndGetPageSource(
            getProductUrl(product),
            providerPages[providerKey]
          );

          if (!response.ok) {
            productStock.set(
              product,
              errorStockCheckResult(`${response.status} ${response.statusText}`)
            );
            continue;
          }
          productStock.set(product, PROVIDERS[product.provider].parse(response.text));
        } catch (e) {
          productStock.set(product, errorStockCheckResult(`[${e.name}] ${e.message}`));
        }
      }
    });

    await writeProgress('done!', { end: true, overwrite: true });
  } catch (e) {
    await writeProgress('failed!', { end: true, overwrite: true });
    throw e;
  } finally {
    await writeProgress('Closing Chrome tabs... ', { start: true });
    await writeProgress('');
    await closeTabsForProviders(browser, providerPages);
    await writeProgress('done!', { end: true, overwrite: true });
  }

  return productStock;
}

exports.checkStock = checkStock;
