const twilio = require('twilio');
const asyncPool = require('tiny-async-pool');
const AsyncLock = require('async-lock');

const { loadConfig } = require('./file-system');

const MAX_CONCURRENCY = 4;
const LOOKUP_API_COST = 0.005;

const lock = new AsyncLock();

let twilioClient = null;
let serviceSid = null;

async function initialiseTwilioUnsafe() {
  if (twilioClient === null) {
    const config = await loadConfig();
    twilioClient = twilio(config.twilio.apiKeySid, config.twilio.apiKeySecret, {
      accountSid: config.twilio.accountSid,
    });
    serviceSid = config.twilio.serviceSid;
  }
}

const initialiseTwilio = () => lock.acquire('initialiseTwilio', () => initialiseTwilioUnsafe());

const lookupCache = {};

async function lookupNumbersUnsafe(numbers) {
  let cost = 0;
  await asyncPool(
    MAX_CONCURRENCY,
    numbers.filter((number) => !Object.keys(lookupCache).includes(number)),
    async (number) => {
      const result = await twilioClient.lookups.v1
        .phoneNumbers(number)
        .fetch({ type: ['carrier'] });
      lookupCache[number] = {
        countryCode: result.countryCode,
        mcc: result.carrier.mobile_country_code,
        mnc: result.carrier.mobile_network_code,
      };
      cost += LOOKUP_API_COST;
    }
  );

  return {
    lookupData: numbers.reduce((acc, number) => {
      acc[number] = lookupCache[number];
      return acc;
    }, {}),
    cost,
  };
}

const lookupNumbers = (numbers) =>
  lock.acquire('lookupNumbers', () => lookupNumbersUnsafe(numbers));

const notificationCostCache = {};

async function getNotificationCostUnsafe(recipients, recipientMessages) {
  await initialiseTwilio();

  const numbers = Object.keys(recipients)
    .filter((recipient) => recipientMessages.some((message) => message.recipient === recipient))
    .map((recipient) => recipients[recipient].phone);
  const { lookupData: numberLookupData, cost: lookupCost } = await lookupNumbers(numbers);
  const countryCodes = Array.from(
    new Set(Object.values(numberLookupData).map((lookupData) => lookupData.countryCode))
  );

  await asyncPool(
    MAX_CONCURRENCY,
    countryCodes.filter((countryCode) => !Object.keys(notificationCostCache).includes(countryCode)),
    async (countryCode) => {
      const result = await twilioClient.pricing.v1.messaging.countries(countryCode).fetch();
      notificationCostCache[countryCode] = result.outboundSmsPrices;
    }
  );

  return (
    lookupCost +
    recipientMessages.reduce((sum, recipientMessage) => {
      const lookupData = numberLookupData[recipients[recipientMessage.recipient].phone];
      const price = notificationCostCache[lookupData.countryCode]
        .find(
          (costData) =>
            Number(costData.mcc) === Number(lookupData.mcc) &&
            Number(costData.mnc) === Number(lookupData.mnc)
        )
        .prices.find((price) => price.number_type === 'mobile');
      return sum + Number(price.current_price);
    }, 0)
  );
}

const getNotificationCost = (recipients, recipientMessages) =>
  lock.acquire('getNotificationCost', () =>
    getNotificationCostUnsafe(recipients, recipientMessages)
  );

async function notifyRecipients(recipients, recipientMessages) {
  await initialiseTwilio();

  for (const recipientMessage of recipientMessages) {
    await twilioClient.messages.create({
      body: recipientMessage.message,
      from: serviceSid,
      to: recipients[recipientMessage.recipient].phone,
    });
  }
}

exports.getNotificationCost = getNotificationCost;
exports.notifyRecipients = notifyRecipients;
