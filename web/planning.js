// Pure planning helpers: account transfers, recurring operations, budget alerts and month forecast.
// No DOM access here so the same logic runs in the browser, in the Android WebView and in node tests.
import {fromMinor,convert,transactionValue,accountBalance} from './core.js';

export const frequencies=['weekly','monthly','yearly'];
export const alertLevels=[80,100];
const pad=n=>String(n).padStart(2,'0');
const iso=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const daysIn=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();

/** Date of the n-th occurrence (0-based). Monthly and yearly rules keep their original day, clamped to short months. */
export function occurrence(start,frequency,n){
 const [y,m,d]=start.split('-').map(Number);
 if(frequency==='weekly'){const t=new Date(Date.UTC(y,m-1,d+7*n));return iso(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate());}
 const months=frequency==='yearly'?12*n:n,total=(m-1)+months,yy=y+Math.floor(total/12),mm=total%12+1;
 return iso(yy,mm,Math.min(d,daysIn(yy,mm)));
}
export const nextDate=r=>occurrence(r.start,r.frequency,r.done);
const generatedId=(r,n)=>`${r.id.slice(0,64)}-${n}`;

/** Adds every due occurrence (date <= today) of each active rule as an ordinary transaction. Mutates and returns the count. */
export function applyRecurring(state,today,{limit=400}={}){
 let added=0;const ids=new Set(state.transactions.map(t=>t.id));
 for(const r of state.recurring||[]){
  if(r.paused||!state.accounts.some(a=>a.id===r.account))continue;
  while(added<limit&&state.transactions.length<50000){
   const date=occurrence(r.start,r.frequency,r.done);if(date>today)break;
   const id=generatedId(r,r.done);r.done++;
   if(ids.has(id))continue;
   const value=fromMinor(r.amount,r.currency),rate=r.currency==='USD'?1:state.rates[r.currency];
   state.transactions.push({id,type:r.type,amount:r.amount,currency:r.currency,account:r.account,accountAmount:r.amount,category:r.category,note:r.note,date,usdValue:rate>0?value/rate:null,recurring:r.id});
   ids.add(id);added++;
  }
 }
 return added;
}

/** When a rule's schedule is edited, skip occurrences that were already covered by the old schedule. */
export function rescheduledDone(old,next){
 if(!old||!old.done)return 0;
 const last=occurrence(old.start,old.frequency,old.done-1);let n=0;
 while(n<100000&&occurrence(next.start,next.frequency,n)<=last)n++;
 return n;
}

/** Signed effect of transfers on one account, in the account's minor units. */
export function transferDelta(accountId,transfers=[]){return transfers.reduce((n,t)=>n+(t.to===accountId?t.toAmount:0)-(t.from===accountId?t.amount:0),0);}

export function totalBalance(state){
 let value=0,missing=0;
 for(const a of state.accounts){const n=convert(fromMinor(accountBalance(a,state.transactions,state.transfers),a.currency),a.currency,state.currency,state.rates);if(n===null)missing++;else value+=n;}
 return {value,missing};
}

const dayOf=today=>Number(today.slice(8,10));
const monthDays=today=>daysIn(Number(today.slice(0,4)),Number(today.slice(5,7)));

/** Spending for one budget in the current month, plus where it lands at the current pace. */
export function budgetStatus(state,budget,today){
 const month=today.slice(0,7);let spent=0,missing=0;
 for(const t of state.transactions){if(t.type!=='expense'||t.category!==budget.category||t.date.slice(0,7)!==month||t.date>today)continue;const v=transactionValue(t,budget.currency,state.rates);if(v===null)missing++;else spent+=v;}
 const limit=fromMinor(budget.limit,budget.currency),pct=spent/limit*100,projected=spent/dayOf(today)*monthDays(today),projectedPct=projected/limit*100;
 return {spent,limit,pct,projected,projectedPct,missing,left:limit-spent};
}

/** Highest alert level reached by each budget this month that has not been announced yet. seen = {budgetId:{month,level}} */
export function pendingBudgetAlerts(state,today,seen={}){
 const month=today.slice(0,7),out=[];
 for(const b of state.budgets){
  const s=budgetStatus(state,b,today),level=[...alertLevels].reverse().find(l=>s.pct>=l);if(!level)continue;
  const prev=seen[b.id]?.month===month?seen[b.id].level:0;if(level>prev)out.push({budget:b,level,status:s});
 }
 return out;
}
export function markAlerts(seen,alerts,today){const month=today.slice(0,7),next={};for(const [id,v] of Object.entries(seen||{}))if(v?.month===month)next[id]=v;for(const a of alerts)next[a.budget.id]={month,level:a.level};return next;}

/**
 * End-of-month forecast in the summary currency.
 * Variable spending pace excludes recurring transactions; the rest of this month's recurring rules are added explicitly.
 * Transfers move money between own accounts and therefore never change the total.
 */
export function monthForecast(state,today){
 const month=today.slice(0,7),day=dayOf(today),days=monthDays(today),daysLeft=days-day,currency=state.currency;
 const total=totalBalance(state);let variable=0,spent=0,missing=total.missing;
 for(const t of state.transactions){if(t.type!=='expense'||t.date.slice(0,7)!==month||t.date>today)continue;const v=transactionValue(t,currency,state.rates);if(v===null){missing++;continue;}spent+=v;if(!t.recurring)variable+=v;}
 const pace=variable/day,projectedVariable=pace*daysLeft;let scheduledIncome=0,scheduledExpense=0;
 for(const r of state.recurring||[]){
  if(r.paused)continue;
  for(let n=r.done;n<r.done+40;n++){const date=occurrence(r.start,r.frequency,n);if(date.slice(0,7)>month)break;if(date<=today)continue;const v=convert(fromMinor(r.amount,r.currency),r.currency,currency,state.rates);if(v===null){missing++;continue;}if(r.type==='income')scheduledIncome+=v;else scheduledExpense+=v;}
 }
 const end=total.value+scheduledIncome-scheduledExpense-projectedVariable;
 return {balance:total.value,pace,spent,projectedVariable,scheduledIncome,scheduledExpense,end,daysLeft,day,days,missing,monthExpense:spent+projectedVariable+scheduledExpense};
}
