# stock-checker
Node.js service that periodically checks if products from online stores are in
stock. Sends notifications when items come back in stock via SMS using Twilio.

## Prerequisites
* Node.js
* npm
* Google Chrome (or any Chromium-based browser)
  * `stock-checker` uses Puppeteer to open product pages and read their
    contents. Although Puppeteer's bundled Chromium *could* be used, this will
    likely fail on some websites due to bot prevention mechanisms. Using a
    local instance of Chrome that you use for your daily browsing means that
    the traffic generated by `stock-checker` will be virtually
    indistinguishable from organic traffic.
* A Twilio account

## Getting started
1. Clone the repository.
2. `npm install`
3. Copy the `data.example` directory and rename it `data`.
4. In the `data` directory, configure `config.yml`, `products.yml` and
   `recipients.yml` as desired.
   * If you need to add a product from an unsupported website, have a look at
     adding support for it in `src/providers.js`.
5. `npm start`
   * `stock-checker` will check the stock of your defined products every 3 to
     10 minutes, and send out notification SMS messages to defined recipients
     when the stock status changes.
   * Don't delete the `data/lastStockMap.json` file as it is used to store the
     last known stock state. This prevents sending duplicate messages when a
     product comes back in stock.

## Licence
`stock-checker` is provided under the terms of the MIT Licence. See the
[LICENCE](LICENCE) file for details.
