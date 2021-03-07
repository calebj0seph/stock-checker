const { stdout } = require('process');
const AsyncLock = require('async-lock');

const lock = new AsyncLock();

const writeAsync = (data) => new Promise((resolve) => stdout.write(data, resolve));

const LOG_DATE_COLORS = {
  info: '90',
  warning: '33',
  error: '31',
};

const LOG_COLORS = {
  info: '0',
  warning: '93',
  error: '91',
};

let lastMessage = '';
let lastMessageEnded = true;
async function writeProgressUnsafe(
  message,
  { start = false, end = false, overwrite = false, level = 'info' } = {}
) {
  if (start && !lastMessageEnded) {
    await writeAsync('\n');
  }
  if (start) {
    await writeAsync(
      `\x1b[${LOG_DATE_COLORS[level]}m[` +
        new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') +
        ']\x1b[0m '
    );
    lastMessageEnded = false;
  }
  if (overwrite && lastMessage.length > 0) {
    await writeAsync(`\x1b[${lastMessage.length}D\x1b[K`);
  }
  await writeAsync(`\x1b[${LOG_COLORS[level]}m${message}\x1b[0m`);
  lastMessage = message;
  if (end) {
    await writeAsync('\n');
    lastMessage = '';
    lastMessageEnded = true;
  }
}

const writeProgress = (message, options) =>
  lock.acquire('writeProgress', () => writeProgressUnsafe(message, options));

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

exports.writeProgress = writeProgress;
exports.errorStockCheckResult = errorStockCheckResult;
exports.outOfStockCheckResult = outOfStockCheckResult;
exports.inStockCheckResult = inStockCheckResult;
