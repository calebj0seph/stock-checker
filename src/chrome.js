const puppeteer = require('puppeteer-extra');

const { loadConfig } = require('./file-system');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function openChromeBrowser() {
  const config = await loadConfig();

  // Open Chrome with the given command and arguments
  return await puppeteer.launch({
    executablePath: config.chrome.path,
    args: config.chrome.args,
    defaultViewport: {
      width: 2560,
      height: 1298,
      deviceScaleFactor: 1.5,
    },
  });
}

async function openPage(browser) {
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

  return page;
}

async function navigateAndGetPageSource(url, page) {
  const response = await page.goto(url, {
    waitUntil: 'networkidle2',
  });
  return {
    text: await response.text(),
    ok: response.ok(),
    status: response.status(),
    statusText: response.statusText(),
  };
}

exports.openChromeBrowser = openChromeBrowser;
exports.openPage = openPage;
exports.navigateAndGetPageSource = navigateAndGetPageSource;
