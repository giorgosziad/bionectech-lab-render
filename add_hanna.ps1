<#
============================================================================
 add_hanna.ps1  -  Install the HANNA persona into the Bionectech AI Lab
 Bionectech AI Lab  -  bionectech-lab-render (Render), NOT the Netlify twin
============================================================================

 WHAT IT DOES
   Wires the HANNA persona into netlify/functions/chat.js and public/index.html
   with 13 exact string replacements, each with an EXPECTED MATCH COUNT stated
   in advance (Karim Instrument doctrine: expected values before the command).

   HANNA_BASE + HANNA_BOOK2 constants are built from the pure-ASCII embed cores
   you already validated (6,741 bytes combined, under the 10,240 ceiling).

 SAFETY MODEL
   - DRY RUN by default: prints every match count and a preview. Writes nothing.
   - -Commit: only after every edit reports its exact expected count. Backs up
     both files, applies in memory, writes UTF-8 no-BOM via [IO.File]::WriteAllText,
     runs `node --check` on chat.js, prints last-60-chars tail + SHA-256 for both,
     and auto-restores chat.js from backup if `node --check` fails.
   - Never touches the FERRIS drift detector. Never runs git. You review the
     diff and deploy yourself (your Operator-Deploy Playbook).

 USAGE
   powershell
   cd $HOME\Downloads\bionectech-lab-render
   .\add_hanna.ps1                 # dry run  -  send me this output
   .\add_hanna.ps1 -Commit         # apply, after the dry run is all-green

 PREREQS (the script checks them)
   - $Repo\netlify\functions\chat.js  and  $Repo\public\index.html exist
   - HANNA_BASE_core.txt and HANNA_BOOK2_core.txt in $Src (pure ASCII)
============================================================================
#>

param(
  [switch]$Commit,
  [string]$Repo = "$HOME\Downloads\bionectech-lab-render",
  [string]$Src  = "$HOME\Downloads"
)

$ErrorActionPreference = 'Stop'

function Read-Utf8([string]$p){ [IO.File]::ReadAllText($p,[Text.Encoding]::UTF8) }
function Write-Utf8NoBom([string]$p,[string]$c){ [IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding $false)) }
function Sha([string]$p){ (Get-FileHash $p -Algorithm SHA256).Hash }
function CountOf([string]$hay,[string]$needle){ ([regex]::Matches($hay,[regex]::Escape($needle))).Count }

$ChatJs = Join-Path $Repo "netlify\functions\chat.js"
$Html   = Join-Path $Repo "public\index.html"

Write-Host "=== add_hanna.ps1  ($(if($Commit){'COMMIT'}else{'DRY RUN'})) ===`n" -ForegroundColor Cyan

# ---- prereqs -------------------------------------------------------------
foreach($p in @($ChatJs,$Html)){ if(-not (Test-Path $p)){ throw "Missing file: $p" } }
$baseCoreP  = Join-Path $Src "HANNA_BASE_core.txt"
$book2CoreP = Join-Path $Src "HANNA_BOOK2_core.txt"
foreach($p in @($baseCoreP,$book2CoreP)){ if(-not (Test-Path $p)){ throw "Missing embed core: $p" } }

# ---- idempotency guard ---------------------------------------------------
if( (Read-Utf8 $ChatJs) -match 'HANNA_BASE' ){
  Write-Host "HANNA_BASE already present in chat.js  -  nothing to do (already installed)." -ForegroundColor Yellow
  return
}

# ---- build the constant blocks from the ASCII cores ----------------------
function To-JsArray([string]$path,[string]$constName){
  $raw = Read-Utf8 $path
  $na  = ($raw.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }).Count
  if($na -ne 0){ throw "$path is not pure ASCII ($na non-ASCII chars)  -  embed gate FAIL" }
  $lines = $raw -split "`r?`n" | Where-Object { $_ -ne '' }
  $elems = foreach($ln in $lines){
    $e = $ln -replace '\\','\\'      # backslash -> double backslash
    $e = $e  -replace "'","\'"       # single quote -> escaped
    "  '$e'"
  }
  "const $constName = [`n" + ($elems -join ",`n") + "`n];`n"
}

$hannaBaseBytes  = [Text.Encoding]::UTF8.GetByteCount((Read-Utf8 $baseCoreP))
$hannaBook2Bytes = [Text.Encoding]::UTF8.GetByteCount((Read-Utf8 $book2CoreP))
$combined = $hannaBaseBytes + $hannaBook2Bytes
Write-Host ("embed cores: HANNA_BASE={0}B  HANNA_BOOK2={1}B  combined={2}B  ceiling=10240  -> {3}" -f `
  $hannaBaseBytes,$hannaBook2Bytes,$combined,$(if($combined -le 10240){'PASS'}else{'FAIL'})) -ForegroundColor $(if($combined -le 10240){'Green'}else{'Red'})
if($combined -gt 10240){ throw "Combined embed exceeds 10,240-byte ceiling  -  consolidate before deploy." }

$constBlock = (To-JsArray $baseCoreP 'HANNA_BASE') + (To-JsArray $book2CoreP 'HANNA_BOOK2')

# ==========================================================================
#  THE 13 EDITS  -  each: Tag, File, Old (exact), New, Expect (match count)
# ==========================================================================
$edits = @(

  # ---- chat.js (6) ----
  @{ Tag='chat: declare HANNA_BASE + HANNA_BOOK2';           File=$ChatJs; Expect=1;
     Old='const KYROS_BASE = [';
     New=($constBlock + 'const KYROS_BASE = [') }

  @{ Tag='chat: buildBriefing lines[] chain (load cores)';  File=$ChatJs; Expect=1;
     Old="persona === 'hanno' ? HANNO_BASE : persona === 'platon' ?";
     New="persona === 'hanno' ? HANNO_BASE : persona === 'hanna' ? HANNA_BASE.concat(HANNA_BOOK2) : persona === 'platon' ?" }

  @{ Tag="chat: NAME + _pName display chains (x2)";          File=$ChatJs; Expect=2;
     Old="(persona === 'hanno') ? 'Hanno' : (persona === 'fotis') ?";
     New="(persona === 'hanno') ? 'Hanno' : (persona === 'hanna') ? 'Hanna' : (persona === 'fotis') ?" }

  @{ Tag='chat: PERSONA_NAMES map';                          File=$ChatJs; Expect=1;
     Old="hanno:'Hanno', fotis:'Fotis',";
     New="hanno:'Hanno', hanna:'Hanna', fotis:'Fotis'," }

  @{ Tag='chat: _pRaw -> persona normalizer';                File=$ChatJs; Expect=1;
     Old="(_pRaw === 'hanno') ? 'hanno' : (_pRaw === 'fotis') ?";
     New="(_pRaw === 'hanno') ? 'hanno' : (_pRaw === 'hanna') ? 'hanna' : (_pRaw === 'fotis') ?" }

  # ---- public/index.html (7) ----
  @{ Tag='html: persona button (after Hanno)';               File=$Html; Expect=1;
     Old='<button id="personaHanno" type="button">Hanno</button>';
     New='<button id="personaHanno" type="button">Hanno</button><button id="personaHanna" type="button">Hanna</button>' }

  @{ Tag='html: _desks allowlist';                           File=$Html; Expect=1;
     Old="'platon','hanno','fotis'";
     New="'platon','hanno','hanna','fotis'" }

  @{ Tag='html: history render label (turn.persona)';        File=$Html; Expect=1;
     Old="turn.persona==='hanno'?'Hanno':turn.persona==='fotis'?'Fotis'";
     New="turn.persona==='hanno'?'Hanno':turn.persona==='hanna'?'Hanna':turn.persona==='fotis'?'Fotis'" }

  @{ Tag='html: personaSel display chains (working/who/label) x3'; File=$Html; Expect=3;
     Old="personaSel==='hanno'?'Hanno':personaSel==='fotis'?'Fotis'";
     New="personaSel==='hanno'?'Hanno':personaSel==='hanna'?'Hanna':personaSel==='fotis'?'Fotis'" }

  @{ Tag='html: paintPersona opacity';                       File=$Html; Expect=1;
     Old="var hn=`$('personaHanno'); if(hn) hn.style.opacity=personaSel==='hanno'?'1':'0.5';";
     New="var hn=`$('personaHanno'); if(hn) hn.style.opacity=personaSel==='hanno'?'1':'0.5'; var ha=`$('personaHanna'); if(ha) ha.style.opacity=personaSel==='hanna'?'1':'0.5';" }

  @{ Tag='html: activeAssistantName (UPPER) chain';          File=$Html; Expect=1;
     Old="personaSel==='hanno'?'HANNO':personaSel==='fotis'?'FOTIS'";
     New="personaSel==='hanno'?'HANNO':personaSel==='hanna'?'HANNA':personaSel==='fotis'?'FOTIS'" }

  @{ Tag='html: assistantSwitch cycle order (Hanna after Hanno)'; File=$Html; Expect=1;
     Old="personaSel==='platon'?'hanno':personaSel==='hanno'?'fotis'";
     New="personaSel==='platon'?'hanno':personaSel==='hanno'?'hanna':personaSel==='hanna'?'fotis'" }

  @{ Tag='html: assistantSwitch toast text';                 File=$Html; Expect=1;
     Old="personaSel==='hanno'?'Hanno is active - commerce.':personaSel==='fotis'?";
     New="personaSel==='hanno'?'Hanno is active - commerce.':personaSel==='hanna'?'Hanna is active - craft, fit and resilience.':personaSel==='fotis'?" }

  @{ Tag='html: button click handler (after Kyros handler)'; File=$Html; Expect=1;
     Old="var _pky=`$('personaKyros'); if(_pky) _pky.addEventListener('click',function(){ personaSel='kyros'; try{sessionStorage.setItem('bnt_persona','kyros');}catch(e){} paintPersona(); toast('Kyros is active - capital and negotiation.'); });";
     New="var _pky=`$('personaKyros'); if(_pky) _pky.addEventListener('click',function(){ personaSel='kyros'; try{sessionStorage.setItem('bnt_persona','kyros');}catch(e){} paintPersona(); toast('Kyros is active - capital and negotiation.'); });`n      var _pha=`$('personaHanna'); if(_pha) _pha.addEventListener('click',function(){ personaSel='hanna'; try{sessionStorage.setItem('bnt_persona','hanna');}catch(e){} paintPersona(); toast('Hanna is active - craft, fit and resilience.'); });" }
)

# ---- DRY-RUN VERIFY (always runs) ----------------------------------------
$texts = @{ $ChatJs = (Read-Utf8 $ChatJs); $Html = (Read-Utf8 $Html) }
$allOk = $true
Write-Host "`n--- match verification (expected vs found) ---" -ForegroundColor Cyan
$i = 0
foreach($e in $edits){
  $i++
  $found = CountOf $texts[$e.File] $e.Old
  $ok = ($found -eq $e.Expect)
  if(-not $ok){ $allOk = $false }
  $flag = if($ok){'OK  '}else{'FAIL'}
  $col  = if($ok){'Green'}else{'Red'}
  Write-Host ("  [{0,2}] {1}  expect {2} found {3}  {4}" -f $i,$flag,$e.Expect,$found,$e.Tag) -ForegroundColor $col
}
Write-Host ""

if(-not $allOk){
  Write-Host "One or more edits did not match exactly. NOTHING was written." -ForegroundColor Red
  Write-Host "The source has drifted from the probe. Send me the failing Tag(s) and I'll re-anchor." -ForegroundColor Yellow
  return
}
Write-Host "All 13 edits matched their expected counts." -ForegroundColor Green
Write-Host ("HANNA constants to insert: {0} bytes of JS." -f $constBlock.Length)

if(-not $Commit){
  Write-Host "`nDRY RUN complete. Nothing written. Re-run with -Commit to apply." -ForegroundColor Cyan
  Write-Host "Send me this output first so I can confirm before you commit." -ForegroundColor Yellow
  return
}

# ---- COMMIT --------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach($f in @($ChatJs,$Html)){ Copy-Item $f "$f.bak_hanna_$stamp" -Force }
Write-Host "`nBackups written (.bak_hanna_$stamp)." -ForegroundColor DarkGray

$shaBefore = @{ $ChatJs = (Sha $ChatJs); $Html = (Sha $Html) }

# apply per file
foreach($f in @($ChatJs,$Html)){
  $t = $texts[$f]
  foreach($e in ($edits | Where-Object { $_.File -eq $f })){
    $before = CountOf $t $e.Old
    if($before -ne $e.Expect){ throw "Re-count drift on '$($e.Tag)' (found $before, expected $($e.Expect)). Aborting; no partial write." }
    $t = $t.Replace($e.Old,$e.New)
  }
  Write-Utf8NoBom $f $t
}

# ---- gates ---------------------------------------------------------------
Write-Host "`n--- gates ---" -ForegroundColor Cyan
& node --check $ChatJs
if($LASTEXITCODE -ne 0){
  Write-Host "node --check FAILED on chat.js  -  restoring from backup." -ForegroundColor Red
  Copy-Item "$ChatJs.bak_hanna_$stamp" $ChatJs -Force
  Write-Host "chat.js restored. index.html was written; review its backup too." -ForegroundColor Yellow
  return
}
Write-Host "node --check chat.js: PASS" -ForegroundColor Green

foreach($f in @($ChatJs,$Html)){
  $t = Read-Utf8 $f
  $na = [regex]::Matches($t,'[^\x00-\x7F]').Count
  $tail = $t.Substring([Math]::Max(0,$t.Length-60))
  Write-Host ("`n{0}" -f (Split-Path $f -Leaf)) -ForegroundColor Cyan
  Write-Host ("  SHA before: {0}" -f $shaBefore[$f])
  Write-Host ("  SHA after : {0}" -f (Sha $f))
  Write-Host ("  non-ASCII bytes: {0}" -f $na)
  Write-Host ("  last 60 chars: {0}" -f ($tail -replace "`r"," " -replace "`n"," "))
}

Write-Host @"

DONE (files written, not deployed). Next, your call:
  git -C "$Repo" diff --stat          # confirm ONLY chat.js + public/index.html changed; FERRIS block untouched
  git -C "$Repo" add -A
  git -C "$Repo" commit -m "Add HANNA persona (craft/fit/resilience): Book One + Book Two cores; 13-site wiring"
  git -C "$Repo" push                 # Render auto-deploys

LIVE ACCEPTANCE TEST (the only real gate):
  1. Open the Lab, pick Hanna. Ask a fit question -> she answers AS Hanna (not Karam).
  2. Ask her to 'approve this ad copy' -> she routes the CLAIM to Hanno, does not adjudicate it.
  If either fails or the deploy stalls:  git -C "$Repo" revert --no-edit HEAD ; git -C "$Repo" push
"@ -ForegroundColor Cyan
