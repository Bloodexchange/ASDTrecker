import {locale} from './language.js';
import {request} from './cloud.js';
import {percentage} from './core.js';
import {fxPollMilliseconds} from './fx-state.js';
export async function fetchFx(){return request('/api/rates');}
export function setupFxUI({getState,modal,toast,isDemo,refresh}){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:6}).format(n);
 const date=n=>n?new Date(n).toLocaleString(locale()):'ещё не было';
 const change=p=>`<span class="${p===null?'muted':p>=0?'positive':'negative'}">${p===null?'—':(p>0?'+':'')+p.toFixed(2)+'%'}</span>`;
 const favorites=['USD','EUR','RUB','KZT','GBP','CNY','AED','JPY','UZS'];
 let query='';
 const matches=c=>query?c.includes(query):favorites.includes(c);
 function rows(){
  const s=getState(),fx=s.fx||{},previous=s.previousRates||{};
  const central=(fx.central||[]).filter(c=>matches(c.currency)).sort((a,b)=>a.currency.localeCompare(b.currency));
  const world=Object.keys(s.rates).filter(c=>c!==s.currency&&matches(c)).sort();
  return `<h3>К суму · Центральный банк Узбекистана</h3><small>Рост означает, что 1 единица валюты стоит больше сумов. Официальные курсы обновляются ежедневно.</small>${fx.centralStale?'<div class="notice">Обновление ЦБ недоступно. Сверьте дату сохранённых котировок.</div>':''}${central.length?central.map(c=>`<div class="fx-row"><div><strong>${esc(c.currency)}</strong><small>${esc(c.date)}</small></div><b>${fmt(c.rate)} сум</b>${change(percentage(c.rate,c.previous))}</div>`).join(''):'<div class="notice">Нет котировок ЦБ для выбранного фильтра.</div>'}<small>Изменение относительно предыдущего официального курса. Банковский курс покупки и продажи может отличаться.</small><div class="section-divider"></div><h3>Мировые валюты · 1 ${esc(s.currency)}</h3><small>Котировка: ${date(s.ratesAt)}</small>${world.length?world.map(c=>{const current=s.rates[c]&&s.rates[s.currency]?s.rates[c]/s.rates[s.currency]:null;const prev=previous[c]&&previous[s.currency]?previous[c]/previous[s.currency]:null;return `<div class="fx-row"><strong>${esc(c)}</strong><b>${current===null?'нет курса':fmt(current)}</b>${change(percentage(current,prev))}</div>`;}).join(''):'<div class="notice">Нет загруженных курсов для выбранного фильтра.</div>'}<small>${fx.comparison==='previous-close'?'Изменение относительно закрытия предыдущего дня у того же источника':'Изменение между двумя последними полученными котировками одного источника'}. ${s.previousRatesAt?'База сравнения: '+date(s.previousRatesAt):'Предыдущей котировки пока нет — показано «—»'}. Рост означает, что за 1 ${esc(s.currency)} можно получить больше указанной валюты.</small>`;
 }
 function status(){
  const s=getState(),fx=s.fx||{},minutes=Math.round((fx.refreshAfterSeconds||3600)/60);
  const old=s.ratesAt&&Date.now()-s.ratesAt>(fx.frequency==='intraday'?Math.max(180000,fx.refreshAfterSeconds*3000):172800000);
  return `<p class="privacy-copy">${fx.frequency==='intraday'?`Проверка новых котировок каждые ${minutes} мин. Частота публикации зависит от тарифа источника; время фактической котировки указано ниже.`:'Справочные курсы обновляются источниками ежедневно. Проверка приложения не ускоряет публикацию котировок.'}</p><div class="source"><span>Источник: ${fx.provider==='currencyapi'?'CurrencyAPI':'ExchangeRate-API'}<br>Проверка источника: ${date(fx.checkedAt)}<br>Получено приложением: ${date(s.fetchedAt)}</span></div>${fx.stale||fx.fallback?'<div class="notice" role="status">Основной источник недоступен. Показаны сохранённые или резервные ежедневные курсы.</div>':''}${old?'<div class="notice">Котировка давно не обновлялась. Это может быть связано с выходными, тарифом или недоступностью источника.</div>':''}`;
 }
 function update(){if(!document.querySelector('#fx-content'))return;document.querySelector('#fx-status').innerHTML=status();document.querySelector('#fx-rows').innerHTML=rows();}
 function show(){
  if(isDemo()){toast('В демо показаны вымышленные курсы');return;}
  query='';modal('Курсы и изменения',`<div id="fx-content"><div id="fx-status">${status()}</div><div class="hero-bottom"><button class="btn primary" data-action="fx-refresh">Обновить сейчас</button></div><div class="field section-space"><label for="fx-search">Найти валюту по коду</label><input id="fx-search" placeholder="Например, USD, UZS или TRY" maxlength="3" autocomplete="off" autocapitalize="characters"></div><div class="section-divider"></div><div id="fx-rows">${rows()}</div><div class="source"><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">ExchangeRate-API</a><a href="https://currencyapi.com" target="_blank" rel="noopener">CurrencyAPI</a><a href="https://cbu.uz/ru/arkhiv-kursov-valyut/" target="_blank" rel="noopener">ЦБ Узбекистана</a></div></div>`);
 }
 const decorate=()=>{const footer=document.querySelector('main>footer.source');if(footer&&!footer.querySelector('[data-action=fx-open]')){const b=document.createElement('button');b.dataset.action='fx-open';b.className='link-btn';b.textContent='Курсы ↗ и ↘';footer.prepend(b);}if(document.querySelector('#modal-title')?.dataset.ruTitle==='Ваше пространство'&&!document.querySelector('#fx-settings')){const d=document.createElement('div');d.id='fx-settings';d.className='settings-row';d.innerHTML='<div><strong>Курсы и изменения</strong><small>Проценты роста и снижения, дата котировки</small></div><button class="btn small" data-action="fx-open">Смотреть</button>';document.querySelector('.modal-header').after(d);}};
 const observer=new MutationObserver(decorate);observer.observe(document.querySelector('#app'),{childList:true});observer.observe(document.querySelector('#modal-root'),{childList:true});decorate();
 document.addEventListener('input',e=>{if(e.target.id==='fx-search'){query=e.target.value.toUpperCase().replace(/[^A-Z]/g,'');document.querySelector('#fx-rows').innerHTML=rows();}});
 let pollTimer;
 const schedule=()=>{clearTimeout(pollTimer);pollTimer=setTimeout(tick,fxPollMilliseconds(getState()));};
 document.addEventListener('rates-updated',()=>{update();schedule();});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(b?.dataset.action==='fx-open'){show();await refresh(false);update();}if(b?.dataset.action==='fx-refresh'){b.disabled=true;try{await refresh(true);update();}finally{b.disabled=false;}}});
 async function tick(){if(!document.hidden&&navigator.onLine&&!isDemo()){await refresh(false);update();}schedule();}
 schedule();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine&&!isDemo())refresh(false);});
}
