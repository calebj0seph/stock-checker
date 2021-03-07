const asyncPool = require('tiny-async-pool');
const AbortController = require('abort-controller');
const fetch = require('node-fetch');

const { writeProgress, errorStockCheckResult } = require('./utils');
const { openChromeBrowser, getChromeHeadersForUrl } = require('./chrome');
const { PROVIDERS, getProductUrl } = require('./providers');

const MAX_CONCURRENCY = 4;
const FETCH_TIMEOUT = 3000;

async function getProviderHeaders() {
  await writeProgress('[opening Chrome]');
  const browser = await openChromeBrowser();

  let i = 0;
  const providerHeaders = {};
  await asyncPool(MAX_CONCURRENCY, Object.keys(PROVIDERS), async (providerKey) => {
    await writeProgress(`[${i++}/${Object.keys(PROVIDERS).length}]`, { overwrite: true });
    providerHeaders[providerKey] = await getChromeHeadersForUrl(
      PROVIDERS[providerKey].baseUrl,
      browser
    );
  });

  await writeProgress('[closing Chrome]', { overwrite: true });
  await browser.close();

  return providerHeaders;
}

async function checkStock(products) {
  await writeProgress('Refreshing provider HTTP headers... ', { start: true });
  let providerHeaders = {};
  try {
    providerHeaders = await getProviderHeaders();
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
    await asyncPool(MAX_CONCURRENCY, products, async (product) => {
      await writeProgress(`[${i++}/${products.length}]`, { overwrite: true });

      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort();
      }, FETCH_TIMEOUT);
      try {
        const response = await fetch(getProductUrl(product), {
          signal: abortController.signal,
          headers: providerHeaders[product.provider],
        });
        if (!response.ok) {
          productStock.set(
            product,
            errorStockCheckResult(`${response.status} ${response.statusText}`)
          );
          return;
        }
        productStock.set(product, PROVIDERS[product.provider].parse(await response.text()));
      } catch (e) {
        if (e.name === 'AbortError') {
          productStock.set(product, errorStockCheckResult('request timed out'));
        } else {
          productStock.set(product, errorStockCheckResult(`[${e.name}] ${e.message}`));
        }
      } finally {
        clearTimeout(timeout);
      }
    });
  } catch (e) {
    await writeProgress('failed!', { end: true, overwrite: true });
    throw e;
  }

  await writeProgress('done!', { end: true, overwrite: true });

  return productStock;
}

exports.checkStock = checkStock;
