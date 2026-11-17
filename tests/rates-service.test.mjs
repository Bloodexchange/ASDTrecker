import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {createRatesService,ratesSchema} from '../server/rates.mjs';

test('Neon rates cache: deduplication, daily baseline, stale fallback, key isolation and lock release',async()=>{
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('sslmode','verify-full');
 // Test-only schema; never writes app users, finance records or production quote snapshots.
 const schema='rates_test_'+crypto.randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:url.toString(),max:1});
 let pool;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const direct=new URL(url);direct.hostname=direct.hostname.replace('-pooler.','.');
  pool=new Pool({connectionString:direct.toString(),options:`-c search_path=${schema}`,max:3});
  await pool.query(ratesSchema);
  const config={provider:'currencyapi',key:'test-only-not-a-real-key',interval:60,frequency:'intraday',lockId:100000+crypto.randomInt(1000000)};
  let requests=0,fail=false;
  const fetcher=async(url,options)=>{
   if(url.includes('currencyapi.com')){requests++;assert.equal(options.headers.apikey,config.key);if(fail)return{ok:false};return{ok:true,json:async()=>({meta:{base_currency:'USD',last_updated_at:'2026-01-15T12:00:00Z',change_since:'2026-01-14T23:59:59Z'},data:{USD:{value:1,change:0},EUR:{value:.9,change:-.1},UZS:{value:12100,change:100}}})};}
   return{ok:true,json:async()=>[{Ccy:'USD',Rate:'12100',Diff:'100',Nominal:'1',Date:'15.01.2026'}]};
  };
  const service=createRatesService(pool,{config,fetcher});
  const responses=await Promise.all(Array.from({length:8},()=>service()));
  assert.equal(requests,1);assert.equal(responses[0].previousRates.UZS,12000);assert.equal(responses[0].frequency,'intraday');
  assert.equal((await createRatesService(pool,{config,fetcher})()).cached,true);assert.equal(requests,1);
  const expire=()=>pool.query("UPDATE exchange_snapshots SET payload=jsonb_set(payload,'{retryAt}','0') WHERE provider LIKE 'combined-v2:%'");
  await expire();fail=true;
  const stale=await service();assert.equal(stale.stale,true);assert.equal(stale.rates.UZS,12100);assert.equal(requests,2);
  await service();assert.equal(requests,2);
  const stored=JSON.stringify((await pool.query('SELECT payload FROM exchange_snapshots')).rows);assert.ok(!stored.includes(config.key));
  await pool.query('TRUNCATE exchange_snapshots');
  await assert.rejects(service,/RATES_UNAVAILABLE/);const calls=requests;
  await assert.rejects(service,/RATES_UNAVAILABLE/);assert.equal(requests,calls);
  await expire();fail=false;assert.equal((await service()).stale,false);
  // A different provider gets its own cache and baseline.
  const open=createRatesService(pool,{config:{provider:'exchange-rate-api',interval:3600,frequency:'daily',lockId:config.lockId+1},fetcher:async url=>url.includes('open.er-api')?{ok:true,json:async()=>({result:'success',base_code:'USD',rates:{USD:1,UZS:12200},time_last_update_unix:1768482000})}:fetcher(url,{})});
  assert.equal((await open()).previousRates,null);
 } finally {
  if(pool)await pool.end();
  // schema is generated above, with only a fixed prefix and hexadecimal suffix.
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
 }
});
