import {locale} from './language.js';
import {convertMoneyInput} from './money-input.js';
import {decimals} from './core.js';
export function setupAmountPreviews(getState){
 const fields={
  'budget-limit':{select:'budget-currency'},
  'goal-target':{select:'goal-currency'},
  'goal-saved':{select:'goal-currency',allowZero:true},
  'account-opening':{select:'account-currency',allowZero:true,allowNegative:true},
  'goal-add-amount':{goal:true}
 };
 function update(){const s=getState();for(const [id,options]of Object.entries(fields)){
  const input=document.getElementById(id);if(!input)continue;
  const currency=options.goal?s.goals.find(g=>g.id===input.closest('form').dataset.id)?.currency:document.getElementById(options.select)?.value;
  if(!currency)continue;
  let output=document.getElementById(id+'-conversion');if(!output){output=document.createElement('span');output.id=id+'-conversion';output.className='amount-help';output.setAttribute('aria-live','polite');input.after(output);input.setAttribute('aria-describedby',output.id);}
  output.textContent='Можно ввести другую валюту: 100000 сум или 100000 UZS.';
  if(!input.value.trim())continue;
  try{const r=convertMoneyInput(input.value,currency,currency,s.rates,options);if(r.inputCurrency!==currency)output.textContent='Будет сохранено: '+new Intl.NumberFormat(locale(),{maximumFractionDigits:decimals(currency)}).format(r.value)+' '+currency;}
  catch(e){output.textContent=e.message;}
 }}
 new MutationObserver(update).observe(document.querySelector('#modal-root'),{childList:true});
 document.addEventListener('input',e=>{if(fields[e.target.id])update();});
 document.addEventListener('change',e=>{if(Object.values(fields).some(f=>f.select===e.target.id))update();});
 document.addEventListener('rates-updated',update);
}
