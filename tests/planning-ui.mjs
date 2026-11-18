// Browser check for transfers, recurring operations, budget alerts and the month forecast (RU, then EN and UZ).
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4178',shots=process.env.SCREENSHOT_DIR||'artifacts';fs.mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
const seed={version:1,currency:'UZS',rates:{USD:1,UZS:12500},ratesAt:Date.parse('2026-11-18T08:00:00Z'),fetchedAt:Date.parse('2026-11-18T08:00:00Z'),motion:false,hidden:false,goals:[],transfers:[],recurring:[],
 accounts:[{id:'uzum',name:'Main card',bank:'Uzum Bank',currency:'UZS',opening:500000000},{id:'cash',name:'Wallet',bank:'Cash',currency:'UZS',opening:0}],
 budgets:[{id:'food',category:'food',limit:100000000,currency:'UZS'}],
 transactions:[{id:'a',type:'expense',amount:70000000,currency:'UZS',account:'uzum',accountAmount:70000000,category:'food',note:'Groceries',date:'2026-11-03',usdValue:56}]};
const errors=[];
async function open(lang){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/api/**',route=>route.fulfill({status:404,json:{error:'NOT_FOUND'}}));await context.route('https://open.er-api.com/**',route=>route.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-18T09:00:00')});
 await page.addInitScript(([s,l])=>{if(!localStorage.getItem('asdtrecker.preview.v1'))localStorage.setItem('asdtrecker.preview.v1',s);localStorage.setItem('asdtrecker.language',l);},[JSON.stringify(seed),lang]);
 await page.goto(base);await page.waitForSelector('h1');return {page,context};
}
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('asdtrecker.preview.v1')));
const click=(page,action)=>page.locator(`[data-action="${action}"]:visible`).first().click();
const nav=(page,id)=>page.locator(`[data-action=nav][data-id=${id}]:visible`).first().click();
const closed=page=>page.waitForSelector('.modal',{state:'detached'});

{ // Russian: full flow
 const {page,context}=await open('ru');
 await nav(page,'wallets');await click(page,'transfer-add');
 await page.locator('#transfer-amount').fill('500000');await page.locator('#transfer-note').fill('Снял наличные');await page.locator('#transfer-form [type=submit]').click();await closed(page);
 let s=await state(page);assert.equal(s.transfers.length,1);assert.equal(s.transfers[0].from,'uzum');assert.equal(s.transfers[0].to,'cash');assert.equal(s.transfers[0].toAmount,50000000);assert.equal(s.transactions.length,1,'a transfer is not a transaction');
 await page.getByText('Uzum Bank → Cash').first().waitFor();
 await page.screenshot({path:`${shots}/wallets-ru.png`,fullPage:true});

 await nav(page,'plans');await click(page,'recurring-add');
 await page.locator('#recurring-note').fill('Аренда');await page.locator('#recurring-category').selectOption('home');await page.locator('#recurring-amount').fill('3000000');await page.locator('#recurring-start').fill('2026-09-05');
 await page.locator('#recurring-form [type=submit]').click();await closed(page);
 s=await state(page);assert.equal(s.recurring.length,1);assert.equal(s.recurring[0].done,3);assert.deepEqual(s.transactions.filter(t=>t.recurring).map(t=>t.date),['2026-09-05','2026-10-05','2026-11-05']);
 await page.locator('#recurring-section').getByText('Каждый месяц · Следующая').waitFor();

 await click(page,'recurring-add');await page.locator('#recurring-note').fill('Зарплата');await page.locator('#recurring-category').selectOption('salary');await page.locator('#recurring-amount').fill('9000000');await page.locator('#recurring-start').fill('2026-11-25');await page.locator('#recurring-form [type=submit]').click();await closed(page);
 s=await state(page);assert.equal(s.recurring[1].type,'income');assert.equal(s.recurring[1].done,0);
 // pause and resume
 await page.locator('#recurring-section [data-action=recurring-edit]').first().click();await click(page,'recurring-toggle');await page.getByRole('button',{name:'Возобновить'}).waitFor();await click(page,'close');await closed(page);
 assert.equal((await state(page)).recurring[0].paused,true);

 // budget alert: 700 000 + 150 000 = 85% of 1 000 000
 await nav(page,'overview');await click(page,'add-expense');await page.locator('#amount').fill('150000');await page.locator('#tx-note').fill('Продукты');await page.locator('#transaction-form [type=submit]').click();await closed(page);
 await page.locator('#toast').getByText('Бюджет почти исчерпан').waitFor({timeout:5000});
 await page.locator('.budget-alert').getByText('Бюджет почти исчерпан').waitFor();
 // a second save in the same level must not alert again
 await click(page,'add-expense');await page.locator('#amount').fill('1000');await page.locator('#tx-note').fill('Хлеб');await page.locator('#transaction-form [type=submit]').click();await closed(page);
 await page.waitForTimeout(1600);assert.doesNotMatch(await page.locator('#toast').textContent(),/Бюджет/);

 const forecast=page.locator('.forecast');await forecast.getByText('Прогноз на конец месяца').waitFor();
 const text=await forecast.innerText();assert.match(text,/12 дней осталось/);assert.match(text,/Регулярные доходы до конца месяца/);
 await page.screenshot({path:`${shots}/overview-ru.png`,fullPage:true});
 await nav(page,'history');await page.locator('#history-type').selectOption('transfer');assert.equal(await page.locator('.page [data-action=transfer-detail]').count(),1);assert.equal(await page.locator('.page [data-action=detail]').count(),0);
 await page.locator('.page [data-action=transfer-detail]').click();await click(page,'transfer-delete');await click(page,'delete-confirm');await closed(page);assert.equal((await state(page)).transfers.length,0);
 // settings row exists
 await click(page,'settings');await page.locator('[data-action=budget-notify]').waitFor();await click(page,'close');
 // mobile layout
 await page.setViewportSize({width:390,height:844});await nav(page,'overview');await page.waitForTimeout(300);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal scroll at 390px');
 await page.screenshot({path:`${shots}/overview-mobile.png`,fullPage:true});
 await nav(page,'plans');await page.screenshot({path:`${shots}/plans-mobile.png`,fullPage:true});
 await context.close();
}

// English and Uzbek: no Russian text left in the new screens and dialogs
for(const lang of ['en','uz']){
 const {page,context}=await open(lang);
 const cyrillic=async where=>{const t=await page.locator(where).first().innerText();const m=t.match(/[А-Яа-яЁё][^\n]*/g);assert.equal(m,null,`${lang}: Russian text in ${where}: ${m}`);};
 await nav(page,'wallets');await click(page,'transfer-add');await cyrillic('.modal');await page.locator('#transfer-amount').fill('100000');await page.locator('#transfer-form [type=submit]').click();await closed(page);await cyrillic('#transfer-section');await cyrillic('.heading');
 await page.locator('#transfer-section [data-action=transfer-detail]').first().click();await cyrillic('.modal');await click(page,'close');await closed(page);
 await nav(page,'plans');await cyrillic('#recurring-section');await click(page,'recurring-add');await cyrillic('.modal');
 await page.locator('#recurring-note').fill('Rent');await page.locator('#recurring-category').selectOption('home');await page.locator('#recurring-amount').fill('3000000');await page.locator('#recurring-start').fill('2026-11-05');await page.locator('#recurring-form [type=submit]').click();await closed(page);
 await page.waitForTimeout(300);await cyrillic('#recurring-section');await page.locator('#recurring-section [data-action=recurring-edit]').first().click();await cyrillic('.modal');await click(page,'close');await closed(page);
 await nav(page,'overview');await click(page,'add-expense');await page.locator('#amount').fill('150000');await page.locator('#tx-note').fill('Food');await page.locator('#transaction-form [type=submit]').click();await closed(page);
 await page.waitForTimeout(1500);await cyrillic('#toast');
 await cyrillic('.forecast');await cyrillic('.budget-alert');
 await click(page,'settings');await cyrillic('.modal .settings-row:has([data-action=budget-notify])');
 if(lang==='en')await page.screenshot({path:`${shots}/overview-en.png`,fullPage:true});
 await context.close();
}
await browser.close();
assert.deepEqual(errors,[]);
console.log('PLANNING UI PASS: transfers, recurring catch-up/pause, budget alerts once per level, forecast, history filter, RU/EN/UZ text, 390px layout. No JS errors.');
