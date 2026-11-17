const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1e9;

function cleanRates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_RATES');
  const rates = {};
  for (const [code, value] of Object.entries(input)) {
    if (!/^[A-Z]{3}$/.test(code)) continue;
    if (!positive(value)) throw Error('INVALID_RATES');
    rates[code] = value;
  }
  if (rates.USD !== 1 || Object.keys(rates).length < 2 || Object.keys(rates).length > 250) throw Error('INVALID_RATES');
  return rates;
}

function validTime(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > Date.now() / 1000 + 300) throw Error('INVALID_QUOTE_TIME');
  return value;
}

export function normalizeOpenRates(data) {
  if (data?.result !== 'success' || data.base_code !== 'USD') throw Error('INVALID_RATES');
  return {rates: cleanRates(data.rates), time_last_update_unix: validTime(data.time_last_update_unix),
    time_next_update_unix: Number.isFinite(data.time_next_update_unix) ? data.time_next_update_unix : null};
}

export function normalizeCurrencyApi(data) {
  if (!data?.data || (data.meta?.base_currency && data.meta.base_currency !== 'USD')) throw Error('INVALID_RATES');
  const rates = {USD: 1}, previousRates = {USD: 1};
  const at = validTime(Date.parse(data.meta?.last_updated_at) / 1000);
  const previousAt = Date.parse(data.meta?.change_since) / 1000;
  for (const [code, item] of Object.entries(data.data)) {
    if (!/^[A-Z]{3}$/.test(code)) continue;
    rates[code] = item?.value;
    if (typeof item?.change === 'number' && Number.isFinite(item.change) && positive(item.value - item.change)) previousRates[code] = item.value - item.change;
  }
  const hasBaseline = Number.isSafeInteger(previousAt) && previousAt > 0 && previousAt < at && Object.keys(previousRates).length > 1;
  return {rates: cleanRates(rates), time_last_update_unix: at, time_next_update_unix: null,
    previousRates: hasBaseline ? previousRates : null, previousAt: hasBaseline ? previousAt : null,
    comparison: hasBaseline ? 'previous-close' : 'snapshot'};
}

export function ratesConfig(env = process.env) {
  const key = env.CURRENCYAPI_KEY?.trim();
  const interval = Number(env.CURRENCYAPI_INTERVAL_SECONDS || 86400);
  if (key && ![60, 900, 3600, 86400].includes(interval)) throw Error('INVALID_RATE_INTERVAL');
  return key ? {provider: 'currencyapi', key, interval, frequency: interval < 86400 ? 'intraday' : 'daily', lockId: 2}
    : {provider: 'exchange-rate-api', interval: 3600, frequency: 'daily', lockId: 1};
}

export async function fetchProvider(config, fetcher = fetch) {
  const currencyApi = config.provider === 'currencyapi';
  const url = currencyApi ? 'https://api.currencyapi.com/v3/latest?base_currency=USD&type=fiat&include=change' : 'https://open.er-api.com/v6/latest/USD';
  const response = await fetcher(url, {headers: currencyApi ? {apikey: config.key} : {}, signal: AbortSignal.timeout(12000), redirect: 'error'});
  if (!response.ok) throw Error('RATES_UNAVAILABLE');
  return (currencyApi ? normalizeCurrencyApi : normalizeOpenRates)(await response.json());
}
