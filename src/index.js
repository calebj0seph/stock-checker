const { writeProgress } = require('./utils');
const { loadRecipients, loadProducts, saveStockMap, loadStockMap } = require('./file-system');
const { checkStock } = require('./check-stock');
const { PROVIDERS, getProductUrl } = require('./providers');
const { notifyRecipients } = require('./notification');

const MIN_RECHECK_TIME = 3 * 60 * 1000;
const MAX_RECHECK_TIME = 10 * 60 * 1000;

async function scheduleRecheck() {
  const recheckTime = Math.floor(
    Math.random() * (MAX_RECHECK_TIME - MIN_RECHECK_TIME) + MIN_RECHECK_TIME
  );
  await writeProgress(
    `Scheduling stock recheck in ${Math.floor(recheckTime / 1000 / 60)}m ${
      Math.floor(recheckTime / 1000) - Math.floor(recheckTime / 1000 / 60) * 60
    }s`,
    { start: true, end: true }
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
        await writeProgress(
          `Missing product '${product.name}' from provider ${product.provider} from call to checkStock()`,
          { start: true, end: true, level: 'error' }
        );
        continue;
      }
      const stock = stocks.get(product);
      if (stock.status === 'ERROR') {
        errorsInLastHour++;
        await writeProgress(
          `Failed to check stock for product '${product.name}' from provider ${product.provider}${
            stock.message !== undefined ? ': ' + stock.message : ''
          }`,
          { start: true, end: true, level: 'warning' }
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
  } catch (e) {
    errorsInLastHour++;
    await writeProgress(`Unexpected error: [${e.name}] ${e.message}`, {
      start: true,
      end: true,
      level: 'error',
    });

    // Schedule the next check
    await scheduleRecheck();
    return;
  }

  // Save last stock state
  await saveStockMap(lastStockResult);

  // Send out messages
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await writeProgress(`Sending ${recipientMessages.length} messages... `, { start: true });
  const cost = await notifyRecipients(recipients, recipientMessages);
  await writeProgress(`done! (total cost $${currencyFormatter.format(cost)})`, { end: true });

  // Schedule the next check
  await scheduleRecheck();
}

async function checkErrorsInLastHour() {
  const recipients = await loadRecipients();
  const admins = Object.keys(recipients).filter(
    (recipient) => recipients[recipient].isAdmin === true
  );

  if (errorsInLastHour > 0) {
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
