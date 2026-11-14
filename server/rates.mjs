export const ratesSchema=`CREATE TABLE IF NOT EXISTS exchange_snapshots (provider TEXT NOT NULL, quoted_at BIGINT NOT NULL, payload JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(provider,quoted_at));`;
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw Error('RATES_UNAVAILABLE');return r.json();}
export function createRatesService(pool){return async()=>{
 const recent=await pool.query("SELECT payload FROM exchange_snapshots WHERE provider='combined' AND fetched_at>now()-interval '1 hour' ORDER BY fetched_at DESC LIMIT 1");if(recent.rows[0])return {...recent.rows[0].payload,cached:true};
 const old=await pool.query("SELECT payload,quoted_at FROM exchange_snapshots WHERE provider='exchange-rate-api' ORDER BY quoted_at DESC LIMIT 2");
 const [globalResult,centralResult]=await Promise.allSettled([json('https://open.er-api.com/v6/latest/USD'),json('https://cbu.uz/ru/arkhiv-kursov-valyut/json/')]);
 let current=globalResult.status==='fulfilled'?globalResult.value:null;
 const fresh=!!(current?.result==='success'&&current.base_code==='USD'&&current.rates?.USD===1&&Number.isFinite(current.time_last_update_unix));
 if(!fresh)current=old.rows[0]?.payload;if(!current)throw Error('RATES_UNAVAILABLE');
 if(fresh)await pool.query("INSERT INTO exchange_snapshots(provider,quoted_at,payload) VALUES('exchange-rate-api',$1,$2) ON CONFLICT(provider,quoted_at) DO NOTHING",[current.time_last_update_unix,JSON.stringify(current)]);
 const previous=old.rows.find(row=>Number(row.quoted_at)<current.time_last_update_unix)?.payload||null;
 const central=centralResult.status==='fulfilled'&&Array.isArray(centralResult.value)?centralResult.value.filter(x=>/^[A-Z]{3}$/.test(x.Ccy)&&Number(x.Rate)>0&&Number(x.Nominal)>0&&Number.isFinite(Number(x.Diff))).map(x=>({currency:x.Ccy,name:x.CcyNm_RU,rate:Number(x.Rate)/Number(x.Nominal),previous:(Number(x.Rate)-Number(x.Diff))/Number(x.Nominal),date:x.Date})):[];
 const result={result:'success',base_code:'USD',rates:current.rates,time_last_update_unix:current.time_last_update_unix,time_next_update_unix:current.time_next_update_unix,previousRates:previous?.rates||null,previousAt:previous?.time_last_update_unix||null,central,checkedAt:Date.now(),stale:!fresh,frequency:'daily',sources:['ExchangeRate-API','Центральный банк Узбекистана']};
 if(fresh)await pool.query("INSERT INTO exchange_snapshots(provider,quoted_at,payload) VALUES('combined',$1,$2) ON CONFLICT(provider,quoted_at) DO UPDATE SET payload=$2,fetched_at=now()",[current.time_last_update_unix,JSON.stringify(result)]);
 return result;
};}
