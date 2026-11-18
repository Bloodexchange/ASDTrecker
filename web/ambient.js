export function ambient(canvas){
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return()=>{};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const shards=[[.72,.24,.76,-.25],[.12,.56,.62,1.8],[.83,.83,.65,3.3],[.27,.05,.48,.6],[.45,1.08,.52,-1.1]];
 let active=true,page=0,targetPage=0,last=0,dirty=true,phase=0;
 function polygon(points,fill,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
 function draw(t){requestAnimationFrame(draw);if(document.hidden)return;
  const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,1.5),resized=canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr);
  const moving=active&&!reduced.matches;if(!resized&&!dirty&&(!moving||t-last<33))return;
  const dt=last?Math.min(t-last,100):0;last=t;if(moving)phase+=dt*.00014;
  if(resized){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  page=moving?page+(targetPage-page)*.09:targetPage;dirty=false;
  const size=Math.min(w,h)*.95;
  shards.forEach(([cx,cy,scale,angle],i)=>{
   const turn=angle+phase*(i%2?-.28:.3)+page*.13,tilt=.78+Math.sin(phase+i+page*.18)*.15;
   const centerX=w*cx+Math.sin(phase+i)*size*.035,centerY=h*cy+Math.cos(phase*.7+i)*size*.035;
   const points=[[-.62,-.4],[.65,-.25],[-.19,.8]].map(([x,y])=>{x*=size*scale;y*=size*scale;return[centerX+x*Math.cos(turn)-y*Math.sin(turn)*tilt,centerY+x*Math.sin(turn)+y*Math.cos(turn)*tilt];});
   const tint=ctx.createLinearGradient(points[0][0],points[0][1],points[2][0],points[2][1]);
   tint.addColorStop(0,'rgba(65,89,116,.55)');tint.addColorStop(.42,'rgba(24,42,61,.22)');tint.addColorStop(.7,'rgba(59,42,88,.43)');tint.addColorStop(1,'rgba(27,73,78,.58)');
   const back=points.map(([x,y])=>[x+5,y+7]);polygon(back,'rgba(10,21,34,.65)','rgba(77,111,132,.22)');polygon(points,tint,'rgba(127,156,180,.45)');
   const [a,b,c]=points,facet=[a[0]+(b[0]-a[0])*.13+(c[0]-a[0])*.09,a[1]+(b[1]-a[1])*.13+(c[1]-a[1])*.09];
   polygon([a,b,facet],'rgba(114,149,167,.13)');polygon([a,facet,c],'rgba(71,119,138,.10)');
  });
 }
 requestAnimationFrame(draw);
 reduced.addEventListener('change',()=>{dirty=true;});
 return(motion,section=0)=>{active=motion;targetPage=section;dirty=true;document.body.classList.toggle('still',!motion);};
}
