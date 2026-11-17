// A provider change must never look like a market movement.
export function applyFx(state, data, now = Date.now()) {
  const provider = data.provider || 'exchange-rate-api';
  const sameProvider = (state.fx?.provider || 'exchange-rate-api') === provider;
  const nextAt = data.time_last_update_unix * 1000;
  if (data.previousRates && data.previousAt > 0 && data.previousAt * 1000 < nextAt) {
    state.previousRates = data.previousRates;
    state.previousRatesAt = data.previousAt * 1000;
  } else if (!sameProvider) {
    state.previousRates = null;
    state.previousRatesAt = null;
  } else if (state.ratesAt && nextAt > state.ratesAt) {
    state.previousRates = state.rates;
    state.previousRatesAt = state.ratesAt;
  } else if (nextAt < state.ratesAt) {
    state.previousRates = null;
    state.previousRatesAt = null;
  }
  state.rates = data.rates;
  state.ratesAt = nextAt;
  state.fetchedAt = now;
  state.fx = {provider, frequency: data.frequency || 'daily', comparison: data.comparison || 'snapshot',
    central: data.central || state.fx?.central || [], centralStale: data.centralStale ?? true,
    centralCheckedAt: data.centralCheckedAt || null, stale: !!data.stale,
    checkedAt: data.checkedAt || now, refreshAfterSeconds: data.refreshAfterSeconds || 3600,
    fallback: !data.provider, retryAt: data.retryAt || null};
}

export function fxPollMilliseconds(state) {
  const seconds = Number(state.fx?.refreshAfterSeconds);
  return Number.isFinite(seconds) ? Math.min(300, Math.max(60, seconds)) * 1000 : 300000;
}
