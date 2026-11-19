// Browser version of the Android 90-minute reminders. Browsers only allow this while the page is open,
// so the timer runs in the open tab and catches up when the tab becomes visible again.
import {language} from './language.js';
export const reminderInterval=90*60*1000;
const KEY='asdtrecker.web-reminders',ASKED='asdtrecker.web-reminders-asked',LAST='asdtrecker.web-reminders-last';
const messages=[
 ['Были покупки или доходы? Запишите их, пока всё помните.','Xarid yoki daromad bo‘ldimi? Yodingizdaligida qayd eting.','Any purchases or income? Log them while they are fresh.'],
 ['Полторы минуты для порядка: добавьте последние расходы и доходы.','Tartib uchun bir daqiqa: so‘nggi xarajat va daromadlarni kiriting.','A minute for clarity: add your latest expenses and income.'],
 ['Даже маленькая покупка важна. Обновите свои записи.','Kichik xarid ham muhim. Qaydlaringizni yangilang.','Even a small purchase counts. Update your records.'],
 ['Есть незаписанные расходы? Сейчас удобный момент их добавить.','Yozilmagan xarajatlar bormi? Ularni hozir kiriting.','Any unrecorded expenses? Now is a good time to add them.'],
 ['Проверьте последние полтора часа: что потратили или получили?','So‘nggi bir yarim soatni eslang: qancha sarfladingiz yoki oldingiz?','Look back over the last 90 minutes: what did you spend or receive?']
];
const get=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const set=(k,v)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}};
export const supported=()=>!window.Android&&'Notification' in window;
export const enabled=()=>supported()&&get(KEY)==='1'&&Notification.permission==='granted';
/** Show the in-app request once, until the person answers it. */
export const shouldAsk=()=>supported()&&!get(ASKED)&&Notification.permission!=='denied'&&!enabled();
export function dismiss(){set(ASKED,'1');}
export async function enable(){
 set(ASKED,'1');if(!supported())return false;
 const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission().catch(()=>'denied');
 if(permission!=='granted'){set(KEY,null);return false;}
 set(KEY,'1');set(LAST,String(Date.now()));return true;
}
export function disable(){set(KEY,null);}
export function messageFor(index,lang=language()){const m=messages[index%messages.length];return m[{ru:0,uz:1,en:2}[lang]??0];}
/** Sends a reminder when 90 minutes have passed since the last one. Returns true when one was shown. */
export function tick(now=Date.now()){
 if(!enabled())return false;const last=Number(get(LAST))||0;if(now-last<reminderInterval)return false;
 const index=Math.floor(now/reminderInterval);
 try{new Notification('ASDTrecker',{body:messageFor(index),icon:'logo.svg',tag:'asdtrecker-reminder'});}catch{return false;}
 set(LAST,String(now));return true;
}
export function startWebReminders(){if(!supported())return;setInterval(()=>tick(),60*1000);document.addEventListener('visibilitychange',()=>tick());tick();}
