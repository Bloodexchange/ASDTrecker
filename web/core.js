export const categories = [
  {id:'food',name:'Еда и продукты',icon:'basket',color:'#6744ad'},
  {id:'cafe',name:'Кафе и рестораны',icon:'cup',color:'#a04770'},
  {id:'transport',name:'Транспорт',icon:'car',color:'#226d81'},
  {id:'shopping',name:'Покупки',icon:'bag',color:'#855c32'},
  {id:'home',name:'Дом и счета',icon:'home',color:'#3b568f'},
  {id:'health',name:'Здоровье',icon:'heart',color:'#8f3c53'},
  {id:'fun',name:'Развлечения',icon:'spark',color:'#4e438d'},
  {id:'education',name:'Образование',icon:'book',color:'#337764'},
  {id:'subscriptions',name:'Подписки',icon:'repeat',color:'#725084'},
  {id:'travel',name:'Путешествия',icon:'globe',color:'#2b6873'},
  {id:'other',name:'Другое',icon:'grid',color:'#525667'},
  {id:'salary',name:'Зарплата',icon:'wallet',color:'#25674f',income:true},
  {id:'freelance',name:'Подработка',icon:'briefcase',color:'#2d646a',income:true},
  {id:'gift',name:'Подарок / прочее',icon:'gift',color:'#614687',income:true}
];
export const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const uid = () => crypto.randomUUID();
export const percentage=(current,previous)=>Number.isFinite(current)&&Number.isFinite(previous)&&previous>0?(current-previous)/previous*100:null;
export function decimals(currency) { return new Intl.NumberFormat('ru',{style:'currency',currency}).resolvedOptions().maximumFractionDigits; }
export function toMinor(input,currency) {
  const s=String(input).trim().replace(/\s/g,'').replace(',','.');
  if(!/^\d+(\.\d+)?$/.test(s)) throw new Error('Введите положительную сумму');
  const dp=decimals(currency); if((s.split('.')[1]||'').length>dp) throw new Error(`У валюты ${currency} максимум ${dp} знаков после запятой`);
  const n=Math.round(Number(s)*10**dp);
  if(!Number.isSafeInteger(n)||n<=0||n>1e14) throw new Error('Сумма должна быть больше нуля и меньше 100 трлн минимальных единиц');
  return n;
}
export const fromMinor=(n,c)=>n/10**decimals(c);
export function convert(amount,from,to,rates) { if(from===to)return amount; if(!(rates[from]>0&&rates[to]>0))return null; return amount/rates[from]*rates[to]; }
export const freshState=()=>({version:1,currency:'UZS',transactions:[],accounts:[{id:'cash',name:'Наличные',bank:'Наличные',currency:'UZS',opening:0}],budgets:[],goals:[],rates:{USD:1},ratesAt:0,fetchedAt:0,motion:true,hidden:false});
export function transactionValue(t,currency,rates) {
  if(t.currency===currency)return fromMinor(t.amount,t.currency);
  return t.usdValue!==null&&Number.isFinite(t.usdValue)&&rates[currency]>0 ? t.usdValue*rates[currency] : null;
}
export function accountBalance(a,transactions) {return a.opening+transactions.filter(t=>t.account===a.id).reduce((n,t)=>n+(t.type==='income'?1:-1)*t.accountAmount,0);}
export function stats(transactions,currency,rates) {
  let income=0,expense=0,missing=0; const groups={};
  for(const t of transactions) { const v=transactionValue(t,currency,rates); if(v===null){missing++;continue;} if(t.type==='income')income+=v;else{expense+=v;groups[t.category]=(groups[t.category]||0)+v;} }
  return {income,expense,net:income-expense,missing,groups,savingRate:income>0?(income-expense)/income*100:null};
}
export function inPeriod(t,period,anchor=today()) {
  if(period==='all')return true;
  if(period==='month')return t.date.slice(0,7)===anchor.slice(0,7);
  if(period==='year')return t.date.slice(0,4)===anchor.slice(0,4);
  const end=new Date(anchor+'T12:00:00'), start=new Date(end); start.setDate(start.getDate()-6);
  const d=new Date(t.date+'T12:00:00'); return d>=start&&d<=end;
}
export function validateState(s) {
  const fail=()=>{throw new Error('Неверный или повреждённый файл ASDTrecker');};
  const str=(x,max=160)=>typeof x==='string'&&x.length>0&&x.length<=max;
  const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
  const cur=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x);
  const integer=x=>Number.isSafeInteger(x)&&Math.abs(x)<=1e14;
  const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
  if(!s||s.version!==1||!cur(s.currency)||!Array.isArray(s.transactions)||s.transactions.length>50000||!Array.isArray(s.accounts)||s.accounts.length>100||!s.accounts.length||!Array.isArray(s.budgets)||s.budgets.length>100||!Array.isArray(s.goals)||s.goals.length>100)fail();
  if(new Set(s.accounts.map(a=>a.id)).size!==s.accounts.length)fail();
  for(const a of s.accounts)if(!id(a.id)||!str(a.name,60)||!str(a.bank,60)||!cur(a.currency)||!integer(a.opening))fail();
  const ids=new Set();
  for(const t of s.transactions){
    if(!id(t.id)||ids.has(t.id)||!['income','expense'].includes(t.type)||!integer(t.amount)||t.amount<=0||!cur(t.currency)||!date(t.date)||!str(t.note)||!categories.some(c=>c.id===t.category&&!!c.income===(t.type==='income'))||!(t.usdValue===null||(Number.isFinite(t.usdValue)&&t.usdValue>=0&&t.usdValue<=1e14))||!integer(t.accountAmount)||t.accountAmount<0||!s.accounts.some(a=>a.id===t.account))fail(); ids.add(t.id);
  }
  for(const b of s.budgets)if(!id(b.id)||!categories.some(c=>c.id===b.category&&!c.income)||!cur(b.currency)||!integer(b.limit)||b.limit<=0)fail();
  for(const g of s.goals)if(!id(g.id)||!str(g.name,60)||!cur(g.currency)||!integer(g.target)||g.target<=0||!integer(g.saved)||g.saved<0)fail();
  if(new Set(s.budgets.map(b=>b.id)).size!==s.budgets.length||new Set(s.goals.map(g=>g.id)).size!==s.goals.length||new Set(s.budgets.map(b=>b.category)).size!==s.budgets.length)fail();
  if(!s.rates||typeof s.rates!=='object'||Array.isArray(s.rates)||Object.keys(s.rates).length>250)fail();
  for(const [c,r]of Object.entries(s.rates))if(!cur(c)||!Number.isFinite(r)||r<=0||r>1e9)fail();
  if(s.rates.USD!==1||!Number.isFinite(s.ratesAt)||!Number.isFinite(s.fetchedAt)||typeof s.motion!=='boolean'||typeof s.hidden!=='boolean')fail();
  return s;
}
export function demoState(){
  const s=freshState();s.rates={USD:1,UZS:12850,EUR:.92,RUB:92,KZT:500,GBP:.79,JPY:150,AED:3.67};
  s.accounts=[{id:'cash',name:'На каждый день',bank:'Наличные',currency:'UZS',opening:42000000},{id:'uzum',name:'Основная карта',bank:'Uzum Bank',currency:'UZS',opening:245000000},{id:'agro',name:'Накопления',bank:'Agrobank',currency:'UZS',opening:380000000}];
  const now=new Date(); const notes=['Продукты на неделю','Обед в кафе','Такси до работы','Новая одежда','Интернет и связь','Аптека','Билеты в кино','Курс английского','Музыкальная подписка','Поездка за город'];
  for(let d=1;d<=now.getDate();d++) { const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    for(let j=0;j<(d%3)+1;j++){const k=(d+j*3)%10;const val=[128000,72000,23000,285000,90000,65000,55000,180000,29000,125000][k];s.transactions.push({id:uid(),type:'expense',amount:val*100,currency:'UZS',account:'uzum',accountAmount:val*100,category:categories[k].id,note:notes[k],date,usdValue:val/12850});}
    if(d===1||d===10){const val=d===1?6500000:1800000;s.transactions.push({id:uid(),type:'income',amount:val*100,currency:'UZS',account:'uzum',accountAmount:val*100,category:d===1?'salary':'freelance',note:d===1?'Зарплата за месяц':'Дизайн-проект',date,usdValue:val/12850});}
  }
  s.budgets=[{id:uid(),category:'food',limit:180000000,currency:'UZS'},{id:uid(),category:'cafe',limit:80000000,currency:'UZS'},{id:uid(),category:'shopping',limit:120000000,currency:'UZS'}];
  s.goals=[{id:uid(),name:'Путешествие к морю',target:1800000000,saved:720000000,currency:'UZS'},{id:uid(),name:'Финансовая подушка',target:3000000000,saved:1120000000,currency:'UZS'}];return s;
}
