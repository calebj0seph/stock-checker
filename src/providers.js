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
  MWAVE: {
    name: 'Mwave',
    baseUrl: 'https://www.mwave.com.au/',
    parse: (html) => {
      const root = parse(html);
      const addToCart = root.querySelectorAll('.divAddCart .addToCarts');
      if (addToCart.length === 0) {
        return errorStockCheckResult("'Add to cart' section missing");
      }
      if (addToCart.length > 1) {
        return errorStockCheckResult("Multiple 'Add to cart' sections found");
      }
      return addToCart[0].querySelectorAll('button').length === 0
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
  PLE: {
    name: 'PLE Computers',
    baseUrl: 'https://www.ple.com.au/',
    parse: (html) => {
      const root = parse(html);
      const availabilityContainer = root.querySelectorAll('.availabilityContainerWrapper');
      if (availabilityContainer.length === 0) {
        return errorStockCheckResult('Availability container missing');
      }
      if (availabilityContainer.length > 1) {
        return errorStockCheckResult('Multiple availability containers found');
      }
      if (availabilityContainer[0].querySelectorAll('.viewItemStoreAvailability').length === 0) {
        return errorStockCheckResult('Availability information missing');
      }
      return availabilityContainer[0].querySelectorAll(
        '.viewItemStoreAvailability:not(.viewItemDarkGrayText)'
      ).length === 0
        ? outOfStockCheckResult()
        : inStockCheckResult();
    },
  },
  UMART: {
    name: 'Umart',
    baseUrl: 'https://www.umart.com.au/',
    parse: (html) => {
      const root = parse(html);
      const addToCartButton = root.querySelectorAll('form .goods_info .addtocart_btn:not(.lmn)');
      if (addToCartButton.length > 1) {
        return errorStockCheckResult("Multiple 'Add to cart' buttons found");
      }
      if (addToCartButton.length === 1) {
        return inStockCheckResult();
      }
      const letMeKnowButton = root.querySelectorAll('form .goods_info .addtocart_btn.lmn');
      if (letMeKnowButton.length > 1) {
        return errorStockCheckResult("Multiple 'Let me know' buttons found");
      }
      if (letMeKnowButton.length === 1) {
        return outOfStockCheckResult();
      }
      return errorStockCheckResult('Checkout buttons missing');
    },
  },
  BPC_TECH: {
    name: 'BPC Tech',
    baseUrl: 'https://www.bpctech.com.au/',
    parse: (html) => {
      const root = parse(html);
      const productStockStatus = root.querySelectorAll('.productStockStatus');
      if (productStockStatus.length === 0) {
        return errorStockCheckResult('Product stock status missing');
      }
      if (productStockStatus.length > 1) {
        return errorStockCheckResult('Multiple product stock statuses found');
      }
      return productStockStatus[0].classList.contains('stockInBPCT')
        ? inStockCheckResult()
        : outOfStockCheckResult();
    },
  },
};

const getProductUrl = (product) =>
  PROVIDERS[product.provider].baseUrl.replace(/\/+$/, '') + '/' + product.url.replace(/^\/+/, '');

exports.PROVIDERS = PROVIDERS;
exports.getProductUrl = getProductUrl;
