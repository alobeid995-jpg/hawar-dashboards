'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAMES={attendance:'Attendance',discipline:'Behavior & Discipline',referrals:'Counselor Referrals',followups:'Follow-Ups'};
const ICONS={home:'⌂',attendance:'▦',discipline:'⚑',referrals:'✉',followups:'☑',admin:'⚙'};
const BLURB={followups:'Re-sit and make-up exam approvals plus the parent–teacher contact log, with charts and Excel-ready downloads.',referrals:'Cases referred by the supervisor to the counselor, with feedback, follow-up status and new-case alerts.',attendance:'Daily and monthly attendance sheets, absence reports, Excel exports and charts for every section.',discipline:'Log incidents and school actions, review the incident log, and get weekly summaries with charts.',admin:'Create accounts, choose who can open each dashboard, reset passwords and load starting data.'};
if(!window.FB){document.body.innerHTML='<p style="padding:30px;font:16px sans-serif">The sign-in service could not be loaded. Please refresh the page.</p>';throw new Error('FB missing');}
let me=null,loaded={};
const errText=e=>{
  const c=(e&&e.code)||'';
  if(/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c))return 'Wrong email or password.';
  if(/too-many-requests/.test(c))return 'Too many attempts. Please wait a few minutes and try again.';
  if(/network/.test(c))return 'Network problem. Check your connection and try again.';
  if(/operation-not-allowed/.test(c))return 'Email/password sign-in is not enabled in Firebase yet.';
  if(/permission-denied/.test(c))return 'You do not have permission for this. (permission-denied)';
  return (e&&(e.message||c))||'Something went wrong.';
};
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('loginBtn'),err=$('loginErr');
  btn.disabled=true;err.className='err';err.textContent='Signing in…';
  try{await FB.signIn($('u').value.trim(),$('p').value);$('p').value='';err.textContent='';}
  catch(x){err.textContent=errText(x);console.error(x);}
  finally{btn.disabled=false;}
});
FB.onAuth.push((user,profile)=>{
  if(!user){if(refUnsub){refUnsub();refUnsub=null;}me=null;loaded={};['attendance','discipline','referrals','followups'].forEach(k=>{const f=$('frame-'+k);f.removeAttribute('src');f.hidden=true;});$('admin').innerHTML='';$('home').innerHTML='';$('app').hidden=true;$('login').hidden=false;return;}
  if(!profile||profile.error||!profile.access){
    $('login').hidden=true;$('app').hidden=false;$('tabs').innerHTML='';$('who').textContent=user.email||'';$('role').textContent='';
    ['attendance','discipline','admin'].forEach(n=>{const e=$(n==='admin'?'admin':'frame-'+n);if(e)e.hidden=true;});
    const h=$('home');h.hidden=false;
    const code=profile&&profile.error?profile.error:'no-profile';
    h.innerHTML='<h2>Could not load your account</h2><p class="muted">'+(/permission/.test(code)?'The database rules are not published yet, or this account has no access. If you are the administrator, publish the Firestore rules, then reload.':'No access has been set for this account yet. Ask the administrator.')+'</p><p class="muted small">Code: '+esc(code)+'</p>';
    return;}
  me=profile;startApp();
});
FB.ready.then(user=>{ if(!user){$('login').hidden=false;} });
$('logout').onclick=()=>FB.signOut();
function startApp(){
  $('login').hidden=true;$('app').hidden=false;
  $('who').textContent=me.name||me.email;$('role').textContent=me.title||'';
  const tabs=$('tabs');tabs.innerHTML='';
  const keys=me.access.filter(k=>NAMES[k]);
  const items=[['home','Home'],...keys.map(k=>[k,NAMES[k]])];
  if(me.admin)items.push(['admin','Manage Users']);
  items.forEach(([k,label])=>{const b=document.createElement('button');b.innerHTML='<span class="ic">'+ICONS[k]+'</span>'+esc(label);b.dataset.tab=k;b.onclick=()=>show(k);tabs.append(b);});
  show('home');
  startReferralAlerts();
}
function show(k){
  document.querySelectorAll('#tabs button').forEach(b=>b.dataset.tab===k?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
  ['attendance','discipline','referrals','followups'].forEach(n=>{
    const f=$('frame-'+n);f.hidden=k!==n;
    if(k===n&&!f.getAttribute('src'))f.src=n+'.html?v=14';
  });
  $('admin').hidden=k!=='admin';$('home').hidden=k!=='home';
  if(k==='home')renderHome();
  if(k==='admin')renderAdmin();
}
function renderHome(){
  const keys=me.access.filter(k=>NAMES[k]);if(me.admin)keys.push('admin');
  const label=k=>k==='admin'?'Manage Users':NAMES[k];
  let body;
  if(!keys.length)body='<div class="panel"><h3>No dashboards yet</h3><p class="muted">Your account is signed in, but no dashboard has been assigned to you. Please ask the administrator to give you access.</p></div>';
  else body='<div class="cards">'+keys.map(k=>'<article class="dcard"><span class="tile">'+ICONS[k]+'</span><h3>'+esc(label(k))+'</h3><p>'+BLURB[k]+'</p><button class="primary" data-open="'+k+'">Open</button></article>').join('')+'</div>';
  const fr=window.__refFresh||0;
  $('home').innerHTML=(fr&&!me.admin?'<div class="newref" data-open="referrals">✉ <strong>'+fr+' new referral'+(fr===1?'':'s')+'</strong> from the supervisor · click to open</div>':'')+'<div class="hero"><small>Middle School · Student Affairs</small><h1>Welcome, '+esc(me.name||me.email)+'</h1><p>'+(me.title?esc(me.title)+' · ':'')+'Choose a dashboard to get started.</p></div>'+body;
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>show(b.dataset.open));
}
/* ---------------- admin ---------------- */
const rulesText=()=>{const a=(window.HAWAR_CONFIG.adminEmail||'').toLowerCase();return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isAdmin() { return signedIn() && request.auth.token.email == '${a}'; }
    function can(area) {
      return isAdmin() || (signedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && area in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.access);
    }
    function linkOk(k, t) {
      return k is string && k.matches('[A-Za-z0-9]+') && k.size() <= 40
        && exists(/databases/$(database)/documents/formLinks/$(k))
        && get(/databases/$(database)/documents/formLinks/$(k)).data.active == true
        && get(/databases/$(database)/documents/formLinks/$(k)).data.type == t;
    }
    function formOk(id) {
      let d = request.resource.data;
      return d.source == 'form' && d.id == id
        && d.type in ['parent','resit'] && linkOk(d.key, d.type)
        && d.keys().hasOnly(['key','source','type','id','student','grade','model','teacher','date','subject','reason','approval','makeup','contact','method','outcome','createdAt'])
        && d.student is string && d.student.size() > 0 && d.student.size() <= 120
        && d.teacher is string && d.teacher.size() > 0 && d.teacher.size() <= 80
        && d.grade is string && d.grade.size() <= 6
        && d.date is string && d.date.size() == 10
        && d.get('reason','') is string && d.get('reason','').size() <= 1000
        && d.get('outcome','') is string && d.get('outcome','').size() <= 1000
        && d.get('approval','Pending') == 'Pending' && d.get('makeup','No') == 'No';
    }
    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow write: if isAdmin();
    }
    match /attendance/{doc} { allow read, write: if can('attendance'); }
    match /attendanceDays/{doc} { allow read, write: if can('attendance'); }
    match /incidents/{doc} { allow read, write: if can('discipline'); }
    match /disciplineMeta/{doc} { allow read, write: if can('discipline'); }
    match /followups/{doc} {
      allow read, update, delete: if can('followups');
      allow create: if can('followups') || formOk(doc);
    }
    match /formLinks/{k} {
      allow read, write: if can('followups');
    }
    match /referrals/{id} {
      allow read: if can('referrals') || can('discipline');
      allow create, delete: if can('discipline');
      allow update: if can('discipline') || (can('referrals')
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['counselorFeedback','status','seen','seenAt','updatedAt']));
    }
  }
}`;};
const genPw=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const r=crypto.getRandomValues(new Uint8Array(14));return [...r].map(x=>a[x%a.length]).join('');};
async function renderAdmin(){
  const box=$('admin');
  box.innerHTML='<h2>Manage Users</h2><p class="muted">Create accounts and choose who can open each dashboard. Changes apply immediately.</p><div class="panel"><p id="ulist">Loading users…</p></div>';
  let users=[];
  try{users=await FB.listUsers();}catch(e){$('ulist').innerHTML='<span class="err">Could not load users: '+esc(errText(e))+'</span>';}
  const rows=users.sort((a,b)=>(a.email||'').localeCompare(b.email||'')).map(u=>{
    const own=(u.email||'').toLowerCase()===(me.email||'').toLowerCase();
    return '<tr data-uid="'+esc(u.uid)+'" data-email="'+esc(u.email)+'"><td><strong>'+esc(u.name||'')+'</strong><br><span class="muted small">'+esc(u.email||'')+(u.title?' · '+esc(u.title):'')+'</span></td>'+
    '<td>'+(own?'<span class="tag">Administrator · all dashboards</span>':['attendance','discipline','referrals','followups'].map(a=>'<label style="display:inline-flex;gap:6px;margin-inline-end:12px;align-items:center"><input type="checkbox" style="width:auto" data-a="'+a+'"'+((u.access||[]).includes(a)?' checked':'')+'> '+NAMES[a]+'</label>').join(''))+'</td>'+
    '<td>'+(own?'':'<button data-act="save">Save</button> <button data-act="reset">Send reset email</button> <button data-act="remove" class="danger">Remove access</button>')+'</td></tr>';
  }).join('');
  if(users.length||!$('ulist').querySelector('.err'))$('ulist').outerHTML='<table><thead><tr><th>User</th><th>Can open</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="3">No users yet.</td></tr>')+'</tbody></table><p id="umsg" class="err small"></p>';
  box.insertAdjacentHTML('beforeend',
  '<form id="addForm" class="panel"><h3 style="margin:0">Add a user</h3>'+
  '<div class="row"><label style="flex:1 1 200px;display:grid">Full name<input id="nn" required placeholder="e.g. Ms. Sara"></label><label style="flex:1 1 200px;display:grid">Title (optional)<input id="nt" placeholder="e.g. Counselor"></label></div>'+
  '<label style="display:grid">Email<input id="ne" type="email" required autocomplete="off" placeholder="name@example.com"></label>'+
  '<label style="display:grid">Password (at least 8 characters)<input id="np" type="text" minlength="8" required autocomplete="off"></label>'+
  '<div class="row"><strong>Can open:</strong><label><input type="checkbox" id="ca" checked> Attendance</label><label><input type="checkbox" id="cd"> Behavior &amp; Discipline</label><label><input type="checkbox" id="cr"> Counselor Referrals</label><label><input type="checkbox" id="cf"> Follow-Ups</label></div>'+
  '<div class="row"><button class="primary" id="addBtn">Create account</button><button type="button" id="genpw">Generate password</button></div><p id="addMsg" class="err"></p></form>'+
  '<div class="panel"><h3 style="margin:0">Starting data</h3><p class="muted">Load the first records once into the database (files you keep private). Existing records with the same keys are replaced.</p>'+
  '<div class="row"><label style="display:grid;gap:6px">Attendance file (attendance-seed.json)<input type="file" id="seedAtt" accept=".json"></label><label style="display:grid;gap:6px">Discipline file (discipline-seed.json)<input type="file" id="seedDis" accept=".json"></label><label style="display:grid;gap:6px">Referrals file (referrals-seed.json)<input type="file" id="seedRef" accept=".json"></label></div><p id="seedMsg" class="small"></p></div>'+
  '<div class="panel"><h3 style="margin:0">Teacher forms (no sign-in)</h3><p class="muted">Open <strong>Follow-Ups</strong>: each tab has a <em>Generate link</em> button, plus <em>Pause</em>/<em>Resume</em> to stop or restart the link at any time. Nothing else to set up here.</p></div>'+
  '<div class="panel"><h3 style="margin:0">Security rules</h3><p class="muted">Paste these into Firebase → Firestore Database → Rules → Publish. They are what really stops a user from reading a dashboard they were not given.</p><div class="mono" id="rules"></div><div class="row"><button id="copyRules">Copy rules</button></div></div>');
  $('rules').textContent=rulesText();
  $('copyRules').onclick=async()=>{try{await navigator.clipboard.writeText(rulesText());$('copyRules').textContent='Copied';}catch{ }};
  $('genpw').onclick=()=>{$('np').value=genPw();};
  $('addForm').onsubmit=async e=>{
    e.preventDefault();
    const access=[];if($('ca').checked)access.push('attendance');if($('cd').checked)access.push('discipline');if($('cr').checked)access.push('referrals');if($('cf').checked)access.push('followups');
    const msg=$('addMsg');msg.className='err';
    if(!access.length){msg.textContent='Choose at least one dashboard.';return;}
    $('addBtn').disabled=true;msg.textContent='Creating…';
    try{
      await FB.createUser($('ne').value.trim(),$('np').value,$('nn').value.trim(),$('nt').value.trim(),access);
      msg.className='ok';msg.textContent='Account created. Give '+$('ne').value.trim()+' the password you chose.';
      setTimeout(renderAdmin,1200);
    }catch(x){msg.textContent=/email-already-in-use/.test(x.code||'')?'This email already has an account. Use the table above to change its access.':errText(x);console.error(x);}
    finally{$('addBtn').disabled=false;}
  };
  box.querySelectorAll('tr[data-uid] button').forEach(b=>b.onclick=async()=>{
    const tr=b.closest('tr'),uid=tr.dataset.uid,email=tr.dataset.email,m=$('umsg');m.className='err small';m.textContent='';
    try{
      if(b.dataset.act==='save'){const access=[...tr.querySelectorAll('[data-a]:checked')].map(c=>c.dataset.a);await FB.saveUser(uid,{access});m.className='ok small';m.textContent='Saved access for '+email+'.';}
      if(b.dataset.act==='reset'){await FB.resetPassword(email);m.className='ok small';m.textContent='Password reset email sent to '+email+'.';}
      if(b.dataset.act==='remove'){if(!confirm('Remove all access for '+email+'? Their sign-in account stays but they will see no dashboards.'))return;await FB.removeUserAccess(uid);renderAdmin();}
    }catch(x){m.textContent=errText(x);}
  });
  const seed=(id,fn,label)=>$(id).onchange=async ev=>{
    const f=ev.target.files[0];ev.target.value='';if(!f)return;
    const m=$('seedMsg');m.className='small';m.textContent='Reading '+f.name+'…';
    try{
      const json=JSON.parse(await f.text());
      m.textContent='Uploading '+label+'… this can take a minute.';
      const r=await fn(json);
      m.className='ok small';m.textContent=label+' loaded: '+Object.entries(r).map(([k,v])=>v+' '+k).join(', ')+'.';
    }catch(x){m.className='err small';m.textContent='Could not load '+label+': '+errText(x);console.error(x);}
  };
  seed('seedAtt',FB.importAttendance,'attendance data');
  seed('seedDis',FB.importDiscipline,'discipline data');
  seed('seedRef',FB.importReferrals,'referrals data');
}

/* ---------------- new-referral alerts (counselor) ---------------- */
let refUnsub=null,refSeenIds=null;
function startReferralAlerts(){
  if(refUnsub){refUnsub();refUnsub=null;}refSeenIds=null;
  if(!me||me.admin||!me.access.includes('referrals'))return;
  refUnsub=FB.listenReferrals(list=>{
    const fresh=list.filter(r=>r.seen===false&&r.status!=='Closed');
    const btn=document.querySelector('#tabs button[data-tab="referrals"]');
    if(btn){let b=btn.querySelector('.badge');if(!fresh.length){if(b)b.remove();}else{if(!b){b=document.createElement('span');b.className='badge';btn.append(b);}b.textContent=fresh.length;}}
    const ids=new Set(fresh.map(r=>r.id));
    if(refSeenIds){
      const added=fresh.filter(r=>!refSeenIds.has(r.id));
      if(added.length){
        const msg=added.length===1?'New referral: '+added[0].name:added.length+' new referrals from the supervisor';
        const t=document.createElement('div');t.className='alerttoast';t.innerHTML='✉ '+esc(msg);t.onclick=()=>{show('referrals');t.remove();};document.body.append(t);setTimeout(()=>t.remove(),9000);
        try{if('Notification' in window&&Notification.permission==='granted')new Notification('Counselor Referrals',{body:msg});}catch{}
      }
    }else if(fresh.length){
      const t=document.createElement('div');t.className='alerttoast';t.innerHTML='✉ You have '+fresh.length+' new referral'+(fresh.length===1?'':'s')+' from the supervisor';t.onclick=()=>{show('referrals');t.remove();};document.body.append(t);setTimeout(()=>t.remove(),9000);
      try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch{}
    }
    refSeenIds=ids;
    window.__refFresh=fresh.length;
    if(!$('home').hidden)renderHome();
  },()=>{});
}
