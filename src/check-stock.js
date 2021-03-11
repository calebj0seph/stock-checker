const asyncPool = require('tiny-async-pool');

const { errorStockCheckResult } = require('./utils');
const { printProgress } = require('./logger');
const { openChromeBrowser, openPage, navigateAndGetPageSource } = require('./chrome');
const { PROVIDERS, getProductUrl } = require('./providers');

const MAX_CONCURRENCY = 4;
const NEW_PAGE_TIMEOUT_MS = 5000;
const MAX_RETRIES_PER_PRODUCT = 3;
const RETRY_DELAY_MS = (retry) => 2 ** retry * 1500;

async function openTabsForProviders(updateProgress) {
  await updateProgress('[opening Chrome]');
  const browser = await openChromeBrowser();

  const providerPages = {};
  const providerKeys = Object.keys(PROVIDERS);
  for (let i = 0; i < providerKeys.length; i++) {
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

async function closeTabsForProviders(browser, providerPages, updateProgress) {
  await updateProgress(`[closing Chrome]`);

  const providerKeys = Object.keys(PROVIDERS);
  for (let i = 0; i < providerKeys.length; i++) {
    await providerPages[providerKeys[i]].close();
  }

  await browser.close();
}

async function checkStock(products) {
  const updateProgress = await printProgress('Checking product stock... ', { end: false });
  let providerPages = null;
  let browser = null;
  try {
    ({ providerPages, browser } = await openTabsForProviders(updateProgress));
  } catch (e) {
    await updateProgress('failed! (could not open Chrome tabs)', { end: true });
    throw e;
  }

  let i = 0;
  const productStock = new Map();

  try {
    await asyncPool(MAX_CONCURRENCY, Object.keys(PROVIDERS), async (providerKey) => {
      const productsForProvider = products.filter((product) => product.provider === providerKey);

      for (const product of productsForProvider) {
        await updateProgress(`[${i++}/${products.length}]`);

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
  } catch (e) {
    await updateProgress('failed!', { end: true });
    throw e;
  } finally {
    await closeTabsForProviders(browser, providerPages, updateProgress);
  }
  await updateProgress('done!', { end: true });

  return productStock;
}

exports.checkStock = checkStock;
