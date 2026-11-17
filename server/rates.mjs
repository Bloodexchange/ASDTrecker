import {fetchProvider, normalizeOpenRates, ratesConfig} from './rate-providers.mjs';

export const ratesSchema = `CREATE TABLE IF NOT EXISTS exchange_snapshots (provider TEXT NOT NULL, quoted_at BIGINT NOT NULL, payload JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(provider,quoted_at));`;

export function createRatesService(pool, {config = ratesConfig(), fetcher = fetch} = {}) {
  const cacheKey = `combined-v2:${config.provider}:${config.interval}`;
  let pending;
  const latest = async db => (await db.query('SELECT payload,fetched_at FROM exchange_snapshots WHERE provider=$1 ORDER BY fetched_at DESC LIMIT 1', [cacheKey])).rows[0];
  const cached = row => {if(row.payload.unavailable)throw Error('RATES_UNAVAILABLE');return {...row.payload, cached: true};};
  const fresh = row => row && Date.now() < Number(row.payload.retryAt);

  async function refresh() {
    const row = await latest(pool);
    if (fresh(row)) return cached(row);
    const db = await pool.connect();
    let complete = false;
    try {
      await db.query('BEGIN');
      // A shared lock prevents visitors on different Vercel instances spending duplicate API quota.
      // Transaction-scoped locks also work with Neon's pooled connection endpoint.
      const locked = (await db.query('SELECT pg_try_advisory_xact_lock(15112026,$1) AS locked', [config.lockId])).rows[0].locked;
      if (!locked) {
        const existing = await latest(db);
        if (existing) return {...cached(existing), refreshing: true};
        throw Error('RATES_REFRESHING');
      }
      const again = await latest(db);
      if (fresh(again)) return cached(again);
      const old = (await db.query('SELECT payload,quoted_at FROM exchange_snapshots WHERE provider=$1 ORDER BY quoted_at DESC LIMIT 2', [config.provider])).rows;
      let current, unavailable = false;
      try { current = await fetchProvider(config, fetcher); } catch { unavailable = true; }
      if (!current && old[0]) current = old[0].payload.result ? normalizeOpenRates(old[0].payload) : old[0].payload;
      if (!current) {
        await db.query('INSERT INTO exchange_snapshots(provider,quoted_at,payload) VALUES($1,0,$2) ON CONFLICT(provider,quoted_at) DO UPDATE SET payload=$2,fetched_at=now()', [cacheKey, JSON.stringify({unavailable:true,retryAt:Date.now()+300000})]);
        complete = true;
        throw Error('RATES_UNAVAILABLE');
      }
      if (!unavailable) await db.query('INSERT INTO exchange_snapshots(provider,quoted_at,payload) VALUES($1,$2,$3) ON CONFLICT(provider,quoted_at) DO NOTHING', [config.provider, current.time_last_update_unix, JSON.stringify(current)]);
      const previous = old.find(item => Number(item.quoted_at) < current.time_last_update_unix)?.payload;
      const centralRow = (await db.query("SELECT payload,fetched_at FROM exchange_snapshots WHERE provider='cbu-v2' ORDER BY fetched_at DESC LIMIT 1")).rows[0];
      let central = centralRow?.payload?.central || [], centralCheckedAt = centralRow?.payload?.checkedAt || null, centralStale = false;
      if (!centralRow || Date.now() - new Date(centralRow.fetched_at).getTime() >= 3600000) {
        try {
          const response = await fetcher('https://cbu.uz/ru/arkhiv-kursov-valyut/json/', {signal: AbortSignal.timeout(8000), redirect: 'error'});
          if (!response.ok) throw Error('CBU_UNAVAILABLE');
          const input = await response.json();
          if (!Array.isArray(input) || !input.length) throw Error('CBU_UNAVAILABLE');
          central = input.filter(x => /^[A-Z]{3}$/.test(x.Ccy) && Number(x.Rate) > 0 && Number(x.Nominal) > 0 && Number.isFinite(Number(x.Diff))).map(x => ({currency: x.Ccy, name: x.CcyNm_RU, rate: Number(x.Rate) / Number(x.Nominal), previous: (Number(x.Rate) - Number(x.Diff)) / Number(x.Nominal), date: x.Date}));
          if (!central.length) throw Error('CBU_UNAVAILABLE');
          centralCheckedAt = Date.now();
          await db.query("INSERT INTO exchange_snapshots(provider,quoted_at,payload) VALUES('cbu-v2',0,$1) ON CONFLICT(provider,quoted_at) DO UPDATE SET payload=$1,fetched_at=now()", [JSON.stringify({central, checkedAt: centralCheckedAt})]);
        } catch { centralStale = true; }
      }
      const checkedAt = Date.now();
      const result = {result: 'success', base_code: 'USD', rates: current.rates, time_last_update_unix: current.time_last_update_unix,
        time_next_update_unix: current.time_next_update_unix, previousRates: current.previousRates || previous?.rates || null,
        previousAt: current.previousAt || previous?.time_last_update_unix || null, comparison: current.previousRates ? 'previous-close' : 'snapshot',
        central, centralCheckedAt, centralStale, checkedAt, stale: unavailable, frequency: config.frequency, provider: config.provider,
        refreshAfterSeconds: config.interval, retryAt: checkedAt + (unavailable ? Math.max(300, config.interval) : config.interval) * 1000,
        sources: [config.provider === 'currencyapi' ? 'CurrencyAPI' : 'ExchangeRate-API', 'Центральный банк Узбекистана']};
      await db.query('INSERT INTO exchange_snapshots(provider,quoted_at,payload) VALUES($1,0,$2) ON CONFLICT(provider,quoted_at) DO UPDATE SET payload=$2,fetched_at=now()', [cacheKey, JSON.stringify(result)]);
      await db.query('DELETE FROM exchange_snapshots WHERE provider=$1 AND quoted_at < COALESCE((SELECT quoted_at FROM exchange_snapshots WHERE provider=$1 ORDER BY quoted_at DESC OFFSET 31 LIMIT 1),0)', [config.provider]);
      complete = true;
      return result;
    } finally {
      let destroy = false;
      try { await db.query(complete ? 'COMMIT' : 'ROLLBACK'); } catch { destroy = true; }
      db.release(destroy);
    }
  }
  return () => {
    if (!pending) pending = refresh().finally(() => { pending = null; });
    return pending;
  };
}
