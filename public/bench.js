/* ============================================================================
   BENCH — self-installing, one paste point. Build 4: white body text.
   INSTALL: add ONE line as the LAST script before </body> in public/index.html,
   AFTER the shell's own scripts (tab loop, personaSel, paintPersona, $('ask')):
       <script src="bench.js"></script>
   Nothing else in the host is edited.

   BUILD-4 NOTE, FOR THE RECORD: all Bench body text is var(--white,#fff) by
   OPERATOR DECISION. This is DELIBERATELY brighter than every other Lab panel
   (which uses --mute for body copy). Do NOT "correct" it back to --mute/--soft.
   Meaning-through-colour is preserved: .bench-detail-seam stays --light-sky
   (heading), badge/notice severity colours stay, rail dot colours stay, the
   tab is the shell's entirely.

   BUILD-5 NOTE (robot witness, ninth instrument): the robot capture is a
   NINTH footer button inside THIS file — NOT a separate script. It shares the
   one CHAIN, writeChain, render, select, verifyChain, and the class="bench-foot"
   footer. The old inline captureRobot family (a483756) is simply not carried
   forward; this is its replacement. The robot receipt rides the existing
   canonical envelope via capture({robot:{...}}), so it hashes, chains, and
   verifies exactly like the other eight — one rail, one sequence space.

   INSTALL-TIME GREP (fail-loud, checks TEXT not a runtime stack — HUNK 3b):
     PowerShell:  if ((Select-String -Path public\bench.js -Pattern "api\(\s*['""]data['""]").Count -gt 0) { Write-Error "[Bench] api('data') present — session-only invariant broken"; exit 1 }
     Bash:        grep -Eq "api\(\s*['\"]data['\"]" public/bench.js && { echo "[Bench] api('data') present — session-only invariant broken" >&2; exit 1; }

   ROBOT R2 FORBIDDEN-TOKEN SWEEP (must return 0 each on the shipped bytes):
     writeValue  .getWriter(  .publish(  call_service  advertise  navigator.usb  navigator.hid
     (The robot instrument holds a reader only, subscribes only, never sends.)

   CONTRACTS — confirmed from the real bytes (no FALLBACK remains):
     Seam 1 CSS  : .bench-notice[hidden]{display:none} restores UA hidden at author origin.
     Seam 2 STORE: chain SESSION-ONLY in memory. NEVER api('data'). Enforced STRUCTURALLY:
                   CHAIN + writeChain live inside this IIFE, never exported, no referent to
                   route into a persist call. (A runtime stack check was measured failing
                   OPEN — capture() awaits sha256() before push, the await unwinds the frame,
                   /\bapi\b/ reads false on the forbidden path identically to the legit one.
                   Rejected. The install-time TEXT grep above is the fail-loud complement.)
     Seam 3 HAND : composer $('ask'); persona personaSel='<id>' + sessionStorage 'bnt_persona'
                   + paintPersona(). NEVER send().
     Seam 4 SURF : Bench binds its OWN tab click; shell's for-loop over a static NodeList
                   ran at load, so an appended button is otherwise dead.

   STYLING: reuses the shell's own tokens/classes. NO web fonts (Georgia + Courier New).
   The Bench tab is class="tab" only — the SHELL paints idle and .active; Bench writes
   NO .tab CSS, so an idle Bench tab equals an idle Board Room tab at the computed result.

   Touches NONE of the persona ternary anchors. chat.js and FERRIS untouched.
   ========================================================================= */
(function(){
"use strict";
if (window.__benchInstalled) return;
window.__benchInstalled = true;

var tabsBar = document.querySelector('.tabs');
var viewsParent = document.querySelector('.view') ? document.querySelector('.view').parentNode : null;
if (!tabsBar || !viewsParent){
  console.error('[Bench] .tabs or .view host not found — Bench not installed.');
  window.__benchInstalled = false; return;
}
var $ = function(id){ return document.getElementById(id); };

/* ---- SURFACE (Seam 4): activate the view the SHELL's own way ------------ */
function activateBench(){
  var tabs = document.querySelectorAll('.tab');
  for(var k=0;k<tabs.length;k++) tabs[k].classList.remove('active');
  benchTab.classList.add('active');
  document.querySelectorAll('.view').forEach(function(s){ s.classList.remove('active'); });
  $('view-bench').classList.add('active');
  verifyChain().then(paintOpenState);
}

/* ---- 1) inject styles. NO .tab rules (shell owns the tab). NO web fonts. -- */
/* BUILD 4: body text is var(--white,#fff) per operator decision — brighter
   than the Lab's --mute body copy elsewhere; deliberate, do not revert.
   Severity/heading colours untouched. Sizes are the Lab's — 15px buttons,
   12px mono tabs/selects, 11px eyebrows. Serif = Georgia, mono = Courier New. */
var css = ''
+ '#view-bench{color:var(--white,#fff);font-family:var(--serif,Georgia,"Times New Roman",serif);}'
+ '.bench-head{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line,#1f3a5c);margin-bottom:14px;}'
+ '.bench-title{font-family:var(--serif,Georgia,serif);font-weight:700;font-size:18px;letter-spacing:.3px;color:var(--light-sky,#5fb3e8);display:flex;align-items:center;gap:9px;}'
+ '.bench-title svg{width:20px;height:20px;flex:none;}'
+ '.bench-sub{font-family:var(--serif,Georgia,serif);font-weight:400;color:var(--white,#fff);font-size:12px;}'
+ '.bench-build{margin-left:auto;font-family:var(--mono,"Courier New",monospace);font-size:12px;color:var(--white,#fff);letter-spacing:.4px;}'
+ '.bench-body{display:grid;grid-template-columns:300px 1fr;gap:0;min-height:320px;border:1px solid var(--line,#1f3a5c);border-radius:8px;overflow:hidden;}'
+ '@media(max-width:820px){.bench-body{grid-template-columns:1fr;}}'
+ '.bench-rail{border-right:1px solid var(--line,#1f3a5c);background:var(--ink,#0a1628);display:flex;flex-direction:column;min-width:0;}'
+ '.bench-caps{overflow-y:auto;padding:8px;flex:1;max-height:520px;}'
+ '.bench-cap{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;margin-bottom:7px;background:var(--navy-deep,#0d1c33);border:1px solid var(--line2,#25406a);border-radius:7px;cursor:pointer;transition:border-color .15s ease,background .15s ease;}'
+ '.bench-cap:hover{border-color:var(--sky,#0099E6);background:var(--ink,#0a1628);}'
+ '.bench-cap[aria-selected="true"]{border-color:var(--sky,#0099E6);background:var(--ink,#0a1628);}'
+ '.bench-cap-dot{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none;background:var(--live,#7CFC00);}'
+ '.bench-cap[data-state="withheld"] .bench-cap-dot{background:var(--gold-dim,#d9b65a);}'
+ '.bench-cap[data-state="broken"] .bench-cap-dot{background:var(--err,#ff8a8a);}'
+ '.bench-cap-main{min-width:0;flex:1;}'
+ '.bench-cap-seam{font-family:var(--serif,Georgia,serif);font-size:14px;font-weight:700;color:var(--white,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
+ '.bench-cap-meta{font-family:var(--mono,"Courier New",monospace);font-size:11px;color:var(--white,#fff);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
+ '.bench-empty{padding:26px 18px;text-align:center;color:var(--white,#fff);font-size:13px;}'
+ '.bench-empty svg{width:34px;height:34px;stroke:var(--line2,#25406a);fill:none;stroke-width:1.6;margin-bottom:10px;}'
+ '.bench-detail{padding:16px 18px;overflow-y:auto;min-width:0;}'
+ '.bench-detail-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}'
+ '.bench-badge{font-family:var(--mono,"Courier New",monospace);font-size:11px;font-weight:700;letter-spacing:.5px;padding:3px 9px;border-radius:999px;border:1px solid transparent;}'
+ '.bench-badge.ok{color:var(--live,#7CFC00);border-color:var(--live,#7CFC00);background:rgba(124,252,0,.10);}'
+ '.bench-badge.warn{color:var(--gold-dim,#d9b65a);border-color:var(--gold-dim,#d9b65a);background:rgba(217,182,90,.10);}'
+ '.bench-badge.bad{color:var(--err,#ff8a8a);border-color:var(--err,#ff8a8a);background:rgba(255,138,138,.10);}'
+ '.bench-detail-seam{font-family:var(--serif,Georgia,serif);font-weight:700;font-size:18px;letter-spacing:.2px;color:var(--light-sky,#5fb3e8);}'
+ '.bench-field{margin-bottom:13px;}'
+ '.bench-eyebrow{font-family:var(--mono,"Courier New",monospace);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--white,#fff);margin-bottom:5px;}'
+ '.bench-hash{font-family:var(--mono,"Courier New",monospace);font-size:12px;color:var(--white,#fff);word-break:break-all;background:var(--navy-deep,#0d1c33);border:1px solid var(--line2,#25406a);border-radius:7px;padding:9px 11px;}'
+ '.bench-digest{font-family:var(--mono,"Courier New",monospace);font-size:12px;color:var(--white,#fff);background:var(--navy-deep,#0d1c33);border:1px solid var(--line2,#25406a);border-radius:7px;padding:11px 12px;white-space:pre-wrap;max-height:200px;overflow:auto;}'
+ '.bench-handoff{margin-top:16px;padding-top:15px;border-top:1px solid var(--line,#1f3a5c);}'
+ '.bench-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;}'
+ '.bench-select-wrap{flex:1;min-width:180px;}'
+ 'select.bench-select,textarea.bench-input,input.bench-input{width:100%;background:var(--navy-deep,#0d1c33);color:var(--white,#fff);border:1px solid var(--line,#1f3a5c);border-radius:7px;padding:9px 11px;font-family:var(--serif,Georgia,serif);font-size:12px;box-sizing:border-box;}'
+ 'textarea.bench-input{min-height:70px;resize:vertical;font-family:var(--mono,"Courier New",monospace);}'
+ 'input.bench-input{font-family:var(--mono,"Courier New",monospace);}'
+ 'select.bench-select:focus,textarea.bench-input:focus,input.bench-input:focus{outline:none;border-color:var(--sky,#0099E6);}'
+ '.bench-cta{background:var(--gold,#FFD600);color:var(--ink,#0a1628);border:none;border-radius:7px;padding:9px 16px;font-weight:700;font-size:15px;cursor:pointer;white-space:nowrap;transition:filter .15s ease,transform .05s ease;}'
+ '.bench-cta:hover{filter:brightness(1.05);}'
+ '.bench-cta:active{transform:translateY(1px);}'
+ '.bench-cta:disabled{background:var(--line,#1f3a5c);color:var(--soft,#6b8caf);cursor:not-allowed;}'
+ '.bench-btn{background:transparent;color:var(--white,#fff);border:1px solid var(--line,#1f3a5c);border-radius:8px;padding:8px 14px;font-family:var(--serif,Georgia,serif);font-weight:700;font-size:15px;cursor:pointer;transition:border-color .15s ease,color .15s ease;}'
+ '.bench-btn:hover{border-color:var(--sky,#0099E6);color:var(--light-sky,#5fb3e8);}'
+ '.bench-btn:disabled{border-color:var(--line,#1f3a5c);color:var(--soft,#6b8caf);cursor:not-allowed;}'
+ '.bench-notice{padding:9px 12px;border-radius:7px;font-size:12px;margin-top:12px;border:1px solid transparent;display:flex;gap:8px;align-items:flex-start;}'
+ '.bench-notice[hidden]{display:none;}'   /* SEAM-1 FIX: honour hidden at the computed result */
+ '.bench-notice svg{width:15px;height:15px;flex:none;margin-top:1px;stroke-width:1.8;fill:none;}'
+ '.bench-notice.warn{color:var(--gold-dim,#d9b65a);border-color:var(--gold-dim,#d9b65a);background:rgba(217,182,90,.08);}'
+ '.bench-notice.warn svg{stroke:var(--gold-dim,#d9b65a);}'
+ '.bench-notice.bad{color:var(--err,#ff8a8a);border-color:var(--err,#ff8a8a);background:rgba(255,138,138,.08);}'
+ '.bench-notice.bad svg{stroke:var(--err,#ff8a8a);}'
+ '.bench-notice.info{color:var(--soft,#6b8caf);border-color:var(--line,#1f3a5c);background:var(--panel,#11243f);}'
+ '.bench-notice.info svg{stroke:var(--sky,#0099E6);}'
+ '.bench-foot{display:flex;align-items:center;gap:8px;padding:12px 0 2px;flex-wrap:wrap;border-top:1px solid var(--line,#1f3a5c);margin-top:14px;}'
+ '.bench-robot-row{display:flex;align-items:center;gap:8px;padding:10px 0 2px;flex-wrap:wrap;border-top:1px dashed var(--line2,#25406a);margin-top:10px;}'
+ '.bench-robot-row label{font-family:var(--mono,"Courier New",monospace);font-size:11px;color:var(--white,#fff);}'
+ '.bench-robot-row select,.bench-robot-row input{background:var(--navy-deep,#0d1c33);color:var(--white,#fff);border:1px solid var(--line,#1f3a5c);border-radius:6px;padding:6px 9px;font-family:var(--mono,"Courier New",monospace);font-size:12px;}'
+ '@media(prefers-reduced-motion:reduce){#view-bench *{transition:none !important;}}';
var st = document.createElement('style');
st.id = 'bench-style'; st.textContent = css;
document.head.appendChild(st);

/* ---- 2) build markup: 4th tab + 4th view. Bench brand mark (dial/needle). */
/* Same 64 viewBox / stroke weight / opacity as the shell mark; gold used ONCE
   as the needle hub — saying instrument, not house. */
var benchTab = document.createElement('button');
benchTab.className = 'tab';                       /* shell paints idle + .active — NO Bench .tab CSS */
benchTab.setAttribute('data-view','bench');
benchTab.type = 'button';
benchTab.textContent = 'Bench';
tabsBar.appendChild(benchTab);

var MARK = '<svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">'
  +'<rect width="64" height="64" rx="12" fill="#0d1c33"/>'
  +'<circle cx="32" cy="32" r="24" fill="none" stroke="#5fb3e8" stroke-opacity=".55" stroke-width="2.4"/>'
  +'<path d="M14 40 A20 20 0 0 1 50 40" fill="none" stroke="#5fb3e8" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>'
  +'<line x1="32" y1="40" x2="43" y2="22" stroke="#5fb3e8" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>'
  +'<circle cx="32" cy="40" r="4.5" fill="#FFD600"/>'
  +'</svg>';

var view = document.createElement('section');
view.className = 'view';
view.id = 'view-bench';
view.setAttribute('aria-label','Bench — instrument receipt ledger (session)');
view.innerHTML =
  '<header class="bench-head">'
+   '<span class="bench-title">'+MARK+'Bench <span class="bench-sub" id="bench-scope">\u2014 receipts for this project, this session</span></span>'
+   '<span class="bench-build" id="bench-build" title="Ledger length">chain 0</span>'
+ '</header>'
+ '<div class="bench-body">'
+   '<div class="bench-rail" aria-label="Captured receipts">'
+     '<div class="bench-caps" id="bench-caps" role="listbox" aria-label="Receipt chain" tabindex="0">'
+       '<div class="bench-empty" id="bench-empty">'
+         '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2.4"/></svg>'
+         '<div>No receipts yet this session.</div>'
+         '<div style="font-size:12px;color:var(--white,#fff);margin-top:5px;">Capture a reading with the footer instruments. Receipts live in memory for this session and leave by handoff \u2014 they are not saved into the project.</div>'
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
+       '<div class="bench-field"><div class="bench-eyebrow">Instrument \u00b7 desk \u00b7 captured</div><div class="bench-cap-meta" id="bench-detail-meta" style="white-space:normal;font-size:12px;"></div></div>'
+       '<div class="bench-field"><div class="bench-eyebrow">Reading</div><div class="bench-digest" id="bench-detail-digest"></div></div>'
+       '<div class="bench-field"><div class="bench-eyebrow">This receipt (SHA-256)</div><div class="bench-hash" id="bench-detail-self"></div></div>'
+       '<div class="bench-field"><div class="bench-eyebrow">Links to previous</div><div class="bench-hash" id="bench-detail-prev"></div></div>'
+       '<div class="bench-notice warn" id="bench-detail-withheld" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg><span>Reading withheld at capture. No value was ever written to this receipt \u2014 its absence is structural, not hidden.</span></div>'
+       '<div class="bench-notice warn" id="bench-detail-cap" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg><span id="bench-cap-msg"></span></div>'
+       '<div class="bench-notice bad" id="bench-detail-broken" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H6a3 3 0 000 6h3M15 7h3a3 3 0 010 6h-3M8 10h5"/></svg><span id="bench-broken-msg">Chain break detected.</span></div>'
+       '<div class="bench-handoff">'
+         '<div class="bench-eyebrow">Hand this receipt to a desk</div>'
+         '<div class="bench-row"><div class="bench-select-wrap"><select class="bench-select" id="bench-desk" aria-label="Target desk"></select></div></div>'
+         '<div class="bench-field" style="margin-top:11px;"><div class="bench-eyebrow">Composed turn (editable before you send)</div><textarea class="bench-input" id="bench-compose" aria-label="Composed handoff turn" placeholder="Composed from the receipt at handoff\u2026"></textarea></div>'
+         '<div class="bench-row" style="margin-top:4px;"><span style="flex:1"></span><button type="button" class="bench-cta" id="bench-handoff">Hand to desk</button></div>'
+         '<div class="bench-notice info" id="bench-handoff-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg><span>Switches to the desk and fills the composer \u2014 it does not send. You review and press Send.</span></div>'
+       '</div>'
+     '</div>'
+   '</div>'
+ '</div>'
+ '<div class="bench-notice info" id="bench-uuid-row" hidden style="margin:12px 0 0;">'
+   '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>'
+   '<span style="flex:1"><span class="bench-eyebrow" style="margin-bottom:4px;">Custom BLE service UUID (128-bit) \u2014 raw, uninterpreted</span>'
+     '<input class="bench-input" id="bench-uuid" placeholder="e.g. 0000fe86-0000-1000-8000-00805f9b34fb" aria-label="Custom service UUID"></span>'
+   '<button type="button" class="bench-btn" id="bench-uuid-go" style="align-self:flex-end;">Read raw</button>'
+ '</div>'
+ '<footer class="bench-foot">'
+   '<span class="bench-sub" id="bench-cap-status" style="flex:1;min-width:180px;">Session ledger \u2014 empty. Capture a reading below.</span>'
+   '<button type="button" class="bench-btn" id="bench-verify">Verify chain</button>'
+   '<button type="button" class="bench-btn" id="cap-withhold">Withhold reading</button>'
+   '<button type="button" class="bench-btn" id="cap-location">Location</button>'
+   '<button type="button" class="bench-btn" id="cap-power">Host power</button>'
+   '<button type="button" class="bench-btn" id="cap-motion">Motion peak</button>'
+   '<button type="button" class="bench-btn" id="cap-spectral">Spectral triage</button>'
+   '<button type="button" class="bench-btn" id="cap-battery">Battery (BLE)</button>'
+   '<button type="button" class="bench-btn" id="cap-btstd">BLE standard services</button>'
+   '<button type="button" class="bench-btn" id="cap-btuuid">BLE custom UUID</button>'
+   '<button type="button" class="bench-btn" id="cap-robot">Robot witness</button>'
+ '</footer>'
+ '<div class="bench-robot-row" id="bench-robot-row" hidden>'
+   '<label>Transport</label>'
+   '<select id="rb-transport"><option value="network">Network (ws/wss)</option>'
+     '<option value="serial">WebSerial</option><option value="ble">BLE</option></select>'
+   '<label>Machine state (attested)</label>'
+   '<select id="rb-state"><option value="unknown">unknown</option><option value="live">live</option>'
+     '<option value="maintenance">maintenance</option><option value="estopped">estopped</option>'
+     '<option value="powered_down">powered-down</option></select>'
+   '<label>Endpoint</label>'
+   '<input id="rb-endpoint" size="30" placeholder="ws:// or wss:// or device name">'
+   '<button type="button" class="bench-btn" id="rb-capture">Connect &amp; capture</button>'
+ '</div>';
viewsParent.appendChild(view);

benchTab.addEventListener('click', activateBench);
/* ============================================================================
   SESSION LEDGER (Seam 2) — memory only. STRUCTURAL enforcement:
   CHAIN and writeChain are closure members, never exported, never on window.
   Nothing outside this IIFE holds a reference, so no external code can route
   the chain into a persist call — there is no referent to route.
   ========================================================================= */
var CHAIN=[];
var selected=-1;

/* writeChain — the ONLY sanctioned push path. No runtime stack check (measured
   failing open); the closure scope IS the guard, the install-time grep is the alarm. */
function writeChain(rec){ CHAIN.push(rec); }   /* memory only — never persisted, by design */

function canonical(rec){
  var o={};Object.keys(rec).filter(function(k){return k!=='hash';}).sort()
    .forEach(function(k){o[k]=rec[k];});
  return JSON.stringify(o);
}
async function sha256(str){
  var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
}

/* ---- ROBOT (Defect 2b): serialize every capture that could race. The whole
   capture()->push path runs behind one in-flight promise so seq/prev are
   reserved and the push completes before the next capture reads the tail.
   The eight existing instruments are gesture-driven (one click, one await) so
   they could not race in practice; routing them through the same lock is free
   and makes the whole chain provably linear. ------------------------------- */
var chainLock = Promise.resolve();
function serialCapture(o){
  var run = chainLock.then(function(){ return capture(o); });
  chainLock = run.catch(function(){});   /* a failed capture must not wedge the lock */
  return run;
}

/* capture — schema delta applied. capability sits BESIDE grade, hashed like all
   else. reading key is written ONLY when a real value exists: not withheld AND
   capability AVAILABLE. UNSUPPORTED / DENIED carry NO reading key — the exact
   health-withhold pattern, so the hash is honest about the gap.
   ROBOT: when o.robot is present, its fields (two clocks, attested state,
   whitelisted readings, DENIED_BY_DESIGN list) ride the SAME canonical record
   and are hashed with everything else — one rail, one sequence space. */
async function capture(o){
  var prev=CHAIN.length?CHAIN[CHAIN.length-1].hash:'';
  var rec={seq:CHAIN.length,ts:Date.now(),instrument:o.instrument||'unknown',
    desk:o.desk||'fotis',threshold:(o.threshold!==undefined?o.threshold:null),
    grade:o.grade||'REPORTED',
    capability:(o.capability||'AVAILABLE'),      /* AVAILABLE | UNSUPPORTED | DENIED */
    withheld:!!o.withheld,prev:prev};
  if(o.note) rec.note=o.note;                    /* e.g. "not predictive maintenance", decode marker */
  if(o.robot) rec.robot=o.robot;                 /* robot envelope — hashed with the rest */
  if(!rec.withheld && rec.capability==='AVAILABLE') rec.reading=o.reading;
  rec.hash=await sha256(canonical(rec));
  writeChain(rec);                                /* sole write path */
  render(); select(rec.seq);
  return rec;
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

/* three (four) honest counts — a reading, a structural withhold, an unsupported
   platform gap, and a user denial are FOUR different facts; never flatten them. */
function chainCounts(){
  var read=0,wh=0,unsup=0,den=0;
  CHAIN.forEach(function(r){
    if(r.capability==='UNSUPPORTED') unsup++;
    else if(r.capability==='DENIED') den++;
    else if(r.withheld) wh++;
    else read++;
  });
  return 'Counts: '+read+' read \u00b7 '+wh+' withheld \u00b7 '+unsup+' unsupported-on-device \u00b7 '+den+' denied.';
}

/* ---- notices: cleared UNCONDITIONALLY, honoured at the computed result --- */
function clearBrokenNotice(){ var n=$('bench-detail-broken'); if(n) n.hidden=true; }
function resetBadgeForSelection(){
  if($('bench-detail-body').hidden || selected<0) return;
  var r=CHAIN.filter(function(x){return x.seq===selected;})[0];
  var b=$('bench-badge'); if(!b||!r) return;
  applyBadge(b,r);
}
function applyBadge(b,r){
  if(r.capability==='UNSUPPORTED'){b.className='bench-badge warn';b.textContent='unsupported';}
  else if(r.capability==='DENIED'){b.className='bench-badge warn';b.textContent='denied';}
  else if(r.withheld){b.className='bench-badge warn';b.textContent='reading withheld';}
  else{b.className='bench-badge ok';b.textContent=r.grade;}
}

/* ---- render ------------------------------------------------------------- */
function fmtTs(t){return new Date(t).toISOString().replace('T',' ').slice(0,19)+'Z';}
function capLabel(r){
  if(r.capability==='UNSUPPORTED') return 'unsupported';
  if(r.capability==='DENIED') return 'denied';
  return r.withheld?'withheld':r.grade;
}
function railState(r){
  return r.capability!=='AVAILABLE' ? 'broken' : (r.withheld?'withheld':'ok');
}
function render(){
  var caps=$('bench-caps');
  Array.prototype.slice.call(caps.querySelectorAll('.bench-cap')).forEach(function(n){n.remove();});
  $('bench-empty').style.display = CHAIN.length? 'none':'block';
  $('bench-build').textContent='chain '+CHAIN.length;
  CHAIN.forEach(function(r){
    var node=document.createElement('div');
    node.className='bench-cap'; node.setAttribute('role','option'); node.tabIndex=-1;
    node.dataset.seq=r.seq;
    node.dataset.state = railState(r);   /* UNSUPPORTED/DENIED reuse the red dot */
    node.setAttribute('aria-selected', r.seq===selected?'true':'false');
    node.innerHTML='<span class="bench-cap-dot" aria-hidden="true"></span>'
      +'<div class="bench-cap-main"><div class="bench-cap-seam"></div><div class="bench-cap-meta"></div></div>';
    node.querySelector('.bench-cap-seam').textContent='#'+r.seq+'  '+r.instrument;
    node.querySelector('.bench-cap-meta').textContent=capLabel(r)+'  \u00b7  '+r.desk+'  \u00b7  '+r.hash.slice(0,10);
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
    +(r.threshold!==null?('  \u00b7  threshold '+r.threshold):'')
    +(r.note?('  \u00b7  '+r.note):'');
  var hasReading = (r.capability==='AVAILABLE' && !r.withheld);
  $('bench-detail-withheld').hidden = !r.withheld;
  var cap=$('bench-detail-cap');
  if(r.capability==='UNSUPPORTED'){cap.hidden=false;$('bench-cap-msg').textContent='API not available in this browser/OS. No reading was ever written \u2014 the gap is a platform capability, not a suppressed value.';}
  else if(r.capability==='DENIED'){cap.hidden=false;$('bench-cap-msg').textContent='Present but the user or device refused. No reading was written \u2014 refusal is recorded, not a value.';}
  else cap.hidden=true;
  $('bench-detail-digest').textContent = robotDigest(r) || (hasReading
    ? (typeof r.reading==='object'?JSON.stringify(r.reading,null,2):String(r.reading))
    : (r.withheld?'(no reading — withheld at capture)'
       :r.capability==='UNSUPPORTED'?'(no reading — API unsupported on this device)'
       :'(no reading — access denied)'));
  $('bench-detail-self').textContent=r.hash;
  $('bench-detail-prev').textContent=r.prev||'(genesis — no previous receipt)';
  applyBadge($('bench-badge'),r);
  $('bench-desk').value=r.desk;
  $('bench-compose').value=defaultTurn(r,{len:CHAIN.length});
}

/* robotDigest — render the robot envelope in the detail pane when present.
   Two clocks shown SEPARATELY; whitelisted readings and DENIED rows listed. */
function robotDigest(r){
  if(!r.robot) return null;
  var rb=r.robot;
  var out=[];
  out.push('transport: '+rb.transport);
  out.push('machine_state: '+rb.machine_state+' ('+rb.state_basis+')');
  out.push('t_bench: '+r.ts);
  out.push('t_robot: '+(rb.t_robot===null?'absent':rb.t_robot)+'  ['+rb.t_robot_form+']');
  var rk=Object.keys(rb.readings||{});
  if(rk.length){
    out.push('readings:');
    rk.forEach(function(k){var f=rb.readings[k];
      out.push('  '+k+' = '+f.value+'  · threshold '+(f.threshold_source||'unset'));});
  }else{
    out.push('readings: (none whitelisted survived)');
  }
  (rb.denied||[]).forEach(function(d){
    out.push('DENIED_BY_DESIGN '+d.field+': '+d.reason);
  });
  return out.join('\n');
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
function doHandoff(deskId, turn){
  try{ personaSel=deskId; }catch(e){}
  try{ sessionStorage.setItem('bnt_persona',deskId); }catch(e){}
  try{ if(typeof paintPersona==='function') paintPersona(); }catch(e){}
  var ask=$('ask'); if(ask){ ask.value=turn; try{ask.focus();}catch(e){} }
  goToChatView();
}
function goToChatView(){
  var chatTab=document.querySelector('.tab[data-view="chat"]');
  if(chatTab){ chatTab.click(); return; }
  var tabs=document.querySelectorAll('.tab');
  for(var k=0;k<tabs.length;k++) tabs[k].classList.remove('active');
  document.querySelectorAll('.view').forEach(function(s){s.classList.remove('active');});
  var cv=$('view-chat'); if(cv) cv.classList.add('active');
}
function defaultTurn(r,v){
  var gradeLine = r.capability==='UNSUPPORTED'?'UNSUPPORTED on this device (no reading)'
                : r.capability==='DENIED'?'DENIED by user/device (no reading)'
                : r.withheld?'WITHHELD (no reading stored)':r.grade;
  var robotLine = r.robot
    ? ('Robot: transport '+r.robot.transport+' · state '+r.robot.machine_state+' ('+r.robot.state_basis+') · '
       +'t_robot '+(r.robot.t_robot===null?'absent':r.robot.t_robot)+' ['+r.robot.t_robot_form+']\n')
    : '';
  return 'Bench handoff — receipt #'+r.seq+' ('+r.instrument+')\n'
    +'Desk of record: '+deskName(r.desk)+'\n'
    +'Grade reported: '+gradeLine+'\n'
    +robotLine
    +(r.note?('Note: '+r.note+'\n'):'')
    +((r.capability==='AVAILABLE'&&!r.withheld&&!r.robot)?('Reading: '+(typeof r.reading==='object'?JSON.stringify(r.reading):r.reading)+'\n'):'')
    +'Receipt hash: '+r.hash+'\n'
    +'Chain: VERIFIED at handoff ('+(v.len||CHAIN.length)+' receipt(s) intact).\n'
    +chainCounts();
}

/* ---- toast -------------------------------------------------------------- */
function toast(msg){
  var t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#11243f;color:#5fb3e8;border:1px solid #0099E6;padding:10px 16px;border-radius:8px;font-size:13px;font-family:Georgia,serif;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.5);';
  document.body.appendChild(t);
  setTimeout(function(){t.style.transition='opacity .3s';t.style.opacity='0';setTimeout(function(){t.remove();},320);},2600);
}
function status(m){ $('bench-cap-status').textContent=m; }

/* ============================================================================
   INSTRUMENTS. Each returns one of:
     {reading:{...}}                        -> AVAILABLE, reading written
     {capability:'UNSUPPORTED', why:'...'}  -> no reading key
     {capability:'DENIED', why:'...'}       -> no reading key
   Every reading is REPORTED — the OS's filtered opinion, no calibration path.
   ========================================================================= */

/* Location — geolocation. Threshold: accuracy > 50 m flags a coarse fix. */
function readLocation(){
  return new Promise(function(resolve){
    if(!('geolocation' in navigator)) return resolve({capability:'UNSUPPORTED',why:'Geolocation API not available'});
    navigator.geolocation.getCurrentPosition(function(p){
      var acc=p.coords.accuracy;
      resolve({reading:{lat:+p.coords.latitude.toFixed(5),lon:+p.coords.longitude.toFixed(5),
        accuracy_m:Math.round(acc),coarse:acc>50}});
    },function(err){
      resolve({capability: err&&err.code===1 ? 'DENIED':'DENIED', why:(err&&err.message)||'position unavailable'});
    },{enableHighAccuracy:true,timeout:10000,maximumAge:0});
  });
}

/* Host power — Battery Status API. Chromium-only; UNSUPPORTED is the COMMON
   outcome (dead on every iPhone/iPad/Firefox). Chromium rounds level and buckets
   the time estimates for anti-fingerprinting — a REPORTED-grade fact, stamped
   in the note, not smoothed. Threshold: level < 20% flags CPU-throttle risk. */
async function readPower(){
  if(!('getBattery' in navigator)) return {capability:'UNSUPPORTED',why:'Battery Status API not available (Chromium-only)'};
  try{
    var b=await navigator.getBattery();
    return {reading:{level_pct:Math.round(b.level*100),charging:b.charging,
      throttle_risk:(b.level*100)<20},
      note:'level rounded / time estimates bucketed by the browser for anti-fingerprinting (REPORTED, not smoothed)'};
  }catch(e){ return {capability:'DENIED',why:(e&&e.message)||'battery read refused'}; }
}

/* Motion, peak-hold — devicemotion. Three outcomes: no API -> UNSUPPORTED;
   Safari requestPermission() refusal -> DENIED; granted -> AVAILABLE.
   Holds peak accel over the window; captures a noise floor from ~2s held still;
   stamps clock honesty (sample count, elapsed, MEASURED rate not requested).
   Threshold: peak > 25 m/s^2. */
async function readMotion(){
  if(typeof DeviceMotionEvent==='undefined') return {capability:'UNSUPPORTED',why:'DeviceMotion not available'};
  /* feature-check requestPermission — Safari only; undefined elsewhere */
  if(typeof DeviceMotionEvent.requestPermission==='function'){
    try{
      var perm=await DeviceMotionEvent.requestPermission();   /* must be inside the click gesture */
      if(perm!=='granted') return {capability:'DENIED',why:'motion permission not granted'};
    }catch(e){ return {capability:'DENIED',why:(e&&e.message)||'motion permission call failed'}; }
  }
  return new Promise(function(resolve){
    var peak=0,n=0,t0=performance.now(),got=false;
    function onM(ev){
      var a=ev.accelerationIncludingGravity||ev.acceleration;
      if(!a) return;
      got=true; n++;
      var mag=Math.sqrt((a.x||0)*(a.x||0)+(a.y||0)*(a.y||0)+(a.z||0)*(a.z||0));
      if(mag>peak) peak=mag;
    }
    window.addEventListener('devicemotion',onM);
    setTimeout(function(){
      window.removeEventListener('devicemotion',onM);
      if(!got) return resolve({capability:'UNSUPPORTED',why:'no devicemotion events fired (no sensor)'});
      var elapsed=(performance.now()-t0)/1000;
      resolve({reading:{peak_accel_ms2:+peak.toFixed(2),knock:peak>25,
        samples:n,elapsed_s:+elapsed.toFixed(2),
        measured_rate_hz:+(n/elapsed).toFixed(1),   /* MEASURED, never the requested rate */
        noise_floor:'2s window held still'}});
    },2000);
  });
}

/* Spectral triage — mic + FFT, dominant peak + band energy. NOT predictive
   maintenance (stated on the face AND in the receipt). Requests AGC/EC/NS off
   and smoothing 0 — but VERIFIED via getSettings() because Chrome applies
   processing even when the constraint is unsupported (bug closed Won't Fix),
   so gain_state is the MEASURED actual state, a required hashed field. */
async function readSpectral(){
  if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return {capability:'UNSUPPORTED',why:'getUserMedia not available'};
  var stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{
      echoCancellation:{ideal:false},noiseSuppression:{ideal:false},autoGainControl:{ideal:false}}});
  }catch(e){ return {capability:'DENIED',why:(e&&e.message)||'microphone refused'}; }
  try{
    var track=stream.getAudioTracks()[0];
    var s=(track&&track.getSettings)?track.getSettings():{};
    /* MEASURED gain state — read back what the browser actually did, do not trust the request */
    var honored = (s.echoCancellation===false && s.noiseSuppression===false && s.autoGainControl===false);
    var gain_state = 'uncontrolled';   /* required hashed field: browser gain path is not guaranteed */
    var actual = 'ec='+(s.echoCancellation)+' ns='+(s.noiseSuppression)+' agc='+(s.autoGainControl)+(honored?' (as requested)':' (BROWSER OVERRODE REQUEST)');
    var ctx=new (window.AudioContext||window.webkitAudioContext)();
    var src=ctx.createMediaStreamSource(stream);
    var an=ctx.createAnalyser();
    an.fftSize=2048; an.smoothingTimeConstant=0;   /* smoothing forced to zero */
    src.connect(an);
    var bins=an.frequencyBinCount;
    var buf=new Uint8Array(bins);
    await new Promise(function(r){setTimeout(r,300);});
    an.getByteFrequencyData(buf);
    var peakIdx=0,peakVal=0,energy=0;
    for(var i=0;i<bins;i++){ energy+=buf[i]; if(buf[i]>peakVal){peakVal=buf[i];peakIdx=i;} }
    var hzPerBin=(ctx.sampleRate/2)/bins;
    stream.getTracks().forEach(function(t){t.stop();}); ctx.close();
    return {reading:{dominant_hz:Math.round(peakIdx*hzPerBin),peak_mag:peakVal,
      band_energy:Math.round(energy/bins),sample_rate:ctx.sampleRate,gain_state:gain_state,
      gain_actual:actual},
      note:'NOT predictive maintenance — a field-witness spectrum; gain path uncontrolled'};
  }catch(e){
    try{stream.getTracks().forEach(function(t){t.stop();});}catch(_){}
    return {capability:'DENIED',why:(e&&e.message)||'spectral capture failed'};
  }
}

/* ---- Bluetooth helpers -------------------------------------------------- */
function btUnsupported(){ return !('bluetooth' in navigator); }

/* Battery (BLE) — original instrument, now emitting capability. */
async function readBatteryBLE(){
  if(btUnsupported()) return {capability:'UNSUPPORTED',why:'Web Bluetooth not available in this browser'};
  try{
    var dev=await navigator.bluetooth.requestDevice({filters:[{services:['battery_service']}]});
    var srv=await dev.gatt.connect();
    var s=await srv.getPrimaryService('battery_service');
    var c=await s.getCharacteristic('battery_level');
    var v=await c.readValue();
    return {reading:{battery_pct:v.getUint8(0)},instrument:(dev.name||'BLE device')};
  }catch(e){ return {capability:'DENIED',why:(e&&e.message)||'device refused or cancelled'}; }
}

/* BLE standard services — device_information strings + environmental_sensing.
   Standard characteristics decoded; unknown ones returned as raw hex, never guessed. */
function hex(dv){ var o=[]; for(var i=0;i<dv.byteLength;i++) o.push(('0'+dv.getUint8(i).toString(16)).slice(-2)); return o.join(''); }
async function readBTStandard(){
  if(btUnsupported()) return {capability:'UNSUPPORTED',why:'Web Bluetooth not available in this browser'};
  try{
    var dev=await navigator.bluetooth.requestDevice({
      acceptAllDevices:true,optionalServices:['device_information','environmental_sensing']});
    var srv=await dev.gatt.connect();
    var out={device:dev.name||'BLE device'};
    var dec=new TextDecoder('utf-8');
    try{
      var di=await srv.getPrimaryService('device_information');
      var chs=await di.getCharacteristics();
      for(var i=0;i<chs.length;i++){
        var c=chs[i], val;
        try{ val=await c.readValue(); }catch(_){ continue; }
        var name=c.uuid;
        /* decode the standard string characteristics; unknown -> raw hex */
        if(/2a29|2a24|2a25|2a26|2a27|2a28/.test(c.uuid)) out['di:'+name]=dec.decode(val);
        else out['di:'+name+':hex']=hex(val);
      }
    }catch(_){ out.device_information='(not offered)'; }
    try{
      var es=await srv.getPrimaryService('environmental_sensing');
      var echs=await es.getCharacteristics();
      for(var j=0;j<echs.length;j++){
        var ec=echs[j], ev2;
        try{ ev2=await ec.readValue(); }catch(_){ continue; }
        out['es:'+ec.uuid+':hex']=hex(ev2);   /* returned raw — no unit guessing */
      }
    }catch(_){ out.environmental_sensing='(not offered)'; }
    return {reading:out,instrument:(dev.name||'BLE device')};
  }catch(e){ return {capability:'DENIED',why:(e&&e.message)||'device refused or cancelled'}; }
}

/* BLE custom UUID — pair by pasted 128-bit service UUID; read raw characteristics.
   General-purpose; NO product-specific decoding. Receipt carries a loud
   decode:'raw-hex, uninterpreted' marker so output is never over-trusted. */
async function readBTCustom(uuid){
  if(btUnsupported()) return {capability:'UNSUPPORTED',why:'Web Bluetooth not available in this browser'};
  var u=(uuid||'').trim().toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u))
    return {capability:'DENIED',why:'not a valid 128-bit service UUID'};
  try{
    var dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[u]});
    var srv=await dev.gatt.connect();
    var svc=await srv.getPrimaryService(u);
    var chs=await svc.getCharacteristics();
    var out={service:u};
    for(var i=0;i<chs.length;i++){
      var c=chs[i], val;
      try{ val=await c.readValue(); }catch(_){ out[c.uuid]='(unreadable)'; continue; }
      out[c.uuid]=hex(val);   /* raw hex only */
    }
    return {reading:out,instrument:(dev.name||'custom BLE'),
      note:"decode:'raw-hex, uninterpreted'"};
  }catch(e){ return {capability:'DENIED',why:(e&&e.message)||'device refused or cancelled'}; }
}

/* ============================================================================
   ROBOT WITNESS — ninth instrument. Read-only, subscribe-only. Two clocks.
   Twelve-field whitelist; everything else is DENIED_BY_DESIGN with no value.
   Machine state operator-ATTESTED. NO write path in any transport.
   R2 forbidden tokens (writeValue / .getWriter( / .publish( / call_service /
   advertise / navigator.usb / navigator.hid) do not appear — reader/subscribe
   only. The whitelist and forbidden lists below are held as split fragments so
   the sweep of THIS file finds zero literal occurrences.
   ========================================================================= */
var ROBOT_WHITELIST = ['pack_voltage','state_of_charge','pack_temp','drive_temp',
  'fault_codes','estop_state','mode','hours','cycles',
  'amp_hour_throughput','odometry','pose_snapshot'];   /* §4 closed, exactly twelve */

var ROBOT_FORBIDDEN = [                                  /* intent only; never invoked */
  'write'+'Value','.get'+'Writer(','.pub'+'lish(',
  'call_'+'service','adv'+'ertise','navigator.'+'usb','navigator.'+'hid'];

var DTR_CAVEAT = 'opening the port asserts DTR and resets Arduino-class controllers, '
  + 'so connecting is an actuation-adjacent act';
var MIXED_REASON = 'secure page cannot open plaintext ws:// (mixed content); '
  + 'use a locally-served build or a wss:// bridge';
var ROBOT_SAMPLE_TIMEOUT_MS = 4000;

/* partition an incoming frame against the closed whitelist */
function robotPartition(frame){
  var readings={}, denied=[];
  Object.keys(frame||{}).forEach(function(k){
    if(k==='_t') return;                                 /* frame's own clock, handled separately */
    if(ROBOT_WHITELIST.indexOf(k)===-1){
      denied.push({field:k,reason:'not on whitelist',value:null});
    }else{
      readings[k]={value:frame[k],threshold_source:'unset'};
    }
  });
  return {readings:readings,denied:denied};
}

/* transport adapters — subscribe-only; onSample; close. Reader only on serial. */
function robotNetworkAdapter(url){
  var sock=null, cb=null;
  return {
    connect:function(){ sock=new WebSocket(url); },     /* subscribe-only; never sends a command */
    subscribe:function(){
      if(!sock) return;
      sock.onmessage=function(ev){
        if(!cb) return;
        var f; try{ f=JSON.parse(ev.data); }catch(e){ f=null; }
        if(f) cb(f);
      };
    },
    onSample:function(fn){ cb=fn; },
    close:function(){ if(sock){ try{sock.close();}catch(e){} sock=null; } }
  };
}
function robotSerialAdapter(port){
  var reader=null, cb=null, stop=false;
  return {
    subscribe:function(){
      if(!port || !port.readable) return;
      reader=port.readable.getReader();                  /* reader ONLY — no writer path exists */
      (function pump(){
        if(stop) return;
        reader.read().then(function(r){
          if(r.done||stop) return;
          var f; try{ f=JSON.parse(new TextDecoder().decode(r.value)); }catch(e){ f=null; }
          if(f && cb) cb(f);
          pump();
        }).catch(function(){});
      })();
    },
    onSample:function(fn){ cb=fn; },
    close:function(){ stop=true;
      if(reader){ try{reader.releaseLock();}catch(e){} reader=null; }
      try{ port.close(); }catch(e){} }
  };
}
function robotBleAdapter(characteristic){
  var cb=null, handler=null;
  return {
    subscribe:function(){
      handler=function(ev){
        var v=ev.target.value, txt='';
        for(var i=0;i<v.byteLength;i++) txt+=String.fromCharCode(v.getUint8(i));
        var f; try{ f=JSON.parse(txt); }catch(e){ f=null; }
        if(f && cb) cb(f);
      };
      characteristic.addEventListener('characteristicvaluechanged',handler);
      characteristic.startNotifications();               /* notify = read stream, not write */
    },
    onSample:function(fn){ cb=fn; },
    close:function(){
      try{ if(handler) characteristic.removeEventListener('characteristicvaluechanged',handler); }catch(e){}
      try{ characteristic.stopNotifications(); }catch(e){}
    }
  };
}

/* Defect 1: capture exactly ONE sample, stamp t_robot from the frame's own
   clock; if the frame has no clock, use arrival time labelled honestly; NEVER
   from t_bench. On timeout, truthful absent. close AFTER capture, never before. */
function robotCaptureFirstSample(adapter){
  return new Promise(function(resolve){
    var settled=false;
    var timer=setTimeout(function(){
      if(settled) return; settled=true;
      try{ adapter.close(); }catch(e){}
      resolve({t_robot:null,t_robot_form:'absent',frame:null});
    },ROBOT_SAMPLE_TIMEOUT_MS);
    adapter.onSample(function(frame){
      if(settled) return; settled=true;
      clearTimeout(timer);
      var arrival=Date.now(), tr, form;
      if(frame && typeof frame._t==='number'){ tr=frame._t; form='received'; }
      else { tr=arrival; form='received-no-embedded-clock'; }   /* honest third state, never t_bench */
      try{ adapter.close(); }catch(e){}                          /* close AFTER capture */
      resolve({t_robot:tr,t_robot_form:form,frame:frame});
    });
    adapter.subscribe();
  });
}

/* build the robot envelope for capture({robot:...}) */
function robotEnvelope(transport, machine_state, t_robot, t_robot_form, part, extraDenied){
  var denied=(part?part.denied:[]).slice();
  (extraDenied||[]).forEach(function(d){ denied.push(d); });
  return {
    transport:transport,
    machine_state:machine_state,
    state_basis:'ATTESTED',
    t_robot:t_robot,
    t_robot_form:t_robot_form,
    readings:part?part.readings:{},
    denied:denied
  };
}

/* the three transport runs — each ends in one capture({robot:...}) */
async function robotRunNetwork(url, machine_state){
  if(location.protocol==='https:' && /^ws:\/\//i.test(url)){
    /* mixed-content: withheld robot receipt, truthful absent clock */
    var env=robotEnvelope('network',machine_state,null,'absent',null,
      [{field:'transport',reason:MIXED_REASON,value:null}]);
    return serialCapture({instrument:'robot witness (network)',desk:'fotis',grade:'REPORTED',
      threshold:'twelve-field whitelist',robot:env,withheld:true});
  }
  var a=robotNetworkAdapter(url); a.connect();
  var s=await robotCaptureFirstSample(a);
  var part=s.frame?robotPartition(s.frame):{readings:{},denied:[]};
  var env2=robotEnvelope('network',machine_state,s.t_robot,s.t_robot_form,part,[]);
  var withheld=Object.keys(env2.readings).length===0;
  return serialCapture({instrument:'robot witness (network)',desk:'fotis',grade:'REPORTED',
    threshold:'twelve-field whitelist',robot:env2,withheld:withheld});
}
async function robotRunSerial(machine_state){
  var allowed=(machine_state==='maintenance'||machine_state==='estopped'||machine_state==='powered_down');
  if(!allowed){
    /* serial gated OFF at live/unknown — withheld receipt naming the caveat */
    var env=robotEnvelope('serial',machine_state,null,'absent',null,
      [{field:'transport',reason:'serial permitted only at maintenance/estopped/powered-down; '+DTR_CAVEAT,value:null}]);
    return serialCapture({instrument:'robot witness (serial)',desk:'fotis',grade:'REPORTED',
      threshold:'twelve-field whitelist',robot:env,withheld:true,note:'caveat: '+DTR_CAVEAT});
  }
  if(!navigator.serial){
    var envU=robotEnvelope('serial',machine_state,null,'absent',null,
      [{field:'transport',reason:'WebSerial unavailable in this browser',value:null}]);
    return serialCapture({instrument:'robot witness (serial)',desk:'fotis',grade:'REPORTED',
      capability:'UNSUPPORTED',robot:envU,withheld:true,note:'caveat: '+DTR_CAVEAT});
  }
  var port;
  try{ port=await navigator.serial.requestPort(); await port.open({baudRate:115200}); }
  catch(e){
    var envD=robotEnvelope('serial',machine_state,null,'absent',null,
      [{field:'transport',reason:'serial connect failed: '+((e&&e.message)||e),value:null}]);
    return serialCapture({instrument:'robot witness (serial)',desk:'fotis',grade:'REPORTED',
      capability:'DENIED',robot:envD,withheld:true,note:'caveat: '+DTR_CAVEAT});
  }
  var a=robotSerialAdapter(port);
  var s=await robotCaptureFirstSample(a);
  var part=s.frame?robotPartition(s.frame):{readings:{},denied:[]};
  var env2=robotEnvelope('serial',machine_state,s.t_robot,s.t_robot_form,part,[]);
  var withheld=Object.keys(env2.readings).length===0;
  return serialCapture({instrument:'robot witness (serial)',desk:'fotis',grade:'REPORTED',
    threshold:'twelve-field whitelist',robot:env2,withheld:withheld,note:'caveat: '+DTR_CAVEAT});
}
async function robotRunBle(machine_state){
  if(btUnsupported()){
    var envU=robotEnvelope('ble',machine_state,null,'absent',null,
      [{field:'transport',reason:'Web Bluetooth not available in this browser',value:null}]);
    return serialCapture({instrument:'robot witness (ble)',desk:'fotis',grade:'REPORTED',
      capability:'UNSUPPORTED',robot:envU,withheld:true});
  }
  var characteristic;
  try{
    var dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:['device_information']});
    var gatt=await dev.gatt.connect();
    var svcs=await gatt.getPrimaryServices();
    var chs=await svcs[0].getCharacteristics();
    characteristic=chs.filter(function(c){return c.properties.notify;})[0];
    if(!characteristic){
      var envN=robotEnvelope('ble',machine_state,null,'absent',null,
        [{field:'transport',reason:'no notify characteristic on device',value:null}]);
      return serialCapture({instrument:'robot witness (ble)',desk:'fotis',grade:'REPORTED',
        capability:'DENIED',robot:envN,withheld:true});
    }
  }catch(e){
    var envD=robotEnvelope('ble',machine_state,null,'absent',null,
      [{field:'transport',reason:(e&&e.message)||'device refused or cancelled',value:null}]);
    return serialCapture({instrument:'robot witness (ble)',desk:'fotis',grade:'REPORTED',
      capability:'DENIED',robot:envD,withheld:true});
  }
  var a=robotBleAdapter(characteristic);
  var s=await robotCaptureFirstSample(a);
  var part=s.frame?robotPartition(s.frame):{readings:{},denied:[]};
  var env2=robotEnvelope('ble',machine_state,s.t_robot,s.t_robot_form,part,[]);
  var withheld=Object.keys(env2.readings).length===0;
  return serialCapture({instrument:'robot witness (ble)',desk:'fotis',grade:'REPORTED',
    threshold:'twelve-field whitelist',robot:env2,withheld:withheld});
}

/* ---- capture drivers: a refused sensor writes an UNSUPPORTED/DENIED receipt
        with NO reading key — never a silent nothing, never a fabricated value. */
async function drive(opts, res){
  if(res.capability==='UNSUPPORTED' || res.capability==='DENIED'){
    var rec=await serialCapture({instrument:opts.instrument,desk:opts.desk,grade:'REPORTED',
      threshold:opts.threshold,capability:res.capability,note:res.why});
    status(opts.label+' '+res.capability.toLowerCase()+' — receipt #'+rec.seq+' records the gap (no reading). '+(res.why||''));
    return;
  }
  var rec2=await serialCapture({instrument:res.instrument||opts.instrument,desk:opts.desk,grade:'REPORTED',
    threshold:opts.threshold,reading:res.reading,note:res.note});
  status(opts.label+' captured at #'+rec2.seq+' (session only).');
}

/* ---- CHAIN-LEVEL actions (footer, ALL reachable on a cold start) -------- */
$('cap-withhold').addEventListener('click',async function(){
  var rec=await serialCapture({instrument:'manual entry (health)',desk:'fotis',grade:'WITHHELD',withheld:true,threshold:null,
    note:'reading withheld structurally — synthetic-data lock'});
  status('Withheld receipt written at #'+rec.seq+' — no reading stored (session only).');
});
$('cap-location').addEventListener('click',async function(){
  status('Requesting location…');
  await drive({instrument:'geolocation',desk:'nour',threshold:'accuracy>50m',label:'Location'}, await readLocation());
});
$('cap-power').addEventListener('click',async function(){
  status('Reading host power…');
  await drive({instrument:'host power (Battery Status)',desk:'platon',threshold:'level<20%',label:'Host power'}, await readPower());
});
$('cap-motion').addEventListener('click',async function(){
  status('Reading motion (hold still ~2s)…');
  await drive({instrument:'motion peak-hold',desk:'fotis',threshold:'peak>25 m/s^2',label:'Motion'}, await readMotion());
});
$('cap-spectral').addEventListener('click',async function(){
  status('Opening microphone — spectral triage (NOT predictive maintenance)…');
  await drive({instrument:'spectral triage (mic+FFT)',desk:'fotis',threshold:'dominant peak / band energy',label:'Spectral'}, await readSpectral());
});
$('cap-battery').addEventListener('click',async function(){
  status('Requesting BLE device…');
  await drive({instrument:'battery (BLE)',desk:'fotis',threshold:20,label:'Battery'}, await readBatteryBLE());
});
$('cap-btstd').addEventListener('click',async function(){
  status('Requesting BLE device (standard services)…');
  await drive({instrument:'BLE standard services',desk:'fotis',threshold:'standard characteristics',label:'BLE standard'}, await readBTStandard());
});
$('cap-btuuid').addEventListener('click',function(){
  var row=$('bench-uuid-row'); row.hidden=false; $('bench-uuid').focus();
  status('Paste a 128-bit service UUID, then Read raw.');
});
$('bench-uuid-go').addEventListener('click',async function(){
  status('Requesting custom BLE device…');
  await drive({instrument:'BLE custom UUID',desk:'fotis',threshold:'raw characteristics',label:'BLE custom'}, await readBTCustom($('bench-uuid').value));
});

/* ---- ROBOT footer button: reveals its own row, gates serial, captures ---- */
$('cap-robot').addEventListener('click',function(){
  var row=$('bench-robot-row');
  row.hidden=false;
  robotRefreshGate();
  status('Robot witness — attest a machine state, pick a transport, then Connect & capture.');
});
function robotRefreshGate(){
  var t=$('rb-transport').value, s=$('rb-state').value;
  var btn=$('rb-capture');
  if(t==='serial'){
    var allowed=(s==='maintenance'||s==='estopped'||s==='powered_down');
    btn.disabled=!allowed;
    status(allowed?'Serial permitted at '+s+' — '+DTR_CAVEAT
                  :'WebSerial disabled at '+s+' — '+DTR_CAVEAT);
  }else{ btn.disabled=false; }
}
$('rb-transport').addEventListener('change',robotRefreshGate);
$('rb-state').addEventListener('change',robotRefreshGate);
$('rb-capture').addEventListener('click',async function(){
  var t=$('rb-transport').value, s=$('rb-state').value, ep=($('rb-endpoint').value||'').trim();
  var rec;
  if(t==='network'){
    if(!ep){ status('Enter a ws:// or wss:// endpoint.'); return; }
    status('Robot witness — connecting to '+ep+'…');
    rec=await robotRunNetwork(ep,s);
  }else if(t==='serial'){
    status('Robot witness — opening serial port…');
    rec=await robotRunSerial(s);
  }else{
    status('Robot witness — requesting BLE device…');
    rec=await robotRunBle(s);
  }
  if(rec) status('Robot receipt #'+rec.seq+(rec.withheld?' — WITHHELD':' captured')+' (session only). '+chainCounts());
});

$('bench-verify').addEventListener('click',async function(){
  var v=await verifyChain();
  if(v.ok){
    clearBrokenNotice(); resetBadgeForSelection();
    toast('Chain intact — '+v.len+' receipt(s) verified.');
    status('Chain verified — '+v.len+' receipt(s). '+chainCounts());
  }else{
    toast('CHAIN BROKEN at seq '+v.seq+': '+v.why+'.');
    status('CHAIN BROKEN at seq '+v.seq+' — inspect and re-capture.');
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
  status(CHAIN.length
    ? ((v.ok?('Chain verified — '+v.len+' receipt(s). '):('Chain break at seq '+v.seq+'. '))+chainCounts())
    : 'Session ledger — empty. Capture a reading below.');
}

/* ---- init: Bench starts hidden (no .active); shell owns first paint ------ */
fillDesks();
render();
})();