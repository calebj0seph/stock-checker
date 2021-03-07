const { parse } = require('node-html-parser');

const { errorStockCheckResult, outOfStockCheckResult, inStockCheckResult } = require('./utils');

const PROVIDERS = {
  SCORPTEC: {
    name: 'Scorptec',
    baseUrl: 'https://www.scorptec.com.au/',
    parse: (html) => {
      const root = parse(html);
      const addToCart = root.querySelectorAll('#price-addcart');
      if (addToCart.length === 0) {
        return errorStockCheckResult("'Add to cart' button missing");
      }
      if (addToCart.length > 1) {
        return errorStockCheckResult("Multiple 'Add to cart' buttons found");
      }
      return addToCart[0].querySelectorAll('a').length === 0
        ? outOfStockCheckResult()
        : inStockCheckResult();
    },
  },
  PC_CASE_GEAR: {
    name: 'PC Case Gear',
    baseUrl: 'https://www.pccasegear.com/',
    parse: (html) => {
      const root = parse(html);
      const addToCart = root.querySelectorAll('button.add-to-cart');
      if (addToCart.length === 0) {
        return errorStockCheckResult("'Add to cart' button missing");
      }
      if (addToCart.length > 1) {
        return errorStockCheckResult("Multiple 'Add to cart' buttons found");
      }
      return addToCart[0].getAttribute('disabled') !== undefined
        ? outOfStockCheckResult()
        : inStockCheckResult();
    },
  },
};

const getProductUrl = (product) =>
  PROVIDERS[product.provider].baseUrl.replace(/\/+$/, '') + '/' + product.url.replace(/^\/+/, '');

exports.PROVIDERS = PROVIDERS;
exports.getProductUrl = getProductUrl;
