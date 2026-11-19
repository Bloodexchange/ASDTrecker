import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,validateState,accountBalance,stats,demoState} from '../web/core.js';
import {seal,unseal} from '../web/backup.js';
import {occurrence,applyRecurring,rescheduledDone,totalBalance,budgetStatus,pendingBudgetAlerts,markAlerts,monthForecast} from '../web/planning.js';
import {featureTranslations} from '../web/feature-translations.js';

const base=()=>{const s=freshState();s.rates={USD:1,UZS:12500};s.accounts=[{id:'uzum',name:'Карта',bank:'Uzum Bank',currency:'UZS',opening:100000000},{id:'cash',name:'Кошелёк',bank:'Наличные',currency:'UZS',opening:0},{id:'usd',name:'Валюта',bank:'Agrobank',currency:'USD',opening:0}];return s;};
const expense=(id,amount,date,extra={})=>({id,type:'expense',amount,currency:'UZS',account:'uzum',accountAmount:amount,category:'food',note:'Продукты',date,usdValue:amount/100/12500,...extra});
const rule=(extra={})=>({id:'rent',type:'expense',amount:300000000,currency:'UZS',account:'uzum',category:'home',note:'Аренда',frequency:'monthly',start:'2026-09-05',done:0,paused:false,...extra});

test('older data without transfers or recurring keeps loading and is normalised',async()=>{
 const old=freshState();delete old.transfers;delete old.recurring;old.transactions=[expense('a',100000,'2026-11-01',{account:'cash'})];
 const restored=validateState(await unseal(await seal(old,'a-long-test-password-123'),'a-long-test-password-123'));
 assert.deepEqual(restored.transfers,[]);assert.deepEqual(restored.recurring,[]);assert.equal(restored.transactions.length,1);
 validateState(demoState());
});

test('monthly and yearly schedules keep their day and clamp to short months',()=>{
 assert.deepEqual([0,1,2,3].map(n=>occurrence('2026-01-31','monthly',n)),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
 assert.equal(occurrence('2026-12-15','monthly',1),'2027-01-15');
 assert.equal(occurrence('2028-02-29','yearly',1),'2029-02-28');assert.equal(occurrence('2028-02-29','yearly',4),'2032-02-29');
 assert.equal(occurrence('2026-12-29','weekly',1),'2027-01-05');
});

test('transfers move money between own accounts without counting as income or expense',()=>{
 const s=base();s.transfers=[{id:'t1',from:'uzum',to:'cash',amount:50000000,toAmount:50000000,date:'2026-11-10',note:'Снял наличные'},{id:'t2',from:'uzum',to:'usd',amount:12500000,toAmount:1000,date:'2026-11-11',note:''}];
 validateState(s);
 assert.equal(accountBalance(s.accounts[0],s.transactions,s.transfers),37500000);
 assert.equal(accountBalance(s.accounts[1],s.transactions,s.transfers),50000000);
 assert.equal(accountBalance(s.accounts[2],s.transactions,s.transfers),1000);
 assert.equal(stats(s.transactions,'UZS',s.rates).expense,0);
 assert.equal(totalBalance(s).value,1000000);
 for(const bad of [{from:'uzum',to:'uzum'},{to:'missing'},{amount:0},{toAmount:-5},{date:'2026-02-30'},{note:'x'.repeat(161)}])assert.throws(()=>validateState({...s,transfers:[{...s.transfers[0],...bad}]}));
 assert.throws(()=>validateState({...s,transfers:[s.transfers[0],s.transfers[0]]}));
});

test('recurring rules add each due date once, with stable ids, and skip while paused',()=>{
 const s=base();s.recurring=[rule(),rule({id:'salary',type:'income',category:'salary',amount:900000000,note:'Зарплата',start:'2026-11-20'}),rule({id:'gym',category:'health',amount:2000000,note:'Спортзал',frequency:'weekly',start:'2026-11-01',paused:true})];
 assert.equal(applyRecurring(s,'2026-11-18'),3);
 assert.deepEqual(s.transactions.map(t=>t.date),['2026-09-05','2026-10-05','2026-11-05']);
 assert.deepEqual(s.transactions.map(t=>t.id),['rent-0','rent-1','rent-2']);
 assert.ok(s.transactions.every(t=>t.recurring==='rent'&&t.accountAmount===t.amount&&t.usdValue===240));
 assert.equal(applyRecurring(s,'2026-11-18'),0,'running twice must not duplicate');
 validateState(s);
 assert.equal(applyRecurring(s,'2026-11-20'),1);assert.equal(s.transactions.at(-1).type,'income');
 assert.equal(s.recurring[2].done,0);
 assert.throws(()=>validateState({...s,recurring:[{...s.recurring[0],currency:'USD'}]}),'currency must match the account');
 assert.throws(()=>validateState({...s,recurring:[{...s.recurring[0],category:'salary'}]}));
 assert.throws(()=>validateState({...s,recurring:[{...s.recurring[0],frequency:'daily'}]}));
});

test('a deleted generated transaction is not recreated and the catch-up limit holds',()=>{
 const s=base();s.recurring=[rule()];applyRecurring(s,'2026-11-18');s.transactions=s.transactions.filter(t=>t.id!=='rent-1');
 assert.equal(applyRecurring(s,'2026-11-18'),0);assert.equal(s.transactions.length,2);
 const w=base();w.recurring=[rule({frequency:'weekly',start:'2025-11-20'})];assert.equal(applyRecurring(w,'2026-11-18',{limit:10}),10);assert.equal(applyRecurring(w,'2026-11-18'),42);
});

test('editing a schedule skips dates the old schedule already covered',()=>{
 const old=rule({done:3});// generated 09-05, 10-05, 11-05
 assert.equal(rescheduledDone(old,{...old,start:'2026-09-01'}),3);// next 12-01
 assert.equal(rescheduledDone(old,{...old,start:'2026-11-10'}),0);
 assert.equal(rescheduledDone(old,{...old,frequency:'weekly',start:'2026-11-01'}),1);
 assert.equal(rescheduledDone({...old,done:0},{...old}),0);
});

test('budget alerts fire once per level per month',()=>{
 const s=base();s.budgets=[{id:'b1',category:'food',limit:100000000,currency:'UZS'}];s.transactions=[expense('a',70000000,'2026-11-03'),expense('old',90000000,'2026-10-03')];
 assert.equal(pendingBudgetAlerts(s,'2026-11-18',{}).length,0);
 s.transactions.push(expense('b',15000000,'2026-11-10'));
 let alerts=pendingBudgetAlerts(s,'2026-11-18',{});assert.equal(alerts.length,1);assert.equal(alerts[0].level,80);assert.ok(Math.abs(alerts[0].status.pct-85)<1e-9);
 let seen=markAlerts({},alerts,'2026-11-18');assert.equal(pendingBudgetAlerts(s,'2026-11-18',seen).length,0);
 s.transactions.push(expense('c',20000000,'2026-11-12'));alerts=pendingBudgetAlerts(s,'2026-11-18',seen);assert.equal(alerts[0].level,100);
 seen=markAlerts(seen,alerts,'2026-11-18');assert.equal(pendingBudgetAlerts(s,'2026-11-18',seen).length,0);
 assert.equal(pendingBudgetAlerts(s,'2026-12-01',seen).length,0,'new month starts from zero spending');
 assert.deepEqual(markAlerts(seen,[],'2026-12-01'),{},'old months are dropped');
 const st=budgetStatus(s,s.budgets[0],'2026-11-15');assert.ok(Math.abs(st.projectedPct-210)<1e-9);
});

test('month forecast uses spending pace, upcoming recurring items and ignores transfers',()=>{
 const s=base();// 1 000 000 UZS in uzum
 s.transactions=[expense('a',15000000,'2026-11-02'),expense('b',15000000,'2026-11-09'),expense('r',20000000,'2026-11-05',{recurring:'rent'}),expense('oct',99900000,'2026-10-30')];
 s.accounts[0].opening=150000000;// balance after expenses: 1 500 000 - 500 000 = 1 000 000
 s.recurring=[rule({start:'2026-11-05',done:1,amount:20000000}),rule({id:'pay',type:'income',category:'salary',amount:40000000,note:'Аванс',start:'2026-11-25'}),rule({id:'sub',category:'subscriptions',amount:1000000,note:'Музыка',frequency:'weekly',start:'2026-11-04',done:2})];
 s.transfers=[{id:'t',from:'uzum',to:'cash',amount:10000000,toAmount:10000000,date:'2026-11-10',note:''}];
 const f=monthForecast(s,'2026-11-15');
 assert.ok(Math.abs(f.balance-(1500000-(150000+150000+200000+999000)))<1e-6);
 assert.equal(f.daysLeft,15);assert.equal(f.pace,20000);assert.equal(f.projectedVariable,300000);
 assert.equal(f.scheduledIncome,400000);
 assert.equal(f.scheduledExpense,20000,'weekly 18th and 25th; rent is next month');
 assert.ok(Math.abs(f.end-(f.balance+400000-20000-300000))<1e-6);
 assert.equal(f.monthExpense,500000+300000+20000);
});

test('every new interface string has Uzbek and English text',()=>{
 for(const [ru,t] of Object.entries(featureTranslations)){assert.match(ru,/[А-Яа-яЁё]/);for(const lang of ['en','uz']){assert.ok(t[lang]?.trim(),`${lang} missing for ${ru}`);assert.doesNotMatch(t[lang],/[А-Яа-яЁё]/,`${lang} for ${ru}`);}}
});
