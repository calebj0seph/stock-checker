const errorStockCheckResult = (message) => ({
  status: 'ERROR',
  ...(message === undefined ? {} : { message }),
});

const outOfStockCheckResult = () => ({
  status: 'OUT_OF_STOCK',
});

const inStockCheckResult = () => ({
  status: 'IN_STOCK',
});

exports.errorStockCheckResult = errorStockCheckResult;
exports.outOfStockCheckResult = outOfStockCheckResult;
exports.inStockCheckResult = inStockCheckResult;
