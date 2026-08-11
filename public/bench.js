/* ============================================================================
   BENCH — self-installing, one paste point. Live-shell build (Seam-4 corrected).
   INSTALL: add ONE line as the LAST script before </body> in public/index.html,
   AFTER the shell's own scripts (so the tab loop, personaSel, paintPersona,
   and $('ask') already exist):
       <script src="bench.js"></script>
   Nothing else in the host is edited.

   CONTRACTS — ALL CONFIRMED FROM THE REAL BYTES (grep 2026, no FALLBACK remains):
     Seam 1 CSS  : .bench-notice{display:flex} makes [hidden] inert; injected rule
                   .bench-notice[hidden]{display:none} restores it (author origin).
                   Verified at getComputedStyle(el).display === "none".
     Seam 2 STORE: chain is SESSION-ONLY in memory, NEVER written to the project
                   blob (at ceiling; one prior outage). It exits by handoff.
     Seam 3 HAND : composer is $('ask'); persona is personaSel='<id>' +
                   sessionStorage 'bnt_persona' + paintPersona(). CONFIRMED verbatim
                   from the shell's own persona bindings (e.g. _pja / personaJabir).
     Seam 4 SURF : CONFIRMED delegated-by-convention. The shell's handler removes
                   .active from every .tab and .view, adds .active to the clicked
                   tab, then $('view-'+v).classList.add('active'). Bench installs as
                   a 4th tab+view and binds its OWN click listener running the SAME
                   sequence — because the shell binds tab clicks in a load-time
                   for-loop over querySelectorAll('.tab'), which a later-appended
                   button is NOT part of. Matching the convention, not a guessed API.

   Touches NONE of the persona ternary anchors. chat.js and FERRIS untouched.
   ========================================================================= */
(function(){
"use strict";
if (window.__benchInstalled) return;            /* load-twice guard */
window.__benchInstalled = true;

var tabsBar = document.querySelector('.tabs');
var viewsParent = document.querySelector('.view') ? document.querySelector('.view').parentNode : null;
if (!tabsBar || !viewsParent){                  /* fail loud, not silent */
  console.error('[Bench] .tabs or .view host not found — Bench not installed.');
  window.__benchInstalled = false; return;
}
var $ = function(id){ return document.getElementById(id); };

/* ---- SURFACE (Seam 4): activate a view the SHELL's own way -------------- */
/* Byte-for-byte the shell convention: clear .active from all tabs and views,
   set .active on this tab, set .active on #view-<name>. */
function activateBench(){
  var tabs = document.querySelectorAll('.tab');
  for(var k=0;k<tabs.length;k++) tabs[k].classList.remove('active');
  benchTab.classList.add('active');
  document.querySelectorAll('.view').forEach(function(s){ s.classList.remove('active'); });
  $('view-bench').classList.add('active');
  verifyChain().then(paintOpenState);          /* paint TRUE state on entry */
}

/* ---- 1) inject styles (own <style>, appended to <head>) ----------------- */
var css = ''
+ '#view-bench{color:var(--bn-text,#a8c4e0);}'
+ '.bench-head{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--bn-line,#1f3a5c);margin-bottom:14px;}'
+ '.bench-title{font-family:"Barlow Condensed","Inter",system-ui,sans-serif;font-weight:600;font-size:18px;letter-spacing:.4px;text-transform:uppercase;color:var(--bn-heading,#5fb3e8);display:flex;align-items:center;gap:9px;}'
+ '.bench-title svg{width:18px;height:18px;stroke:var(--bn-sky,#0099E6);fill:none;stroke-width:1.8;}'
+ '.bench-sub{font-family:"Inter",system-ui,sans-serif;font-weight:400;text-transform:none;letter-spacing:0;color:var(--bn-text-dim,#6b8caf);font-size:12px;}'
+ '.bench-build{margin-left:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--bn-text-faint,#6b8caf);letter-spacing:.4px;}'
+ '.bench-body{display:grid;grid-template-columns:300px 1fr;gap:0;min-height:320px;border:1px solid var(--bn-line,#1f3a5c);border-radius:10px;overflow:hidden;}'
+ '@media(max-width:820px){.bench-body{grid-template-columns:1fr;}}'
+ '.bench-rail{border-right:1px solid var(--bn-line,#1f3a5c);background:var(--bn-ink,#0a1628);display:flex;flex-direction:column;min-width:0;}'
+ '.bench-caps{overflow-y:auto;padding:8px;flex:1;max-height:520px;}'
+ '.bench-cap{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;margin-bottom:7px;background:var(--bn-panel-2,#0d1c33);border:1px solid var(--bn-line-soft,#25406a);border-radius:7px;cursor:pointer;transition:border-color .15s ease,background .15s ease;}'
+ '.bench-cap:hover{border-color:var(--bn-deep,#006BB5);background:var(--bn-ink,#0a1628);}'
+ '.bench-cap[aria-selected="true"]{border-color:var(--bn-sky,#0099E6);background:var(--bn-ink,#0a1628);}'
+ '.bench-cap-dot{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none;background:var(--bn-ok,#7CFC00);}'
+ '.bench-cap[data-state="withheld"] .bench-cap-dot{background:var(--bn-warn,#d9b65a);}'
+ '.bench-cap[data-state="broken"] .bench-cap-dot{background:var(--bn-bad,#ff8a8a);}'
+ '.bench-cap-main{min-width:0;flex:1;}'
+ '.bench-cap-seam{font-size:12.5px;font-weight:600;color:var(--bn-text,#a8c4e0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
+ '.bench-cap-meta{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px;color:var(--bn-text-faint,#6b8caf);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
+ '.bench-empty{padding:26px 18px;text-align:center;color:var(--bn-text-dim,#6b8caf);font-size:13px;}'
+ '.bench-empty svg{width:34px;height:34px;stroke:var(--bn-line-soft,#25406a);fill:none;stroke-width:1.6;margin-bottom:10px;}'
+ '.bench-detail{padding:16px 18px;overflow-y:auto;min-width:0;}'
+ '.bench-detail-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}'
+ '.bench-badge{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;font-weight:700;letter-spacing:.5px;padding:3px 9px;border-radius:999px;border:1px solid transparent;}'
+ '.bench-badge.ok{color:var(--bn-ok,#7CFC00);border-color:var(--bn-ok,#7CFC00);background:rgba(124,252,0,.10);}'
+ '.bench-badge.warn{color:var(--bn-warn,#d9b65a);border-color:var(--bn-warn,#d9b65a);background:rgba(217,182,90,.10);}'
+ '.bench-badge.bad{color:var(--bn-bad,#ff8a8a);border-color:var(--bn-bad,#ff8a8a);background:rgba(255,138,138,.10);}'
+ '.bench-detail-seam{font-family:"Barlow Condensed","Inter",system-ui,sans-serif;font-weight:600;font-size:19px;letter-spacing:.3px;color:var(--bn-heading,#5fb3e8);}'
+ '.bench-field{margin-bottom:13px;}'
+ '.bench-field-label{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--bn-text-faint,#6b8caf);margin-bottom:5px;}'
+ '.bench-hash{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--bn-text-dim,#6b8caf);word-break:break-all;background:var(--bn-panel-2,#0d1c33);border:1px solid var(--bn-line-soft,#25406a);border-radius:7px;padding:9px 11px;}'
+ '.bench-digest{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--bn-text,#a8c4e0);background:var(--bn-panel-2,#0d1c33);border:1px solid var(--bn-line-soft,#25406a);border-radius:7px;padding:11px 12px;white-space:pre-wrap;max-height:180px;overflow:auto;}'
+ '.bench-handoff{margin-top:16px;padding-top:15px;border-top:1px solid var(--bn-line,#1f3a5c);}'
+ '.bench-handoff-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;}'
+ '.bench-select-wrap{flex:1;min-width:180px;}'
+ 'select.bench-select,textarea.bench-input{width:100%;background:var(--bn-panel-2,#0d1c33);color:var(--bn-text,#a8c4e0);border:1px solid var(--bn-line,#1f3a5c);border-radius:7px;padding:9px 11px;font-family:"Inter",system-ui,sans-serif;font-size:13px;box-sizing:border-box;}'
+ 'textarea.bench-input{min-height:70px;resize:vertical;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;}'
+ 'select.bench-select:focus,textarea.bench-input:focus{outline:none;border-color:var(--bn-sky,#0099E6);}'
+ '.bench-cta{background:var(--bn-gold,#FFD600);color:var(--bn-ink,#0a1628);border:none;border-radius:7px;padding:10px 18px;font-weight:700;font-size:13.5px;letter-spacing:.2px;cursor:pointer;white-space:nowrap;transition:filter .15s ease,transform .05s ease;}'
+ '.bench-cta:hover{filter:brightness(1.05);}'
+ '.bench-cta:active{transform:translateY(1px);}'
+ '.bench-cta:disabled{background:var(--bn-line,#1f3a5c);color:var(--bn-text-faint,#6b8caf);cursor:not-allowed;}'
+ '.bench-btn{background:transparent;color:var(--bn-text-dim,#6b8caf);border:1px solid var(--bn-line,#1f3a5c);border-radius:7px;padding:9px 14px;font-weight:600;font-size:13px;cursor:pointer;transition:border-color .15s ease,color .15s ease;}'
+ '.bench-btn:hover{border-color:var(--bn-sky,#0099E6);color:var(--bn-heading,#5fb3e8);}'
+ '.bench-notice{padding:9px 12px;border-radius:7px;font-size:12.5px;margin-top:12px;border:1px solid transparent;display:flex;gap:8px;align-items:flex-start;}'
/* THE SEAM-1 FIX: author-origin [hidden] rule restores display:none so the
   hidden attribute is honoured at the computed result. */
+ '.bench-notice[hidden]{display:none;}'
+ '.bench-notice svg{width:15px;height:15px;flex:none;margin-top:1px;stroke-width:1.8;fill:none;}'
+ '.bench-notice.warn{color:var(--bn-warn,#d9b65a);border-color:var(--bn-warn,#d9b65a);background:rgba(217,182,90,.08);}'
+ '.bench-notice.warn svg{stroke:var(--bn-warn,#d9b65a);}'
+ '.bench-notice.bad{color:var(--bn-bad,#ff8a8a);border-color:var(--bn-bad,#ff8a8a);background:rgba(255,138,138,.08);}'
+ '.bench-notice.bad svg{stroke:var(--bn-bad,#ff8a8a);}'
+ '.bench-notice.info{color:var(--bn-text-dim,#6b8caf);border-color:var(--bn-line,#1f3a5c);background:var(--bn-panel,#11243f);}'
+ '.bench-notice.info svg{stroke:var(--bn-sky,#0099E6);}'
+ '.bench-foot{display:flex;align-items:center;gap:10px;padding:12px 0 2px;flex-wrap:wrap;border-top:1px solid var(--bn-line,#1f3a5c);margin-top:14px;}'
+ '@media(prefers-reduced-motion:reduce){#view-bench *{transition:none !important;}}';
var st = document.createElement('style');
st.id = 'bench-style'; st.textContent = css;
document.head.appendChild(st);

/* ---- 2) build markup: a 4th tab + a 4th view, shell convention ---------- */
var benchTab = document.createElement('button');
benchTab.className = 'tab';                       /* same class; .active added on click */
benchTab.setAttribute('data-view','bench');
benchTab.type = 'button';
benchTab.textContent = 'Bench';
tabsBar.appendChild(benchTab);

var view = document.createElement('section');
view.className = 'view';                          /* NOT .active — Bench starts hidden */
view.id = 'view-bench';
view.setAttribute('aria-label','Bench — instrument receipt ledger (session)');
view.innerHTML =
  '<header class="bench-head">'
+   '<span class="bench-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V8l6-4 6 4v12M9 20v-6h6v6"/></svg>'
+     'Bench <span class="bench-sub" id="bench-scope">\u2014 receipts for this project, this session</span></span>'
+   '<span class="bench-build" id="bench-build" title="Ledger length">chain 0</span>'
+ '</header>'
+ '<div class="bench-body">'
+   '<div class="bench-rail" aria-label="Captured receipts">'
+     '<div class="bench-caps" id="bench-caps" role="listbox" aria-label="Receipt chain" tabindex="0">'
+       '<div class="bench-empty" id="bench-empty">'
+         '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2.4"/></svg>'
+         '<div>No receipts yet this session.</div>'
+         '<div style="font-size:12px;color:var(--bn-text-faint,#6b8caf);margin-top:5px;">Capture a reading with the footer actions. Receipts live in memory for this session and leave by handoff \u2014 they are not saved into the project.</div>'
+       '</div>'
+     '</div>'
+   '</div>'
+   '<div class="bench-detail" id="bench-detail" aria-live="polite">'
+     '<div class="bench-empty" id="bench-detail-empty">'
+       '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg>'
+       '<div>Select a receipt to inspect it and hand it to a desk.</div>'
+     '</div>'
+     '<div id="bench-detail-body" hidden>'
+       '<div class="bench-detail-head"><span class="bench-badge ok" id="bench-badge">chain intact</span><span class="bench-detail-seam" id="bench-detail-seam"></span></div>'
+       '<div class="bench-field"><div class="bench-field-label">Instrument \u00b7 desk \u00b7 captured</div><div class="bench-cap-meta" id="bench-detail-meta" style="white-space:normal;font-size:12px;"></div></div>'
+       '<div class="bench-field"><div class="bench-field-label">Reading</div><div class="bench-digest" id="bench-detail-digest"></div></div>'
+       '<div class="bench-field"><div class="bench-field-label">This receipt (SHA-256)</div><div class="bench-hash" id="bench-detail-self"></div></div>'
+       '<div class="bench-field"><div class="bench-field-label">Links to previous</div><div class="bench-hash" id="bench-detail-prev"></div></div>'
+       '<div class="bench-notice warn" id="bench-detail-withheld" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg><span>Reading withheld at capture. No value was ever written to this receipt \u2014 its absence is structural, not hidden.</span></div>'
+       '<div class="bench-notice bad" id="bench-detail-broken" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H6a3 3 0 000 6h3M15 7h3a3 3 0 010 6h-3M8 10h5"/></svg><span id="bench-broken-msg">Chain break detected.</span></div>'
+       '<div class="bench-handoff">'
+         '<div class="bench-field-label">Hand this receipt to a desk</div>'
+         '<div class="bench-handoff-row"><div class="bench-select-wrap"><select class="bench-select" id="bench-desk" aria-label="Target desk"></select></div></div>'
+         '<div class="bench-field" style="margin-top:11px;"><div class="bench-field-label">Composed turn (editable before you send)</div><textarea class="bench-input" id="bench-compose" aria-label="Composed handoff turn" placeholder="Composed from the receipt at handoff\u2026"></textarea></div>'
+         '<div class="bench-handoff-row" style="margin-top:4px;"><span style="flex:1"></span><button type="button" class="bench-cta" id="bench-handoff">Hand to desk</button></div>'
+         '<div class="bench-notice info" id="bench-handoff-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg><span>Switches to the desk and fills the composer \u2014 it does not send. You review and press Send.</span></div>'
+       '</div>'
+     '</div>'
+   '</div>'
+ '</div>'
+ '<footer class="bench-foot">'
+   '<span class="bench-sub" id="bench-cap-status">Session ledger \u2014 empty. Capture a reading below.</span>'
+   '<span style="flex:1"></span>'
+   '<button type="button" class="bench-btn" id="bench-verify">Verify chain</button>'
+   '<button type="button" class="bench-btn" id="bench-withhold">Withhold reading</button>'
+   '<button type="button" class="bench-btn" id="bench-capture-battery">Read battery (BLE)</button>'
+ '</footer>';
viewsParent.appendChild(view);

/* ---- Bench binds its OWN tab click (the shell's for-loop already ran) ---- */
/* Matching the shell convention exactly; the appended button was NOT in the
   load-time NodeList, so without this it would be dead on click (C4). */
benchTab.addEventListener('click', activateBench);

/* ---- SESSION LEDGER (Seam 2): memory only, never into the project blob -- */
var CHAIN=[];              /* whole ledger, in memory, this session only */
var selected=-1;

function canonical(rec){
  var o={};Object.keys(rec).filter(function(k){return k!=='hash';}).sort()
    .forEach(function(k){o[k]=rec[k];});
  return JSON.stringify(o);
}
async function sha256(str){
  var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
}
async function capture(o){
  var prev=CHAIN.length?CHAIN[CHAIN.length-1].hash:'';
  var rec={seq:CHAIN.length,ts:Date.now(),instrument:o.instrument||'unknown',
    desk:o.desk||'fotis',threshold:(o.threshold!==undefined?o.threshold:null),
    grade:o.grade||'REPORTED',withheld:!!o.withheld,prev:prev};
  if(!rec.withheld) rec.reading=o.reading;       /* only present when NOT withheld */
  rec.hash=await sha256(canonical(rec));
  CHAIN.push(rec);                                /* memory only — no api('data') */
  render(); select(rec.seq);
}
async function verifyChain(){
  var prev='';
  for(var i=0;i<CHAIN.length;i++){
    var r=CHAIN[i];
    if(r.prev!==prev) return {ok:false,seq:r.seq,why:'prev-link mismatch'};
    var h=await sha256(canonical(r));
    if(h!==r.hash) return {ok:false,seq:r.seq,why:'content hash mismatch'};
    prev=r.hash;
  }
  return {ok:true,len:CHAIN.length};
}

/* ---- notices: cleared UNCONDITIONALLY, honoured at the element ---------- */
function clearBrokenNotice(){ var n=$('bench-detail-broken'); if(n) n.hidden=true; }
function resetBadgeForSelection(){
  if($('bench-detail-body').hidden || selected<0) return;
  var r=CHAIN.filter(function(x){return x.seq===selected;})[0];
  var b=$('bench-badge'); if(!b||!r) return;
  if(r.withheld){b.className='bench-badge warn';b.textContent='reading withheld';}
  else{b.className='bench-badge ok';b.textContent=r.grade;}
}

/* ---- render ------------------------------------------------------------- */
function fmtTs(t){return new Date(t).toISOString().replace('T',' ').slice(0,19)+'Z';}
function render(){
  var caps=$('bench-caps');
  Array.prototype.slice.call(caps.querySelectorAll('.bench-cap')).forEach(function(n){n.remove();});
  $('bench-empty').style.display = CHAIN.length? 'none':'block';
  $('bench-build').textContent='chain '+CHAIN.length;
  CHAIN.forEach(function(r){
    var node=document.createElement('div');
    node.className='bench-cap'; node.setAttribute('role','option'); node.tabIndex=-1;
    node.dataset.seq=r.seq; node.dataset.state=r.withheld?'withheld':'ok';
    node.setAttribute('aria-selected', r.seq===selected?'true':'false');
    node.innerHTML='<span class="bench-cap-dot" aria-hidden="true"></span>'
      +'<div class="bench-cap-main"><div class="bench-cap-seam"></div><div class="bench-cap-meta"></div></div>';
    node.querySelector('.bench-cap-seam').textContent='#'+r.seq+'  '+r.instrument;
    node.querySelector('.bench-cap-meta').textContent=(r.withheld?'withheld':r.grade)+'  \u00b7  '+r.desk+'  \u00b7  '+r.hash.slice(0,10);
    node.addEventListener('click',function(){select(r.seq);});
    node.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();select(r.seq);}});
    caps.appendChild(node);
  });
}
function select(seq){
  clearBrokenNotice();                            /* clear stale break FIRST, unconditional */
  selected=seq;
  var r=CHAIN.filter(function(x){return x.seq===seq;})[0];
  Array.prototype.slice.call($('bench-caps').querySelectorAll('.bench-cap')).forEach(function(n){
    n.setAttribute('aria-selected',(+n.dataset.seq===seq)?'true':'false');});
  if(!r){$('bench-detail-empty').style.display='block';$('bench-detail-body').hidden=true;return;}
  $('bench-detail-empty').style.display='none';
  $('bench-detail-body').hidden=false;
  $('bench-detail-seam').textContent=r.instrument+'  #'+r.seq;
  $('bench-detail-meta').textContent=r.instrument+'  \u00b7  '+r.desk+'  \u00b7  '+fmtTs(r.ts)
    +(r.threshold!==null?('  \u00b7  threshold '+r.threshold):'');
  var withheld=r.withheld;
  $('bench-detail-withheld').hidden=!withheld;
  $('bench-detail-digest').textContent = withheld
    ? '(no reading — withheld at capture)'
    : (typeof r.reading==='object'?JSON.stringify(r.reading,null,2):String(r.reading));
  $('bench-detail-self').textContent=r.hash;
  $('bench-detail-prev').textContent=r.prev||'(genesis — no previous receipt)';
  var b=$('bench-badge');
  if(withheld){b.className='bench-badge warn';b.textContent='reading withheld';}
  else{b.className='bench-badge ok';b.textContent=r.grade;}
  $('bench-desk').value=r.desk;                    /* default desk = owner, override allowed */
  $('bench-compose').value=defaultTurn(r,{len:CHAIN.length});
}

/* ---- desks (Seam 3): the 18-colleague roster, personaSel ids ------------ */
var DESKS=[
  {id:'karam',name:'Karam'},{id:'nicolle',name:'Nicolle'},{id:'karim',name:'Karim'},
  {id:'galen',name:'Galen'},{id:'elias',name:'Elias'},{id:'kostas',name:'Kostas'},
  {id:'elena',name:'Elena'},{id:'solon',name:'Solon'},{id:'nour',name:'Nour'},
  {id:'kyros',name:'Kyros'},{id:'sinan',name:'Sinan'},{id:'platon',name:'Platon'},
  {id:'hanno',name:'Hanno'},{id:'fotis',name:'Fotis'},{id:'yusuf',name:'Yusuf'},
  {id:'lukas',name:'Lukas'},{id:'jabir',name:'Jabir'}
];
function fillDesks(){
  var sel=$('bench-desk'); sel.innerHTML='';
  DESKS.forEach(function(d){var o=document.createElement('option');o.value=d.id;o.textContent=d.name;sel.appendChild(o);});
}
function deskName(id){var d=DESKS.filter(function(x){return x.id===id;})[0];return d?d.name:id;}

/* ---- HANDOFF (Seam 3): confirmed shell contract; NEVER send() ----------- */
/* personaSel='<id>' + sessionStorage 'bnt_persona' + paintPersona(), verbatim
   from the shell persona bindings. Composer is $('ask'). No send(). */
function doHandoff(deskId, turn){
  try{ personaSel=deskId; }catch(e){}
  try{ sessionStorage.setItem('bnt_persona',deskId); }catch(e){}
  try{ if(typeof paintPersona==='function') paintPersona(); }catch(e){}
  var ask=$('ask'); if(ask){ ask.value=turn; try{ask.focus();}catch(e){} }
  goToChatView();                                  /* land on the desk via the shell tab */
}
/* Land on the target desk's view by clicking the shell's own chat tab, so the
   shell runs its own activation (no assumed switch fn). Fallback: match convention. */
function goToChatView(){
  var chatTab=document.querySelector('.tab[data-view="chat"]');
  if(chatTab){ chatTab.click(); return; }
  var tabs=document.querySelectorAll('.tab');
  for(var k=0;k<tabs.length;k++) tabs[k].classList.remove('active');
  document.querySelectorAll('.view').forEach(function(s){s.classList.remove('active');});
  var cv=$('view-chat'); if(cv) cv.classList.add('active');
}
function defaultTurn(r,v){
  return 'Bench handoff — receipt #'+r.seq+' ('+r.instrument+')\n'
    +'Desk of record: '+deskName(r.desk)+'\n'
    +'Grade reported: '+(r.withheld?'WITHHELD (no reading stored)':r.grade)+'\n'
    +(r.withheld?'':('Reading: '+(typeof r.reading==='object'?JSON.stringify(r.reading):r.reading)+'\n'))
    +'Receipt hash: '+r.hash+'\n'
    +'Chain: VERIFIED at handoff ('+(v.len||CHAIN.length)+' receipt(s) intact).';
}

/* ---- toast -------------------------------------------------------------- */
function toast(msg){
  var t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#11243f;color:#5fb3e8;border:1px solid #0099E6;padding:10px 16px;border-radius:8px;font-size:13px;font-family:Inter,system-ui,sans-serif;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.5);';
  document.body.appendChild(t);
  setTimeout(function(){t.style.transition='opacity .3s';t.style.opacity='0';setTimeout(function(){t.remove();},320);},2600);
}

/* ---- BLE capture (Chromium-only, user gesture, HTTPS; refuse is legit) --- */
async function readBatteryBLE(){
  if(!('bluetooth' in navigator)) return {refused:'Web Bluetooth unavailable in this browser'};
  try{
    var dev=await navigator.bluetooth.requestDevice({filters:[{services:['battery_service']}]});
    var srv=await dev.gatt.connect();
    var s=await srv.getPrimaryService('battery_service');
    var c=await s.getCharacteristic('battery_level');
    var v=await c.readValue();
    return {value:v.getUint8(0), instrument:(dev.name||'BLE device')};
  }catch(e){ return {refused:(e&&e.message)||'device refused or cancelled'}; }
}

/* ---- CHAIN-LEVEL actions (footer, reachable on empty chain) ------------- */
$('bench-capture-battery').addEventListener('click',async function(){
  $('bench-cap-status').textContent='Requesting BLE device…';
  var res=await readBatteryBLE();
  if(res.refused){$('bench-cap-status').textContent='Sensor refused: '+res.refused+' — no receipt written.';return;}
  await capture({instrument:res.instrument,desk:'fotis',grade:'REPORTED',threshold:20,reading:{battery_pct:res.value}});
  $('bench-cap-status').textContent='Battery receipt captured at #'+selected+' (session only).';
});
$('bench-withhold').addEventListener('click',async function(){
  await capture({instrument:'manual entry',desk:'fotis',grade:'WITHHELD',withheld:true,threshold:null});
  $('bench-cap-status').textContent='Withheld receipt written at #'+selected+' — no reading stored (session only).';
});
$('bench-verify').addEventListener('click',async function(){
  var v=await verifyChain();
  if(v.ok){
    clearBrokenNotice(); resetBadgeForSelection();
    toast('Chain intact — '+v.len+' receipt(s) verified.');
    $('bench-cap-status').textContent='Chain verified — '+v.len+' receipt(s).';
  }else{
    toast('CHAIN BROKEN at seq '+v.seq+': '+v.why+'.');
    $('bench-cap-status').textContent='CHAIN BROKEN at seq '+v.seq+' — inspect and re-capture.';
    select(v.seq);
    $('bench-detail-broken').hidden=false;
    $('bench-broken-msg').textContent='Chain break at seq '+v.seq+': '+v.why+'. No auto-repair — inspect and re-capture.';
    var b=$('bench-badge');b.className='bench-badge bad';b.textContent='chain broken';
  }
});

/* ---- RECEIPT-LEVEL action (needs a selection) --------------------------- */
$('bench-handoff').addEventListener('click',async function(){
  if(selected<0){toast('Select a receipt first.');return;}
  var v=await verifyChain();
  if(!v.ok){
    $('bench-detail-broken').hidden=false;
    $('bench-broken-msg').textContent='Handoff blocked — chain break at seq '+v.seq+' ('+v.why+').';
    toast('Handoff blocked: chain break at seq '+v.seq+'.');
    return;
  }
  var r=CHAIN.filter(function(x){return x.seq===selected;})[0];
  var deskId=$('bench-desk').value;
  var composed=$('bench-compose').value.trim() || defaultTurn(r,v);
  doHandoff(deskId, composed);
});

/* ---- open-state painter ------------------------------------------------- */
function paintOpenState(v){
  $('bench-cap-status').textContent = CHAIN.length
    ? (v.ok?('Chain verified — '+v.len+' receipt(s).'):('Chain break at seq '+v.seq+'.'))
    : 'Session ledger — empty. Capture a reading below.';
}

/* ---- init: Bench starts hidden (no .active); shell owns first paint ----- */
fillDesks();
render();
})();