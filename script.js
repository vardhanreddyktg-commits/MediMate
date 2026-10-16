const LEGACY='medimate:v1';                         // data saved on this device before login existed
const DEVICE=['notified','snooze','remind','cur'];   // settings that stay on this device and are not synced
const norm=s=>Object.assign({notified:{},snooze:{},remind:false},s);
const fresh=()=>norm({profiles:[{id:'p1',name:'Me',rel:'Self'}],meds:[],logs:[],cur:'p1'});
let S=fresh(),tab='today',SWREG=null,USER=null,KEYU=null,SB=null,PENDING=null;
function persist(){if(KEYU)try{localStorage.setItem(KEYU,JSON.stringify(S))}catch(e){}}   // save on this device only
function save(){S._ts=Date.now();persist();pushSoon()}                                      // save here and send to the account
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const TODAY=()=>iso(new Date());
const dleft=e=>Math.round((new Date(e+'T00:00')-new Date(TODAY()+'T00:00'))/864e5);
const uid=()=>Math.random().toString(36).slice(2,9);
const stat=m=>{const d=dleft(m.expiry);return d<0?'expired':d<=30?'soon':'safe'};
const supply=m=>m.asNeeded||!m.times.length?null:Math.floor(m.qty/(m.dose*m.times.length));
const pname=id=>(S.profiles.find(p=>p.id===id)||{}).name||'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;
const addDays=(d,n)=>{const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return iso(x)};
const dshow=d=>new Date(d+'T00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
const medLine=m=>m.asNeeded?'only when needed, at least '+m.gap+' hours apart':(m.times.map(fmt).join(', ')||'no fixed times');

function alerts(){
  const out=[];
  S.meds.forEach(m=>{
    const n=pname(m.profileId),d=dleft(m.expiry),s=supply(m);
    if(d<0)out.push(['bad',`${m.name} (${n}) has expired. Dispose of it safely.`]);
    else if(d<=30)out.push(['warn',`${m.name} (${n}) expires in ${d} day${d===1?'':'s'}.`]);
    if(s!==null&&s<=5)out.push(['warn',`${m.name} (${n}) has ${s} day${s===1?'':'s'} of stock left. Time to refill.`]);
  });
  return out.length?`<div class="card alerts">${out.map(([c,t])=>`<div class="al ${c}">${esc(t)}</div>`).join('')}</div>`:'';
}
function stats(meds,days=7){
  const ids=new Set(meds.map(m=>m.id));let planned=0,taken=0;
  for(let i=0;i<days;i++){
    const d=addDays(TODAY(),-i);
    meds.forEach(m=>{if(!m.asNeeded&&(!m.created||m.created<=d))planned+=m.times.length});
    taken+=S.logs.filter(l=>ids.has(l.medId)&&l.date===d&&l.status==='taken'&&!l.prn).length;
  }
  return {planned,taken};
}
function adherence(meds){
  const {planned,taken}=stats(meds);if(!planned)return'';
  const pct=Math.min(100,Math.round(taken/planned*100));
  return `<div class="card s-safe"><div class="mu">Doses taken in the last 7 days</div><div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b> <span class="mu">(${taken} of ${planned})</span></div>`;
}
function todayView(){
  const d=TODAY(),meds=S.meds.filter(m=>m.profileId===S.cur),items=[];
  meds.forEach(m=>{if(!m.asNeeded)m.times.forEach(t=>items.push({m,t}))});
  items.sort((a,b)=>a.t.localeCompare(b.t));
  const now=new Date().toTimeString().slice(0,5);
  const rows=items.map(({m,t})=>{
    const l=S.logs.find(x=>x.medId===m.id&&x.date===d&&x.time===t),st=l?l.status:'',late=!st&&t<now;
    const b=(s,lab,k)=>`<button class="${k||''}" data-a="dose" data-m="${m.id}" data-t="${t}" data-s="${s}">${lab}</button>`;
    return `<div class="card row s-${st==='taken'?'safe':late?'expired':'soon'}"><div><b>${fmt(t)}</b> ${esc(m.name)} <span class="mu">${esc(m.strength)}</span><div class="mu">${m.dose} unit${m.dose>1?'s':''}${m.notes?', '+esc(m.notes):''}</div></div>
    <div class="act">${st?`<span class="chip ${st==='taken'?'ok':'warn'}">${st==='taken'?'Taken':'Skipped'}</span>${b('none','Undo','ghost')}`:`${late?'<span class="chip bad">Overdue</span>':''}${b('taken','Taken')}${b('skipped','Skip','ghost')}`}</div></div>`;
  }).join('');
  const prn=meds.filter(m=>m.asNeeded).map(prnCard).join('');
  return remindBar()+alerts()+adherence(meds)+'<h2>Today\'s doses</h2>'+(rows||(prn?'<p class="mu">No fixed doses today.</p>':empty('No doses scheduled for this person. Add a medicine and choose when to take it.')))+(prn?'<h2>Only when needed</h2>'+prn:'');
}
const lastPrn=m=>S.logs.filter(l=>l.medId===m.id&&l.prn).sort((a,b)=>b.ts-a.ts)[0];
const hm=ts=>fmt(new Date(ts).toTimeString().slice(0,5));
function prnCard(m){
  const last=lastPrn(m),next=last&&m.gap?last.ts+m.gap*36e5:0,wait=next>Date.now();
  return `<div class="card row s-${wait?'soon':'safe'}"><div><b>${esc(m.name)}</b> <span class="mu">${esc(m.strength)}</span>
  <div class="mu">${m.dose} unit${m.dose>1?'s':''}, at least ${m.gap} hours apart${m.notes?', '+esc(m.notes):''}</div>
  <div class="mu">${last?'Last taken '+hm(last.ts)+(last.date!==TODAY()?' ('+dshow(last.date)+')':''):'Not taken yet'}</div>
  ${wait?`<div><b>Next dose allowed after ${hm(next)}${iso(new Date(next))!==TODAY()?' ('+dshow(iso(new Date(next)))+')':''}</b></div>`:''}</div>
  <div class="act">${last?`<button class="ghost" data-a="prn-undo" data-m="${m.id}">Undo</button>`:''}<button data-a="prn" data-m="${m.id}" ${wait?'disabled':''}>${wait?'Too early':'Take now'}</button></div></div>`;
}
function takePrn(mid){
  const m=S.meds.find(x=>x.id===mid),last=lastPrn(m);
  if(last&&m.gap&&last.ts+m.gap*36e5>Date.now())return;
  const n=new Date();
  S.logs.push({medId:mid,date:iso(n),time:n.toTimeString().slice(0,5),status:'taken',prn:true,ts:n.getTime()});
  m.qty=Math.max(0,m.qty-m.dose);save();render();
}
function undoPrn(mid){
  const m=S.meds.find(x=>x.id===mid),last=lastPrn(m);if(!last)return;
  S.logs=S.logs.filter(l=>l!==last);m.qty+=m.dose;save();render();
}
function card(m){
  const d=dleft(m.expiry),s=supply(m);
  return `<div class="card row s-${stat(m)}"><div><b>${esc(m.name)}</b> <span class="mu">${esc(m.strength)}</span>
  <div class="mu">Expires ${m.expiry.slice(0,7)}, ${d<0?Math.abs(d)+' days ago':d+' days left'}</div>
  <div class="mu">${m.qty} in stock${s!==null?', about '+s+' days of supply':''}</div>
  <div class="mu">${esc(medLine(m))}</div></div>
  <button class="ghost" data-a="edit" data-m="${m.id}">Edit</button></div>`;
}
let cabQ='',cabSort='expiry';
function cabList(){
  const q=cabQ.trim().toLowerCase();
  const by={expiry:(a,b)=>a.expiry.localeCompare(b.expiry),name:(a,b)=>a.name.localeCompare(b.name),stock:(a,b)=>a.qty-b.qty};
  const meds=S.meds.filter(m=>m.profileId===S.cur&&(!q||(m.name+' '+m.strength+' '+m.notes).toLowerCase().includes(q))).sort(by[cabSort]);
  const g={expired:[],soon:[],safe:[]};meds.forEach(m=>g[stat(m)].push(m));
  const sec=(k,t,n)=>g[k].length?`<h2>${t} (${g[k].length})</h2>${n?`<p class="mu">${n}</p>`:''}${g[k].map(card).join('')}`:'';
  return sec('expired','Expired','Do not use these. Return them to a pharmacy or dispose of them safely.')+sec('soon','Expiring within 30 days')+sec('safe','Safe to use')||empty(q?'No medicines match your search.':'This cabinet is empty. Tap Add medicine to start.');
}
function cabinetView(){
  const o=(v,t)=>`<option value="${v}" ${cabSort===v?'selected':''}>${t}</option>`;
  return `<div class="two" style="margin-top:6px"><input id="q" type="search" placeholder="Search medicines" value="${esc(cabQ)}" aria-label="Search medicines"><select id="sort" aria-label="Sort by" style="width:100%">${o('expiry','Sort: expiry date')}${o('name','Sort: name A to Z')}${o('stock','Sort: lowest stock')}</select></div>
  <div class="act" style="justify-content:flex-start;margin:10px 0"><button class="ghost" data-a="print">Print summary</button><button class="ghost" data-a="wa">Share on WhatsApp</button></div>
  <div id="cablist">${cabList()}</div>`;
}
function render(){
  $('#prof').innerHTML=S.profiles.map(p=>`<option value="${p.id}" ${p.id===S.cur?'selected':''}>${esc(p.name)}${p.rel?' ('+esc(p.rel)+')':''}</option>`).join('');
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
  $('#view').innerHTML=tab==='today'?todayView():cabinetView();
}
function setDose(mid,t,st){
  const m=S.meds.find(x=>x.id===mid),d=TODAY();
  let l=S.logs.find(x=>x.medId===mid&&x.date===d&&x.time===t);
  if(l&&l.status==='taken')m.qty+=m.dose;
  if(st==='none'){S.logs=S.logs.filter(x=>x!==l)}
  else{if(!l){l={medId:mid,date:d,time:t};S.logs.push(l)}l.status=st;if(st==='taken')m.qty=Math.max(0,m.qty-m.dose)}
  save();render();
}
const fmt=t=>{const[h,m]=t.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM')};
function timeRow(v){
  const r=document.createElement('div');r.className='trow';
  r.innerHTML=`<input type="time" value="${v}" required aria-label="Dose time"><button type="button" class="ghost" data-a="rmtime" aria-label="Remove this time">Remove</button>`;
  $('#times').appendChild(r);return r;
}
function setTimes(a){$('#times').innerHTML='';a.forEach(v=>timeRow(v))}
function getTimes(){return [...new Set([...document.querySelectorAll('#times input')].map(i=>i.value).filter(Boolean))].sort()}
function openForm(id){
  const f=$('#mf');f.reset();f.mid.value=id||'';$('#del').hidden=!id;$('#del').textContent='Delete';
  $('#mt').textContent=id?'Edit medicine':'Add medicine';
  if(id){
    const m=S.meds.find(x=>x.id===id);
    f.nm.value=m.name;f.str.value=m.strength;f.qty.value=m.qty;f.dose.value=m.dose;f.exp.value=m.expiry.slice(0,7);f.notes.value=m.notes;
    setTimes(m.times);f.prn.checked=!!m.asNeeded;f.gap.value=m.gap||'';
  }else setTimes(['08:00']);
  togglePrn();$('#scanmsg').textContent='';
  $('#dm').showModal();
}
$('#mf').onsubmit=e=>{
  e.preventDefault();const f=e.target;
  const asN=f.prn.checked,times=asN?[]:getTimes();
  const [y,mo]=f.exp.value.split('-').map(Number);
  const o={name:f.nm.value.trim(),strength:f.str.value.trim(),qty:+f.qty.value,dose:+f.dose.value||1,
    expiry:iso(new Date(y,mo,0)),times:times,notes:f.notes.value.trim(),asNeeded:asN,gap:asN?+f.gap.value:null};
  if(f.mid.value)Object.assign(S.meds.find(x=>x.id===f.mid.value),o);else S.meds.push({id:uid(),profileId:S.cur,created:TODAY(),...o});
  save();$('#dm').close();render();
};
$('#pf').onsubmit=e=>{
  e.preventDefault();const f=e.target,p={id:uid(),name:f.pn.value.trim(),rel:f.pr.value.trim()};
  S.profiles.push(p);S.cur=p.id;save();f.reset();$('#dp').close();render();
};
$('#del').onclick=()=>{
  const b=$('#del');
  if(b.textContent!=='Tap again to delete'){b.textContent='Tap again to delete';return}
  const id=$('#mf').mid.value;
  S.meds=S.meds.filter(m=>m.id!==id);S.logs=S.logs.filter(l=>l.medId!==id);
  save();$('#dm').close();render();
};
$('#prof').onchange=e=>{S.cur=e.target.value;save();render()};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;
  const a=b.dataset.a;
  if(a==='tab'){tab=b.dataset.t;render()}
  else if(a==='addmed')openForm();
  else if(a==='edit')openForm(b.dataset.m);
  else if(a==='addprof')$('#dp').showModal();
  else if(a==='close')b.closest('dialog').close();
  else if(a==='dose')setDose(b.dataset.m,b.dataset.t,b.dataset.s);
  else if(a==='addtime')timeRow('').querySelector('input').focus();
  else if(a==='quick'){if(!getTimes().includes(b.dataset.t))timeRow(b.dataset.t)}
  else if(a==='rmtime')b.parentElement.remove();
  else if(a==='delprof')deleteProfile();
  else if(a==='logout')logout();
  else if(a==='authmode')setMode(b.dataset.m);
  else if(a==='remind-on')Notification.requestPermission().then(p=>{S.remind=p==='granted';persist();render();
    if(S.remind)showNote('MediMate reminders are on',{body:'You will get a notification at every dose time.',tag:'test',icon:'icon-192.png'})});
  else if(a==='remind-off'){S.remind=false;persist();render()}
  else if(a==='prn')takePrn(b.dataset.m);
  else if(a==='prn-undo')undoPrn(b.dataset.m);
  else if(a==='print')printSummary();
  else if(a==='wa')shareWA();
});

/* ---------- Reminders ---------- */
function remindBar(){
  if(!('Notification' in window))return '<div class="card s-soon"><div class="mu">This browser does not support notifications.</div></div>';
  const p=Notification.permission;
  if(p==='denied')return '<div class="card s-soon"><div class="mu">Notifications are blocked in the browser settings. Allow them to get dose reminders.</div></div>';
  if(S.remind&&p==='granted')return '<div class="card s-safe row"><div class="mu">Dose reminders are on while the app is open.</div><button class="ghost" data-a="remind-off">Turn off</button></div>';
  return '<div class="card s-soon row"><div>Get a notification at every dose time.</div><button data-a="remind-on">Turn on reminders</button></div>';
}
async function showNote(title,o){
  try{if(SWREG){await SWREG.showNotification(title,o);return}}catch(e){}
  try{new Notification(title,{body:o.body,tag:o.tag})}catch(e){}
}
function notify(m,t,key){
  const body=m.dose+' unit'+(m.dose>1?'s':'')+(m.strength?', '+m.strength:'')+(m.notes?'. '+m.notes:'');
  showNote(fmt(t)+': '+m.name+' for '+pname(m.profileId),{body,tag:key,requireInteraction:true,icon:'icon-192.png',
    data:{medId:m.id,t,date:TODAY()},actions:[{action:'taken',title:'Taken'},{action:'snooze',title:'Snooze 10 min'}]});
}
function checkDue(){
  if(!USER||!S.remind||!('Notification' in window)||Notification.permission!=='granted')return;
  const now=new Date(),d=TODAY(),nowMin=now.getHours()*60+now.getMinutes();
  [S.notified,S.snooze].forEach(o=>Object.keys(o).forEach(k=>{if(!k.startsWith(d))delete o[k]}));
  S.meds.forEach(m=>(m.asNeeded?[]:m.times).forEach(t=>{
    const [h,mi]=t.split(':').map(Number),key=d+'|'+m.id+'|'+t,sn=S.snooze[key];
    if(h*60+mi>nowMin)return;
    if(S.logs.some(l=>l.medId===m.id&&l.date===d&&l.time===t))return;
    if(sn){if(sn>Date.now())return;delete S.snooze[key]}
    else{if(S.notified[key])return;if(nowMin-(h*60+mi)>180)return}
    S.notified[key]=Date.now();notify(m,t,key);
  }));
  persist();
}
function handleAct(a,mid,t,d){
  if(!USER){PENDING=[a,mid,t,d];return}
  if(d!==TODAY()||!S.meds.some(m=>m.id===mid))return;
  if(a==='taken')setDose(mid,t,'taken');
  else if(a==='snooze'){S.snooze[d+'|'+mid+'|'+t]=Date.now()+10*60000;persist()}
}
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(r=>{SWREG=r}).catch(()=>{});
  navigator.serviceWorker.addEventListener('message',e=>{const x=e.data||{};if(x.type==='dose-action')handleAct(x.action,x.medId,x.t,x.date)});
}
const qs=new URLSearchParams(location.search);
if(qs.get('act')){handleAct(qs.get('act'),qs.get('m'),qs.get('t'),qs.get('d'));history.replaceState(null,'',location.pathname)}
setInterval(checkDue,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkDue();pull();render()}});

/* ---------- Delete person (two taps, no pop-up box) ---------- */
let delFor=null,delTimer=0;
function resetDel(){
  clearTimeout(delTimer);delFor=null;
  const b=document.querySelector('[data-a=delprof]');if(b)b.textContent='Delete this person';
}
function deleteProfile(){
  if(S.profiles.length<2){say('You need at least one person. Add another person first.');return}
  const p=S.profiles.find(x=>x.id===S.cur);
  const ids=S.meds.filter(m=>m.profileId===p.id).map(m=>m.id);
  if(delFor!==p.id){                       // first tap: ask to confirm
    resetDel();delFor=p.id;
    document.querySelector('[data-a=delprof]').textContent='Tap again to delete '+p.name+' and '+ids.length+' medicine'+(ids.length===1?'':'s');
    delTimer=setTimeout(resetDel,5000);    // goes back to normal after 5 seconds
    return;
  }
  resetDel();                              // second tap: delete
  S.meds=S.meds.filter(m=>m.profileId!==p.id);
  S.logs=S.logs.filter(l=>!ids.includes(l.medId));
  S.profiles=S.profiles.filter(x=>x.id!==p.id);
  S.cur=S.profiles[0].id;
  save();render();say(p.name+' was deleted.');
}

function say(t){$('#msg').textContent=t;setTimeout(()=>{$('#msg').textContent=''},5000)}
/* ---------- Medicine form: as-needed and course dates ---------- */
function togglePrn(){
  const on=$('#prn').checked;
  $('#prnbox').hidden=!on;$('#schedbox').hidden=on;$('#gap').required=on;
  document.querySelectorAll('#times input').forEach(i=>i.required=!on);
}
$('#prn').onchange=togglePrn;

/* ---------- Print summary and WhatsApp ---------- */
function summaryHtml(){
  const p=S.profiles.find(x=>x.id===S.cur),meds=S.meds.filter(m=>m.profileId===S.cur),st=stats(meds);
  const pct=st.planned?Math.round(st.taken/st.planned*100)+'% ('+st.taken+' of '+st.planned+' scheduled doses)':'no scheduled doses';
  const rows=meds.map(m=>`<tr><td>${esc(m.name)} ${esc(m.strength)}</td><td>${esc(medLine(m))}${m.notes?'<br>'+esc(m.notes):''}</td><td>${m.qty}</td><td>${m.expiry.slice(0,7)}</td></tr>`).join('');
  return `<h1>Medicine summary</h1><p><b>${esc(p.name)}</b>${p.rel?' ('+esc(p.rel)+')':''}<br>Date: ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p>
  <table><tr><th>Medicine</th><th>How to take</th><th>Stock</th><th>Expiry</th></tr>${rows||'<tr><td colspan="4">No medicines added.</td></tr>'}</table>
  <p>Doses taken in the last 7 days: ${pct}.</p><p><small>Made with MediMate, a reminder and organiser. It is not medical advice.</small></p>`;
}
function printSummary(){$('#print').innerHTML=summaryHtml();window.print()}
function shareWA(){
  const p=S.profiles.find(x=>x.id===S.cur),meds=S.meds.filter(m=>m.profileId===S.cur);
  const lines=meds.map((m,n)=>(n+1)+'. '+m.name+(m.strength?' '+m.strength:'')+': '+medLine(m)+(m.notes?' ('+m.notes+')':''));
  const t='Medicines for '+p.name+(p.rel?' ('+p.rel+')':'')+'\n'+(lines.join('\n')||'No medicines added.')+'\n\nSent from MediMate';
  window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank');
}

/* ---------- Cabinet search and sort ---------- */
document.addEventListener('input',e=>{if(e.target.id==='q'){cabQ=e.target.value;$('#cablist').innerHTML=cabList()}});
document.addEventListener('change',e=>{if(e.target.id==='sort'){cabSort=e.target.value;$('#cablist').innerHTML=cabList()}});
setInterval(()=>{if(!document.hidden&&tab==='today'&&!document.querySelector('dialog[open]'))render()},60000);

/* ---------- Scan expiry date (OCR) ---------- */
/* parser start */
const MON={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
function findExpiry(raw){
  const t=String(raw).toUpperCase().replace(/O(?=\d)/g,'0').replace(/(\d)O/g,(s,a)=>a+'0');
  const Y=new Date().getFullYear(),found=[];
  const add=(i,m,y,txt)=>{if(y<100)y+=2000;if(m<1||m>12||y<Y-3||y>Y+15)return;found.push({i,m,y,raw:txt.trim()})};
  const run=(re,fn)=>{let x;while((x=re.exec(t)))fn(x,x.index+x[1].length,x[0].slice(x[1].length))};
  run(/(^|[^\d\/\-.])(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d)/g,(x,i,r)=>add(i,+x[3],+x[4],r));   // 12/08/2027
  run(/(^|[^\d\/\-.])(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d|[\/\-.]\d)/g,(x,i,r)=>add(i,+x[2],+x[3],r));                // 08/2027, 08-27
  run(/(^|[^\d\/\-.])(\d{4})\s*[\/\-.]\s*(\d{1,2})(?!\d)/g,(x,i,r)=>add(i,+x[3],+x[2],r));                               // 2027-08
  run(/(^|\b)(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?\s*[\-\/,.']?\s*(\d{4}|\d{2})(?!\d)/g,(x,i,r)=>add(i,MON[x[2].slice(0,3)],+x[3],r)); // AUG 2027
  if(!found.length)return null;
  found.sort((a,b)=>a.i-b.i);
  const pre=c=>t.slice(Math.max(0,c.i-24),c.i);
  const isExp=c=>/(EXP[A-Z]*\.?|USE BEFORE|USE BY|BEST BEFORE|VALID[A-Z ]*)[\s:.\-]*(DATE|DT)?[\s:.\-]*$/.test(pre(c));
  const isMfg=c=>/(MFG|MFD|MANUF[A-Z]*|MADE|PROD[A-Z]*)[\s:.\-]*(DATE|DT|ON)?[\s:.\-]*$/.test(pre(c));
  const latest=(a,b)=>(b.y*12+b.m)-(a.y*12+a.m);
  const c=found.find(isExp)||found.filter(x=>!isMfg(x)).sort(latest)[0]||found.sort(latest)[0];
  return {ym:c.y+'-'+String(c.m).padStart(2,'0'),label:new Date(c.y,c.m-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}),raw:c.raw};
}
/* parser end */
let tessP=null;
function loadTess(){
  if(window.Tesseract)return Promise.resolve();
  return tessP||(tessP=new Promise((ok,no)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload=ok;s.onerror=()=>{tessP=null;no(new Error('load'))};document.head.appendChild(s);
  }));
}
async function prepImage(file){          // shrink, grey and add contrast so OCR reads better
  const bmp=await createImageBitmap(file),k=Math.min(1,1800/Math.max(bmp.width,bmp.height));
  const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);
  const g=cv.getContext('2d');g.drawImage(bmp,0,0,cv.width,cv.height);
  const im=g.getImageData(0,0,cv.width,cv.height),d=im.data;
  for(let i=0;i<d.length;i+=4){let y=.299*d[i]+.587*d[i+1]+.114*d[i+2];y=Math.max(0,Math.min(255,(y-128)*1.5+128));d[i]=d[i+1]=d[i+2]=y}
  g.putImageData(im,0,0);return cv;
}
$('#scanbtn').onclick=()=>$('#scanfile').click();
$('#scanfile').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  const msg=$('#scanmsg');msg.textContent='Reading the photo. The first scan needs internet and can take 10 to 20 seconds.';
  try{
    await loadTess();
    const {data}=await Tesseract.recognize(await prepImage(f),'eng');
    const r=findExpiry(data.text);
    if(r){$('#exp').value=r.ym;msg.textContent='Read "'+r.raw+'" and set the expiry to '+r.label+'. Check it against the pack before saving.'}
    else msg.textContent='Could not find an expiry date. Try a closer, brighter photo, or type it in.';
  }catch(err){msg.textContent='Scanning did not work. Check your internet and try again, or type the date in.'}
};

/* ---------- Login and cloud sync (Supabase) ---------- */
const CFG=window.MEDIMATE_CONFIG||{};
const configured=()=>CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&!/YOUR-PROJECT|YOUR-ANON/.test(CFG.SUPABASE_URL+CFG.SUPABASE_ANON_KEY);
let authMode='login',pushT=0,pushing=false,dirty=false;
const toCloud=()=>{const o={...S};DEVICE.forEach(k=>delete o[k]);return o};
const pick=l=>{const o={};if(l)DEVICE.forEach(k=>{if(l[k]!==undefined)o[k]=l[k]});return o};
function authMsg(t){$('#authmsg').textContent=t||''}
function setSync(t){$('#who').textContent=USER?('Signed in as '+(USER.email||'your account')+'. '+t):''}
function setMode(m){
  authMode=m;authMsg('');
  document.querySelectorAll('.atab').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  const nw=m==='newpw';
  $('#emailrow').hidden=nw;$('#aemail').required=!nw;$('#authtabs').hidden=nw;$('#forgot').hidden=nw;
  $('#pwlabel').textContent=nw?'New password':'Password';
  $('#apw').autocomplete=m==='login'?'current-password':'new-password';
  $('#authgo').textContent=m==='login'?'Log in':m==='signup'?'Create account':'Save new password';
  $('#authsub').textContent=nw?'Choose a new password for your account.':m==='signup'?'Create a free account to keep your medicines safe and in sync.':'Log in to see your family medicines on any device.';
}
function loadSB(){
  if(window.supabase)return Promise.resolve();
  return new Promise((ok,no)=>{const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@'+(CFG.SUPABASE_JS_VERSION||'2.110.1')+'/dist/umd/supabase.js';
    s.onload=ok;s.onerror=()=>no(new Error('load'));document.head.appendChild(s)});
}
function cachedUser(){                   // the login the browser remembers, used when there is no internet
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
    if(/^sb-.*-auth-token$/.test(k)){const v=JSON.parse(localStorage.getItem(k));if(v&&v.user&&v.user.id)return v.user}}}catch(e){}
  return null;
}
async function enter(user){
  USER=user;KEYU='medimate:v1:'+user.id;
  let local=null,cloud=null,moved=false,online=false;
  try{local=JSON.parse(localStorage.getItem(KEYU)||'null')}catch(e){}
  if(SB)try{
    const {data,error}=await SB.from('user_data').select('data').eq('user_id',user.id).maybeSingle();
    if(error)throw error;cloud=data?data.data:null;online=true;
  }catch(e){console.warn(e)}
  if(!local&&!cloud&&online)try{            // first login: bring in data saved here before login existed
    const old=JSON.parse(localStorage.getItem(LEGACY)||'null');
    if(old&&Array.isArray(old.meds)){local=old;local._ts=Date.now();moved=true}
  }catch(e){}
  let send=false;
  if(cloud&&(!local||(cloud._ts||0)>=(local._ts||0)))S=norm({...cloud,...pick(local)});
  else if(local){S=norm(local);send=true}
  else{S=fresh();S._ts=Date.now();send=true}
  if(!S.profiles.some(p=>p.id===S.cur))S.cur=S.profiles[0].id;
  persist();if(moved)localStorage.removeItem(LEGACY);
  document.body.classList.remove('locked');authMsg('');$('#apw').value='';
  setSync(online?'Synced.':'Could not reach your account. Showing the copy saved on this device.');
  render();
  if(send&&online){dirty=true;push()}
  if(PENDING){const p=PENDING;PENDING=null;handleAct(...p)}
  checkDue();
}
function leave(){
  USER=null;KEYU=null;S=fresh();clearTimeout(pushT);dirty=false;
  document.body.classList.add('locked');setMode('login');$('#who').textContent='';
}
async function logout(){
  const key=KEYU;
  try{await push()}catch(e){}
  const unsynced=dirty||pushing;
  try{if(SB)await SB.auth.signOut()}catch(e){}
  if(!unsynced&&key)try{localStorage.removeItem(key)}catch(e){}    // keep the copy only if something is not synced yet
  if(USER)leave();
}
function pushSoon(){if(!USER)return;dirty=true;clearTimeout(pushT);pushT=setTimeout(push,800)}
async function push(){
  if(!USER||!SB||pushing||!dirty)return;
  if(!navigator.onLine){setSync('Offline. Changes will sync when you are back online.');return}
  pushing=true;dirty=false;setSync('Saving...');
  let err=null;
  try{const r=await SB.from('user_data').upsert({user_id:USER.id,data:toCloud(),updated_at:new Date().toISOString()});err=r.error}catch(e){err=e}
  pushing=false;
  if(err){dirty=true;console.warn(err);setSync('Not synced yet. Will try again.');clearTimeout(pushT);pushT=setTimeout(push,15000)}
  else if(dirty)pushSoon();else setSync('Synced.');
}
window.addEventListener('online',()=>{if(dirty)push()});
async function pull(){                   // pick up changes made on another device
  if(!USER||!SB||dirty||pushing||!navigator.onLine)return;
  try{
    const {data,error}=await SB.from('user_data').select('data').eq('user_id',USER.id).maybeSingle();
    if(error||!data||(data.data._ts||0)<=(S._ts||0))return;
    S=norm({...data.data,...pick(S)});if(!S.profiles.some(p=>p.id===S.cur))S.cur=S.profiles[0].id;
    persist();render();
  }catch(e){}
}
$('#authform').onsubmit=async e=>{
  e.preventDefault();if(!SB)return;
  const em=$('#aemail').value.trim(),pw=$('#apw').value;
  authMsg('Please wait...');$('#authgo').disabled=true;
  try{
    if(authMode==='login'){const {data,error}=await SB.auth.signInWithPassword({email:em,password:pw});if(error)throw error;await enter(data.user)}
    else if(authMode==='signup'){
      const {data,error}=await SB.auth.signUp({email:em,password:pw});if(error)throw error;
      if(data.session)await enter(data.user);else authMsg('Account created. Check your email to confirm it, then log in.');
    }else{const {data,error}=await SB.auth.updateUser({password:pw});if(error)throw error;history.replaceState(null,'',location.pathname);await enter(data.user)}
  }catch(err){authMsg(err.message||'Something went wrong. Try again.')}
  $('#authgo').disabled=false;
};
$('#forgot').onclick=async()=>{
  const em=$('#aemail').value.trim();
  if(!SB)return;if(!em){authMsg('Type your email above first.');return}
  const {error}=await SB.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});
  authMsg(error?error.message:'If this email has an account, a reset link is on its way.');
};
async function initAuth(){
  const done=()=>document.body.classList.remove('booting');
  setMode('login');
  if(!configured()){done();authMsg('Login is not set up yet. Open config.js and add your Supabase URL and anon key.');$('#authgo').disabled=true;return}
  try{await loadSB();SB=supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY)}
  catch(e){                              // no internet: open the remembered account from the copy on this device
    done();const u=cachedUser();
    if(u)await enter(u);else authMsg('Could not reach the login service. Check your internet and reload.');
    return;
  }
  SB.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT'&&USER)leave()});
  if(/type=recovery/.test(location.hash)){done();setMode('newpw');return}         // opened from a password reset email
  const {data}=await SB.auth.getSession();
  done();
  if(data.session)await enter(data.session.user);
}

initAuth();
