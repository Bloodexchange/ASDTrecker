import {decimals,fromMinor,toMinor,convert} from './core.js';

const aliases={
  'сум':'UZS','сумы':'UZS','сумов':'UZS','сумма':'UZS',"so'm":'UZS','som':'UZS','sum':'UZS','сўм':'UZS',
  'юань':'CNY','юани':'CNY','юаней':'CNY','rmb':'CNY','元':'CNY',
  '$':'USD','доллар':'USD','доллары':'USD','долларов':'USD',
  '€':'EUR','евро':'EUR','₽':'RUB','руб':'RUB','рубль':'RUB','рублей':'RUB',
  '£':'GBP','фунт':'GBP','₸':'KZT','тенге':'KZT'
};
const currencies=new Set(['UZS','CNY','USD','EUR',...(Intl.supportedValuesOf?Intl.supportedValuesOf('currency'):[])]);

export function parseMoneyInput(input,defaultCurrency,{allowZero=false,allowNegative=false}={}){
  const raw=String(input).trim().replace(/[’‘ʻʼ]/g,"'");
  // Explicit currency names/codes/symbols only. A bare number keeps the selected currency.
  const match=raw.match(/^(-?[\d\s.,]+)\s*([^\d\s.,-][^\d]*)?$/u)
    ||raw.match(/^([^\d\s.,-][^\d]*?)\s*(-?[\d\s.,]+)$/u)?.map((x,i,a)=>i===1?a[2]:i===2?a[1]:x);
  if(!match)throw Error('Введите сумму, например 100000 UZS или 100000 сум');
  const number=match[1].trim(),token=match[2]?.trim().toLowerCase();
  if(token==='¥')throw Error('Укажите CNY для юаней или JPY для иен');
  const currency=token?(aliases[token]||token.toUpperCase()):defaultCurrency;
  if(!currencies.has(currency))throw Error('Неизвестная валюта. Укажите код, например UZS или CNY');
  const negative=number.startsWith('-');
  if(negative&&!allowNegative)throw Error('Введите положительную сумму');
  const absolute=number.replace(/^-/,'').trim();
  const zero=/^0+(?:[.,]0+)?$/.test(absolute.replace(/\s/g,''));
  const minor=zero&&allowZero?0:toMinor(absolute,currency)*(negative?-1:1);
  return {minor,currency,explicit:!!token};
}

export function convertMoneyInput(input,from,to,rates,options={}){
  const parsed=parseMoneyInput(input,from,options);
  const source=fromMinor(parsed.minor,parsed.currency);
  const value=convert(source,parsed.currency,to,rates);
  if(value===null)throw Error(`Нет курса ${parsed.currency} → ${to}. Обновите курсы или введите сумму в ${to}.`);
  const minor=Math.round(value*10**decimals(to));
  if(!Number.isSafeInteger(minor)||Math.abs(minor)>1e14)throw Error('Сумма слишком велика');
  if(minor===0&&parsed.minor!==0&&!options.allowZero)throw Error(`После округления сумма меньше минимальной единицы ${to}`);
  return {minor,currency:to,inputMinor:parsed.minor,inputCurrency:parsed.currency,explicit:parsed.explicit,
    value:fromMinor(minor,to),source,rate:convert(1,parsed.currency,to,rates)};
}
