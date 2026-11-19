'use strict';
const $=id=>document.getElementById(id);
const enc=new TextEncoder(),dec=new TextDecoder();
const b2u=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
const u2b=u=>{let s='';u=new Uint8Array(u);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const ITER=310000;
const NAMES={attendance:'Attendance',discipline:'Behavior & Discipline'};
let entries=[],session=null,cache={};
async function pbkdf(password,salt,iter){
  const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function openEntry(entry,password){
  const k=await pbkdf(password,b2u(entry.salt),entry.iter);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b2u(entry.iv)},k,b2u(entry.data));
  return JSON.parse(dec.decode(plain));
}
async function makeEntry(username,password,payload){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const k=await pbkdf(password,salt,ITER);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(payload)));
  return {user:username.toLowerCase(),salt:u2b(salt),iter:ITER,iv:u2b(iv),data:u2b(ct)};
}
async function loadEntries(){
  const r=await fetch('users.json?'+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('Could not load users.');
  entries=await r.json();
}
async function dashboardHtml(name){
  if(cache[name])return cache[name];
  const r=await fetch('data/'+name+'.bin?'+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('Could not load the dashboard.');
  const buf=new Uint8Array(await r.arrayBuffer());
  const key=await crypto.subtle.importKey('raw',b2u(session.payload.keys[name]),'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12));
  return cache[name]=dec.decode(plain);
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('loginBtn'),err=$('loginErr');
  btn.disabled=true;err.textContent='Signing in…';
  try{
    await loadEntries();
    const user=$('u').value.trim().toLowerCase(),pw=$('p').value;
    const entry=entries.find(x=>x.user===user);
    let payload=null;
    if(entry){try{payload=await openEntry(entry,pw);}catch{payload=null;}}
    else{await pbkdf(pw,new Uint8Array(16),ITER);} // keep timing similar
    if(!payload){err.textContent='Wrong username or password.';return;}
    session={user,password:pw,payload};
    $('p').value='';err.textContent='';
    startApp();
  }catch(x){err.textContent=x.message||'Sign-in failed.';}
  finally{btn.disabled=false;}
});
function startApp(){
  $('login').hidden=true;$('app').hidden=false;
  $('who').textContent=session.payload.name||session.user;
  const tabs=$('tabs');tabs.innerHTML='';
  const items=Object.keys(session.payload.keys).filter(k=>NAMES[k]).map(k=>[k,NAMES[k]]);
  if(session.payload.admin)items.push(['admin','Manage Users']);
  items.forEach(([k,label])=>{const b=document.createElement('button');b.textContent=label;b.dataset.tab=k;b.onclick=()=>show(k);tabs.append(b);});
  if(items.length)show(items[0][0]);
}
async function show(k){
  document.querySelectorAll('#tabs button').forEach(b=>b.dataset.tab===k?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
  const frame=$('frame'),adm=$('admin');
  if(k==='admin'){frame.hidden=true;adm.hidden=false;renderAdmin();return;}
  adm.hidden=true;frame.hidden=false;
  try{frame.srcdoc=await dashboardHtml(k);}catch(e){frame.srcdoc='<p style="font:16px sans-serif;padding:20px">'+e.message+'</p>';}
}
$('logout').onclick=()=>{session=null;cache={};$('frame').srcdoc='';$('admin').innerHTML='';$('app').hidden=true;$('login').hidden=false;$('loginForm').reset();$('u').focus();};
/* ---------- admin ---------- */
let pending=null;
function renderAdmin(){
  const reg=session.payload.registry||[];
  const rows=reg.map(r=>'<tr><td>'+esc(r.user)+'</td><td>'+esc(r.name||'')+'</td><td>'+(r.admin?'Admin (all)':r.access.map(a=>NAMES[a]).join(', ')||'—')+'</td><td>'+(r.admin?'':'<button data-del="'+esc(r.user)+'">Remove</button>')+'</td></tr>').join('');
  $('admin').innerHTML='<h2>Manage Users</h2><p class="muted">Decide who can open each dashboard. Changes become live after you replace <b>users.json</b> in the GitHub repository.</p>'+
  '<div class="panel"><h3 style="margin:0">Users</h3><table><thead><tr><th>Username</th><th>Name</th><th>Access</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<form id="addForm" class="panel"><h3 style="margin:0">Add a user or change a password / access</h3>'+
  '<div class="row"><label style="flex:1 1 180px;display:grid">Username<input id="nu" required pattern="[A-Za-z0-9._-]+" placeholder="e.g. counselor1"></label><label style="flex:1 1 180px;display:grid">Display name<input id="nn" placeholder="e.g. Ms. Sara"></label></div>'+
  '<label style="display:grid">Password (at least 10 characters)<input id="np" type="text" minlength="10" required autocomplete="off"></label>'+
  '<div class="row"><strong>Can open:</strong><label><input type="checkbox" id="ca" checked> Attendance</label><label><input type="checkbox" id="cd"> Behavior &amp; Discipline</label></div>'+
  '<div class="row"><button class="primary">Apply</button><button type="button" id="genpw">Generate password</button></div><p id="addMsg" class="err"></p></form>'+
  '<div id="exportBox"></div>';
  $('genpw').onclick=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const r=crypto.getRandomValues(new Uint8Array(14));$('np').value=[...r].map(x=>a[x%a.length]).join('');};
  $('addForm').onsubmit=async e=>{
    e.preventDefault();
    const user=$('nu').value.trim().toLowerCase(),pw=$('np').value,access=[];
    if($('ca').checked)access.push('attendance');if($('cd').checked)access.push('discipline');
    if(user==='admin'&&access.length<2){$('addMsg').textContent='The admin account always keeps full access.';return;}
    if(!access.length){$('addMsg').textContent='Choose at least one dashboard.';return;}
    const name=$('nn').value.trim();
    const keys={};access.forEach(a=>keys[a]=session.payload.keys[a]);
    const ent=user==='admin'?null:await makeEntry(user,pw,{name:name||user,admin:false,keys});
    let reg=session.payload.registry.filter(r=>r.user!==user);
    if(user==='admin'){ // changing own password
      session.password=pw;
      reg.unshift({user:'admin',name:name||session.payload.name,access:['attendance','discipline'],admin:true});
    }else reg.push({user,name:name||user,access,admin:false});
    session.payload.registry=reg;
    if(user==='admin'){session.payload.name=name||session.payload.name;}
    await commit(ent,user);
    $('addMsg').className='ok';$('addMsg').textContent='Done. Give '+user+' the password you chose, then upload the new users.json below.';
  };
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    const u=b.dataset.del;session.payload.registry=session.payload.registry.filter(r=>r.user!==u);
    await commit(null,u,true);
  });
}
async function commit(newEntry,user,remove){
  let list=entries.filter(x=>x.user!==user);
  if(newEntry)list.push(newEntry);
  const adminEntry=await makeEntry('admin',session.password,session.payload);
  list=list.filter(x=>x.user!=='admin');list.unshift(adminEntry);
  entries=list;
  pending=JSON.stringify(list);
  renderAdmin();showExport();
}
function showExport(){
  $('exportBox').innerHTML='<div class="panel"><div class="note"><b>Last step:</b> download <b>users.json</b>, then in the GitHub repository choose <i>Add file → Upload files</i> and upload it (replace the old one). The change goes live in about a minute.</div><div class="row"><button class="primary" id="dlUsers">Download users.json</button></div></div>';
  $('dlUsers').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([pending],{type:'application/json'}));a.download='users.json';a.click();};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
