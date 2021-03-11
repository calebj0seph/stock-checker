const { printProgress } = require('./logger');
const { loadRecipients, loadProducts, saveStockMap, loadStockMap } = require('./file-system');
const { checkStock } = require('./check-stock');
const { PROVIDERS, getProductUrl } = require('./providers');
const { notifyRecipients } = require('./notification');

const MIN_RECHECK_TIME = 3 * 60 * 1000;
const MAX_RECHECK_TIME = 10 * 60 * 1000;

async function displayStockStatus(stocks) {
  let inStockCount = 0;
  let outOfStockCount = 0;
  let errorCount = 0;
  for (const stock of stocks.values()) {
    if (stock.status === 'IN_STOCK') {
      inStockCount++;
    } else if (stock.status === 'OUT_OF_STOCK') {
      outOfStockCount++;
    } else if (stock.status === 'ERROR') {
      errorCount++;
    }
  }

  const updateProgress = await printProgress('Current product stock status: ', { end: false });
  if (errorCount > 0) {
    await updateProgress(
      `${inStockCount} in stock, ${outOfStockCount} out of stock and ${errorCount} ${
        errorCount === 1 ? 'error' : 'errors'
      }`,
      { end: true }
    );
  } else {
    await updateProgress(`${inStockCount} in stock and ${outOfStockCount} out of stock`, {
      end: true,
    });
  }
}

async function scheduleRecheck() {
  const recheckTime = Math.floor(
    Math.random() * (MAX_RECHECK_TIME - MIN_RECHECK_TIME) + MIN_RECHECK_TIME
  );
  await printProgress(
    `Scheduling stock recheck in ${Math.floor(recheckTime / 1000 / 60)}m ${
      Math.floor(recheckTime / 1000) - Math.floor(recheckTime / 1000 / 60) * 60
    }s`
  );

  setTimeout(checkStockAndNotifyRecipients, recheckTime);
}

let errorsInLastHour = 0;
async function checkStockAndNotifyRecipients() {
  const recipients = await loadRecipients();
  const products = await loadProducts();
  const recipientMessages = [];
  const lastStockResult = await loadStockMap(products);

  try {
    const stocks = await checkStock(products);
    for (const product of products) {
      if (!stocks.has(product)) {
        errorsInLastHour++;
        await printProgress(
          `Missing product '${product.name}' from provider ${product.provider} from call to checkStock()`,
          { level: 'error' }
        );
        continue;
      }
      const stock = stocks.get(product);
      if (stock.status === 'ERROR') {
        errorsInLastHour++;
        await printProgress(
          `Failed to check stock for product '${product.name}' from provider ${product.provider}${
            stock.message !== undefined ? ': ' + stock.message : ''
          }`,
          { level: 'warning' }
        );
        continue;
      }
      if (
        stock.status === 'IN_STOCK' &&
        (!lastStockResult.has(product) || lastStockResult.get(product).status === 'OUT_OF_STOCK')
      ) {
        recipientMessages.push(
          ...product.watchers.map((recipient) => ({
            recipient,
            message: `🎉 ${product.name} from ${
              PROVIDERS[product.provider].name
            } is now back in stock!\n${getProductUrl(product)}`,
          }))
        );
      }
      if (
        stock.status === 'OUT_OF_STOCK' &&
        lastStockResult.has(product) &&
        lastStockResult.get(product).status === 'IN_STOCK'
      ) {
        recipientMessages.push(
          ...product.watchers.map((recipient) => ({
            recipient,
            message: `😞 ${product.name} from ${
              PROVIDERS[product.provider].name
            } has gone out of stock!\n${getProductUrl(product)}`,
          }))
        );
      }
      lastStockResult.set(product, stock);
    }

    await displayStockStatus(stocks);
  } catch (e) {
    errorsInLastHour++;
    await printProgress(`Unexpected error: [${e.name}] ${e.message}`, { level: 'error' });

    // Schedule the next check
    await scheduleRecheck();
    return;
  }

  // Save last stock state
  await saveStockMap(lastStockResult);

  // Send out messages
  if (recipientMessages.length > 0) {
    await notifyRecipients(recipients, recipientMessages);
  }

  // Schedule the next check
  await scheduleRecheck();
}

async function checkErrorsInLastHour() {
  const recipients = await loadRecipients();
  const admins = Object.keys(recipients).filter(
    (recipient) => recipients[recipient].isAdmin === true
  );

  if (errorsInLastHour > 0) {
    await printProgress(
      `Sending alert notification as there ${
        errorsInLastHour === 1 ? 'has' : 'have'
      } been ${errorsInLastHour} ${errorsInLastHour === 1 ? 'error' : 'errors'} in the last hour`,
      { level: 'warning' }
    );
    await notifyRecipients(
      recipients,
      admins.map((admin) => ({
        recipient: admin,
        message: `⚠️ There ${errorsInLastHour === 1 ? 'has' : 'have'} been ${errorsInLastHour} ${
          errorsInLastHour === 1 ? 'error' : 'errors'
        } in the last hour checking stocks. Please investigate.`,
      }))
    );
    errorsInLastHour = 0;
  }

  // Check again in an hour
  setTimeout(checkErrorsInLastHour, 60 * 60 * 1000);
}

checkErrorsInLastHour();
checkStockAndNotifyRecipients();
