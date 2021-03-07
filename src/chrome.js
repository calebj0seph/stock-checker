const puppeteer = require('puppeteer');

const { loadConfig } = require('./file-system');

const flattenHeaders = (headersRaw) =>
  Object.keys(headersRaw).reduce((acc, key) => {
    const { url, ...headers } = headersRaw[key];
    if (Object.keys(headers).length > 0) {
      acc[url] = headers;
    }
    return acc;
  }, {});

async function setupLoggingOfAllNetworkData(page) {
  const cdpSession = await page.target().createCDPSession();
  await cdpSession.send('Network.enable');
  const headerData = {};
  cdpSession.on('Network.requestWillBeSent', (request) => {
    headerData[request.requestId] = {
      ...headerData[request.requestId],
      url: request.request.url,
    };
  });
  cdpSession.on('Network.requestWillBeSentExtraInfo', (request) => {
    headerData[request.requestId] = {
      ...headerData[request.requestId],
      ...Object.keys(request.headers)
        .filter((header) =>
          [
            'cookie',
            'user-agent',
            'accept',
            'accept-language',
            'sec-ch-ua',
            'sec-ch-ua-mobile',
            'sec-fetch-dest',
            'sec-fetch-mode',
            'sec-fetch-site',
            'sec-fetch-user',
            'upgrade-insecure-requests',
          ].includes(header)
        )
        .reduce((acc, header) => {
          acc[header] = request.headers[header];
          return acc;
        }, {}),
    };
  });
  return [
    headerData,
    async () => {
      await cdpSession.send('Network.disable');
      await cdpSession.detach();
    },
  ];
}

async function openChromeBrowser() {
  const config = await loadConfig();

  // Open Chrome with the given command and arguments
  return await puppeteer.launch({
    executablePath: config.chrome.path,
    args: config.chrome.args,
  });
}

async function getChromeHeadersForUrl(url, browser, userAgent) {
  // Change the user agent and set additional headers
  const page = await browser.newPage();
  const version = (await browser.version()).match(/Chrome\/(\d+)\./)[1];
  await page.setUserAgent((await browser.userAgent()).replace('Headless', ''));
  await page.setExtraHTTPHeaders({
    'sec-ch-ua': `"Chromium";v="${version}", "Google Chrome";v="${version}", ";Not A Brand";v="99"`,
    'sec-ch-ua-mobile': '?0',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  });

  // Visit the given URL to refresh our headers
  await page.goto(url, {
    waitUntil: 'networkidle2',
  });

  // Visit the page a second time and capture the headers
  const [headerDataRaw, cleanup] = await setupLoggingOfAllNetworkData(page);
  await page.goto(url, {
    waitUntil: 'networkidle2',
  });
  await cleanup();
  await page.close();

  // Return the headers
  return flattenHeaders(headerDataRaw)[url];
}

exports.openChromeBrowser = openChromeBrowser;
exports.getChromeHeadersForUrl = getChromeHeadersForUrl;
