const { stdout } = require('process');
const { format } = require('date-fns');
const AsyncLock = require('async-lock');

const lock = new AsyncLock();

const print = (data) => new Promise((resolve) => stdout.write(data, resolve));

const LOG_DATE_COLORS = {
  info: '37',
  warning: '33',
  error: '31',
};

const LOG_COLORS = {
  info: '0',
  warning: '93',
  error: '91',
};

const printProgressUnsafe = (
  message,
  { end = true, level = 'info' } = {},
  resolvePrint,
  rejectPrint
) =>
  new Promise(async (resolve, reject) => {
    try {
      await print(
        `\x1b[${LOG_DATE_COLORS[level]}m[` + format(new Date(), 'yyyy-MM-dd HH:mm:ss') + ']\x1b[0m '
      );
      await print(`\x1b[${LOG_COLORS[level]}m${message}\x1b[0m`);

      if (end) {
        await print('\n');
        resolvePrint();
        resolve();
        return;
      }
    } catch (e) {
      rejectPrint(e);
      reject(e);
      return;
    }

    let lastMessage = '';
    resolvePrint((message, { end = false } = {}) =>
      lock.acquire('updateProgress', async () => {
        try {
          if (lastMessage.length > 0) {
            await print(`\x1b[${lastMessage.length}D\x1b[K`);
          }
          await print(`\x1b[${LOG_COLORS[level]}m${message}\x1b[0m`);
          lastMessage = message;

          if (end) {
            await print('\n');
            lastMessage = '';
            resolve();
          }
        } catch (e) {
          reject(e);
        }
      })
    );
  });

const printProgress = (message, options) => {
  let resolvePrint = null;
  let rejectPrint = null;
  const promise = new Promise((resolve, reject) => {
    resolvePrint = resolve;
    rejectPrint = reject;
  });

  lock.acquire('printProgress', () =>
    printProgressUnsafe(message, options, resolvePrint, rejectPrint)
  );

  return promise;
};

exports.printProgress = printProgress;
