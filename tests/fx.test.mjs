import test from 'node:test';import assert from 'node:assert/strict';
import {percentage} from '../web/core.js';
import {freshState} from '../web/core.js';
import {applyFx,fxPollMilliseconds} from '../web/fx-state.js';
import {normalizeCurrencyApi,normalizeOpenRates,ratesConfig,fetchProvider} from '../server/rate-providers.mjs';

const quote=()=>({meta:{base_currency:'USD',last_updated_at:'2026-01-15T12:00:00Z',change_since:'2026-01-14T23:59:59Z'},data:{USD:{value:1,change:0},EUR:{value:.9,change:-.1},UZS:{value:12100,change:100}}});
test('cross-currency daily percentage uses both legs of the same baseline',()=>{
 const q=normalizeCurrencyApi(quote());
 assert.equal(q.previousRates.UZS,12000);assert.equal(q.previousRates.EUR,1);
 assert.ok(Math.abs(percentage(q.rates.UZS/q.rates.EUR,q.previousRates.UZS/q.previousRates.EUR)-12.037037037)<1e-8);
 assert.equal(q.comparison,'previous-close');
});
test('provider data rejects invalid quotes and never invents missing changes',()=>{
 const q=quote();delete q.data.EUR.change;assert.equal(normalizeCurrencyApi(q).previousRates.EUR,undefined);
 delete q.meta.change_since;assert.equal(normalizeCurrencyApi(q).previousRates,null);
 q.data.UZS.value=-1;assert.throws(()=>normalizeCurrencyApi(q));
 assert.throws(()=>normalizeOpenRates({result:'success',base_code:'USD',rates:{USD:1,EUR:0},time_last_update_unix:1000}));
});
test('client clears comparisons on provider changes and reports fallback explicitly',()=>{
 const s=freshState();applyFx(s,{...normalizeCurrencyApi(quote()),provider:'currencyapi',frequency:'intraday',refreshAfterSeconds:60},100);
 assert.equal(fxPollMilliseconds(s),60000);
 applyFx(s,{result:'success',rates:{USD:1,EUR:.92},time_last_update_unix:1768482000},200);
 assert.equal(s.previousRates,null);assert.equal(s.fx.provider,'exchange-rate-api');assert.equal(s.fx.fallback,true);assert.equal(s.fx.frequency,'daily');
});
test('paid source is opt-in and credentials stay in HTTPS headers',async()=>{
 assert.equal(ratesConfig({}).provider,'exchange-rate-api');assert.equal(ratesConfig({CURRENCYAPI_KEY:'test'}).interval,86400);
 assert.throws(()=>ratesConfig({CURRENCYAPI_KEY:'test',CURRENCYAPI_INTERVAL_SECONDS:'1'}));
 const config=ratesConfig({CURRENCYAPI_KEY:'test-secret-only',CURRENCYAPI_INTERVAL_SECONDS:'60'});
 const result=await fetchProvider(config,async(url,options)=>{assert.ok(!url.includes(config.key));assert.equal(options.headers.apikey,config.key);assert.equal(options.redirect,'error');return{ok:true,json:async()=>quote()};});
 assert.ok(!JSON.stringify(result).includes(config.key));
});
test('percent movement handles gains, losses, missing/zero baseline and CBU absolute difference',()=>{assert.equal(percentage(105,100),5);assert.equal(percentage(95,100),-5);assert.equal(percentage(12000,12000),0);assert.equal(percentage(10,0),null);assert.equal(percentage(10,null),null);assert.equal(percentage(NaN,10),null);const current=12000,difference=-60;assert.ok(Math.abs(percentage(current,current-difference)-(-.4975124378))<.00001);});
