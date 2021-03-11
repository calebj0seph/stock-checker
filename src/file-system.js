const { readFile, writeFile } = require('fs').promises;
const yaml = require('yaml');

async function loadYaml(path) {
  const yamlRaw = await readFile(path, { encoding: 'utf-8' });
  return yaml.parse(yamlRaw);
}

function loadConfig() {
  return loadYaml('data/config.yml');
}

function loadRecipients() {
  return loadYaml('data/recipients.yml');
}

function loadProducts() {
  return loadYaml('data/products.yml');
}

async function saveStockMap(stocks) {
  const data = {};
  for (const product of stocks.keys()) {
    data[JSON.stringify({ url: product.url, provider: product.provider })] = stocks.get(product);
  }
  await writeFile('data/lastStockMap.json', JSON.stringify(data));
}

async function loadStockMap(products) {
  const result = new Map();

  try {
    const data = JSON.parse(await readFile('data/lastStockMap.json', { encoding: 'utf-8' }));

    for (const productKeyRaw of Object.keys(data)) {
      const productKey = JSON.parse(productKeyRaw);
      const product = products.find(
        (product) => product.url === productKey.url && product.provider === productKey.provider
      );
      if (product !== undefined) {
        result.set(product, data[productKeyRaw]);
      }
    }
  } catch (e) {
    return new Map();
  }

  return result;
}

exports.loadConfig = loadConfig;
exports.loadRecipients = loadRecipients;
exports.loadProducts = loadProducts;
exports.saveStockMap = saveStockMap;
exports.loadStockMap = loadStockMap;
