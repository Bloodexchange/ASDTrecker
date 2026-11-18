import {locale} from './language.js';
// Animate visible data only, after the navigation reveal. Never change stored amounts.
export function setupStatMotion(){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let observer,lastPage='',seen=new Set(),pending=[],frames=new Set(),animations=new Set(),originals=new Map();
 const disabled=()=>reduced.matches||document.body.classList.contains('still');
 function stop(){observer?.disconnect();for(const a of animations)a.cancel();animations.clear();for(const f of frames)cancelAnimationFrame(f);frames.clear();for(const [node,text]of originals)node.textContent=text;originals.clear();}
 function animate(node,frames,options={}){const a=node.animate(frames,{duration:850,easing:'cubic-bezier(.22,1,.36,1)',...options});animations.add(a);a.finished.catch(()=>{}).finally(()=>animations.delete(a));}
 function count(node){
  const text=node.textContent,match=text.match(/^([−-]?\d[\d\s\u00a0\u202f,.]*)(.*)$/u);
  if(!match)return;
  const parts=new Intl.NumberFormat(locale()).formatToParts(1234.5),group=parts.find(p=>p.type==='group')?.value||' ',decimal=parts.find(p=>p.type==='decimal')?.value||'.';
  const raw=match[1].trimEnd(),suffix=match[1].slice(raw.length)+match[2];
  const value=Number(raw.replaceAll(group,'').replace(/\s/g,'').replace('−','-').replace(decimal,'.'));if(!Number.isFinite(value)||value===0)return;
  const precision=Math.min(6,(raw.split(decimal)[1]||'').length);
  const format=new Intl.NumberFormat(locale(),{maximumFractionDigits:precision,minimumFractionDigits:precision});
  originals.set(node,text);node.setAttribute('aria-label',text);const start=performance.now();
  function tick(now){if(!node.isConnected)return;const p=Math.min(1,(now-start)/800);node.textContent=p===1||disabled()?text:format.format(value*(1-(1-p)**3))+suffix;if(p<1&&!disabled()){const id=requestAnimationFrame(t=>{frames.delete(id);tick(t);});frames.add(id);}}
  tick(start);
 }
 function reveal(node){
  if(disabled())return;
  if(node.matches('.metric strong,.goal-amount,.donut-center strong,.budget-label>b,.chart-bottom b')){count(node);animate(node,[{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:450});}
  else if(node.matches('rect.bar'))animate(node,[{transform:'scaleY(0)'},{transform:'scaleY(1)'}],{delay:Number(node.dataset.motionIndex)%12*18});
  else if(node.matches('circle[stroke-dasharray]')){const end=node.getAttribute('stroke-dasharray');animate(node,[{strokeDasharray:'0 326.73'},{strokeDasharray:end}],{duration:1050});}
  else if(node.matches('path.line')){const length=node.getTotalLength();animate(node,[{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],{duration:1100});}
  else if(node.matches('.track i'))animate(node,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:950});
  else animate(node,[{opacity:.25,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}],{duration:500,delay:Number(node.dataset.motionIndex)%7*25});
 }
 function observe(){
  if(document.body.classList.contains('route-depart')&&!document.body.classList.contains('route-arrive'))return;
  observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);reveal(e.target);}},{threshold:.2});
  for(const node of pending)if(node.isConnected)observer.observe(node);pending=[];
 }
 function scan(){stop();pending=[];const page=document.querySelector('.nav-item.active')?.dataset.id||document.querySelector('.bottom-nav .active')?.dataset.id;
  if(page!==lastPage){seen.clear();lastPage=page;}
  const nodes=document.querySelectorAll('.page rect.bar,.page circle[stroke-dasharray],.page path.line,.page .track i,.page .heat-cell,.page .metric strong,.page .goal-amount,.page .donut-center strong,.page .budget-label>b,.page .chart-bottom b');
  nodes.forEach((node,i)=>{const key=i+':'+node.outerHTML;if(!seen.has(key)){seen.add(key);node.dataset.motionIndex=i;pending.push(node);}});
  observe();
 }
 new MutationObserver(scan).observe(document.querySelector('#app'),{childList:true});
 new MutationObserver(()=>{if(disabled()){stop();scan();}else if(pending.length)observe();}).observe(document.body,{attributes:true,attributeFilter:['class']});
 reduced.addEventListener('change',scan);scan();
}
