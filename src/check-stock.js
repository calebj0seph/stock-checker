const asyncPool = require('tiny-async-pool');

const { writeProgress, errorStockCheckResult } = require('./utils');
const { openChromeBrowser, openPage, navigateAndGetPageSource } = require('./chrome');
const { PROVIDERS, getProductUrl } = require('./providers');

const MAX_CONCURRENCY = 4;
const NEW_PAGE_TIMEOUT_MS = 5000;
const MAX_RETRIES_PER_PRODUCT = 3;
const RETRY_DELAY_MS = (retry) => 2 ** retry * 1500;

async function openTabsForProviders() {
  await writeProgress('[opening Chrome]');
  const browser = await openChromeBrowser();

  const providerPages = {};
  const providerKeys = Object.keys(PROVIDERS);
  for (let i = 0; i < providerKeys.length; i++) {
    await writeProgress(`[${i}/${providerKeys.length}]`, { overwrite: true });

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, NEW_PAGE_TIMEOUT_MS));
    const pagePromise = openPage(browser);

    const [completed, page] = await Promise.race(
      [timeoutPromise, pagePromise].map((promise) => promise.then((result) => [promise, result]))
    );
    if (completed === timeoutPromise) {
      await browser.close();
      throw new Error(`timeout of ${NEW_PAGE_TIMEOUT_MS} exceeded opening new page`);
    }

    providerPages[providerKeys[i]] = page;
  }

  return { providerPages, browser };
}

async function closeTabsForProviders(browser, providerPages) {
  const providerKeys = Object.keys(PROVIDERS);
  for (let i = 0; i < providerKeys.length; i++) {
    await writeProgress(`[${i}/${providerKeys.length}]`, { overwrite: true });
    await providerPages[providerKeys[i]].close();
  }

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

        for (let retry = 0; retry < MAX_RETRIES_PER_PRODUCT; retry++) {
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
            } else {
              productStock.set(product, PROVIDERS[product.provider].parse(response.text));
              break;
            }
          } catch (e) {
            productStock.set(product, errorStockCheckResult(`[${e.name}] ${e.message}`));
          }

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS(retry)));
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
