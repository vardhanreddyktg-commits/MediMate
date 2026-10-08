const KEY='medimate:v1';
const norm=s=>Object.assign({notified:{},snooze:{},remind:false},s);
function load(){try{const r=localStorage.getItem(KEY);if(r)return norm(JSON.parse(r))}catch(e){}
  return norm({profiles:[{id:'p1',name:'Me',rel:'Self'}],meds:[],logs:[],cur:'p1'})}
let S=load(),tab='today',SWREG=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const TODAY=()=>iso(new Date());
const dleft=e=>Math.round((new Date(e+'T00:00')-new Date(TODAY()+'T00:00'))/864e5);
const uid=()=>Math.random().toString(36).slice(2,9);
const stat=m=>{const d=dleft(m.expiry);return d<0?'expired':d<=30?'soon':'safe'};
const supply=m=>m.times.length?Math.floor(m.qty/(m.dose*m.times.length)):null;
const pname=id=>(S.profiles.find(p=>p.id===id)||{}).name||'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;

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
function adherence(meds){
  const per=meds.reduce((a,m)=>a+m.times.length,0);if(!per)return'';
  const ids=new Set(meds.map(m=>m.id)),from=iso(new Date(Date.now()-6*864e5));
  const tk=S.logs.filter(l=>ids.has(l.medId)&&l.date>=from&&l.status==='taken').length;
  const pct=Math.min(100,Math.round(tk/(per*7)*100));
  return `<div class="card s-safe"><div class="mu">Doses taken in the last 7 days</div><div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b> <span class="mu">(${tk} of ${per*7})</span></div>`;
}
function todayView(){
  const meds=S.meds.filter(m=>m.profileId===S.cur),items=[];
  meds.forEach(m=>m.times.forEach(t=>items.push({m,t})));
  items.sort((a,b)=>a.t.localeCompare(b.t));
  const now=new Date().toTimeString().slice(0,5),d=TODAY();
  const rows=items.map(({m,t})=>{
    const l=S.logs.find(x=>x.medId===m.id&&x.date===d&&x.time===t),st=l?l.status:'',late=!st&&t<now;
    const b=(s,lab,c)=>`<button class="${c||''}" data-a="dose" data-m="${m.id}" data-t="${t}" data-s="${s}">${lab}</button>`;
    return `<div class="card row s-${st==='taken'?'safe':late?'expired':'soon'}"><div><b>${fmt(t)}</b> ${esc(m.name)} <span class="mu">${esc(m.strength)}</span><div class="mu">${m.dose} unit${m.dose>1?'s':''}${m.notes?', '+esc(m.notes):''}</div></div>
    <div class="act">${st?`<span class="chip ${st==='taken'?'ok':'warn'}">${st==='taken'?'Taken':'Skipped'}</span>${b('none','Undo','ghost')}`:`${late?'<span class="chip bad">Overdue</span>':''}${b('taken','Taken')}${b('skipped','Skip','ghost')}`}</div></div>`;
  }).join('');
  return remindBar()+alerts()+adherence(meds)+'<h2>Today\'s doses</h2>'+(rows||empty('No doses scheduled for this person. Add a medicine and choose when to take it.'));
}
function card(m){
  const d=dleft(m.expiry),s=supply(m);
  return `<div class="card row s-${stat(m)}"><div><b>${esc(m.name)}</b> <span class="mu">${esc(m.strength)}</span>
  <div class="mu">Expires ${m.expiry.slice(0,7)}, ${d<0?Math.abs(d)+' days ago':d+' days left'}</div>
  <div class="mu">${m.qty} in stock${s!==null?', about '+s+' days of supply':''}</div></div>
  <button class="ghost" data-a="edit" data-m="${m.id}">Edit</button></div>`;
}
function cabinetView(){
  const meds=S.meds.filter(m=>m.profileId===S.cur).sort((a,b)=>a.expiry.localeCompare(b.expiry));
  const g={expired:[],soon:[],safe:[]};meds.forEach(m=>g[stat(m)].push(m));
  const sec=(k,t,n)=>g[k].length?`<h2>${t} (${g[k].length})</h2>${n?`<p class="mu">${n}</p>`:''}${g[k].map(card).join('')}`:'';
  return sec('expired','Expired','Do not use these. Return them to a pharmacy or dispose of them safely.')+sec('soon','Expiring within 30 days')+sec('safe','Safe to use')||empty('This cabinet is empty. Tap Add medicine to start.');
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
    setTimes(m.times);
  }else setTimes(['08:00']);
  $('#dm').showModal();
}
$('#mf').onsubmit=e=>{
  e.preventDefault();const f=e.target;
  const times=getTimes();
  const [y,mo]=f.exp.value.split('-').map(Number);
  const o={name:f.nm.value.trim(),strength:f.str.value.trim(),qty:+f.qty.value,dose:+f.dose.value||1,
    expiry:iso(new Date(y,mo,0)),times:times,notes:f.notes.value.trim()};
  if(f.mid.value)Object.assign(S.meds.find(x=>x.id===f.mid.value),o);else S.meds.push({id:uid(),profileId:S.cur,...o});
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
  else if(a==='export')exportData();
  else if(a==='delprof')deleteProfile();
  else if(a==='import')$('#imp').click();
  else if(a==='remind-on')Notification.requestPermission().then(p=>{S.remind=p==='granted';save();render();
    if(S.remind)showNote('MediMate reminders are on',{body:'You will get a notification at every dose time.',tag:'test',icon:'icon-192.png'})});
  else if(a==='remind-off'){S.remind=false;save();render()}
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
  if(!S.remind||!('Notification' in window)||Notification.permission!=='granted')return;
  const now=new Date(),d=TODAY(),nowMin=now.getHours()*60+now.getMinutes();
  [S.notified,S.snooze].forEach(o=>Object.keys(o).forEach(k=>{if(!k.startsWith(d))delete o[k]}));
  S.meds.forEach(m=>m.times.forEach(t=>{
    const [h,mi]=t.split(':').map(Number),key=d+'|'+m.id+'|'+t,sn=S.snooze[key];
    if(h*60+mi>nowMin)return;
    if(S.logs.some(l=>l.medId===m.id&&l.date===d&&l.time===t))return;
    if(sn){if(sn>Date.now())return;delete S.snooze[key]}
    else{if(S.notified[key])return;if(nowMin-(h*60+mi)>180)return}
    S.notified[key]=Date.now();notify(m,t,key);
  }));
  save();
}
function handleAct(a,mid,t,d){
  if(d!==TODAY()||!S.meds.some(m=>m.id===mid))return;
  if(a==='taken')setDose(mid,t,'taken');
  else if(a==='snooze'){S.snooze[d+'|'+mid+'|'+t]=Date.now()+10*60000;save()}
}
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(r=>{SWREG=r}).catch(()=>{});
  navigator.serviceWorker.addEventListener('message',e=>{const x=e.data||{};if(x.type==='dose-action')handleAct(x.action,x.medId,x.t,x.date)});
}
const qs=new URLSearchParams(location.search);
if(qs.get('act')){handleAct(qs.get('act'),qs.get('m'),qs.get('t'),qs.get('d'));history.replaceState(null,'',location.pathname)}
setInterval(checkDue,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkDue();render()}});

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

/* ---------- Backup and restore ---------- */
function say(t){$('#msg').textContent=t;setTimeout(()=>{$('#msg').textContent=''},5000)}
function exportData(){
  const b=new Blob([JSON.stringify(S,null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='medimate-backup-'+TODAY()+'.json';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);say('Backup downloaded.');
}
$('#imp').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{try{
    const d=JSON.parse(r.result);
    if(!Array.isArray(d.profiles)||!Array.isArray(d.meds)||!Array.isArray(d.logs)||!d.profiles.length)throw 0;
    if(!confirm('Replace the data on this device with the backup ('+d.meds.length+' medicines)?'))return;
    S=norm(d);if(!S.profiles.some(p=>p.id===S.cur))S.cur=S.profiles[0].id;
    save();render();say('Backup restored.');
  }catch(x){say('That file is not a MediMate backup.')}};
  r.readAsText(f);e.target.value='';
};
checkDue();
render();
