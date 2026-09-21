<#
============================================================================
 add_karim_brief.ps1  -  Load your standing brief into permanent Lab memory
 Bionectech AI Lab  -  bionectech-lab-render (Render), NOT the Netlify twin
============================================================================

 WHAT THIS FIXES
   Karam/Karim "forget" your brief when you switch projects because per-project
   memory (mem:notes:<persona>:<deskKey>) is a DIFFERENT bucket per product.
   The CANONICAL ledger is injected on EVERY turn, EVERY persona, EVERY project,
   and injected WHOLE (never trimmed). Facts placed here cannot be lost on a
   project switch and cannot be half-listed. This loads your brief into it.

 SCOPE: this is for GLOBAL facts - true across the whole Lab (org, URLs, repos,
 standing rules, deploy facts, IDs). Per-product facts that differ by project
 are a separate build (the per-project writer); tell me and I'll do that next.

 HOW TO USE (two steps, nothing to paste to anyone)
   powershell
   cd $HOME\Downloads\bionectech-lab-render

   # 1. First run creates the brief file for you, then stops:
   .\add_karim_brief.ps1
   #    -> open  $HOME\Downloads\karim_brief.txt , put ONE FACT PER LINE, save.

   # 2. Dry run (writes nothing, shows what will be added):
   .\add_karim_brief.ps1
   #    then, when it looks right:
   .\add_karim_brief.ps1 -Commit

   Re-run any time you add more lines to the file - it appends new facts and
   never duplicates old ones. Smart quotes / dashes are auto-cleaned to ASCII.
============================================================================
#>

param(
  [switch]$Commit,
  [string]$Repo = "$HOME\Downloads\bionectech-lab-render",
  [string]$BriefFile = "$HOME\Downloads\karim_brief.txt"
)

$ErrorActionPreference = 'Stop'

function Read-Utf8([string]$p){ [IO.File]::ReadAllText($p,[Text.Encoding]::UTF8) }
function Write-Utf8NoBom([string]$p,[string]$c){ [IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding $false)) }
function Sha([string]$p){ (Get-FileHash $p -Algorithm SHA256).Hash }
function CountOf([string]$hay,[string]$needle){ ([regex]::Matches($hay,[regex]::Escape($needle))).Count }

$ChatJs = Join-Path $Repo "netlify\functions\chat.js"
if(-not (Test-Path $ChatJs)){ throw "Missing file: $ChatJs" }

Write-Host "=== add_karim_brief.ps1  ($(if($Commit){'COMMIT'}else{'DRY RUN'})) ===`n" -ForegroundColor Cyan

# ---- bootstrap the brief file on first run -------------------------------
if(-not (Test-Path $BriefFile)){
  $tpl = @"
# KARIM / KARAM STANDING BRIEF
# One fact per line. Lines starting with # are ignored. Blank lines ignored.
# Everything here is loaded into permanent Lab memory (every persona, every project).
# Examples (delete these, write your own):
# The production model account is the Bionectech company org; BAA + ZDR executed.
# Live Lab runs on bionectech-lab-render (Render), never the Netlify twin.
# Brand: no emoji anywhere, SVG icons only; Sky #0099E6, Deep Sky #006BB5, Yellow #FFD600.
"@
  Write-Utf8NoBom $BriefFile $tpl
  Write-Host "I created your brief file:" -ForegroundColor Green
  Write-Host "  $BriefFile"
  Write-Host "Open it, put ONE FACT PER LINE, save, then run this script again." -ForegroundColor Yellow
  return
}

# ---- read + clean the brief ---------------------------------------------
$rawLines = (Read-Utf8 $BriefFile) -split "`r?`n"
$facts = @()
foreach($ln in $rawLines){
  $t = $ln.Trim()
  if($t -eq '' -or $t.StartsWith('#')){ continue }
  # auto-clean common non-ASCII to ASCII so nothing mojibakes into the engine
  $t = $t.Replace([char]0x2018,"'").Replace([char]0x2019,"'").Replace([char]0x201C,'"').Replace([char]0x201D,'"').Replace([char]0x2013,'-').Replace([char]0x2014,'-').Replace([char]0x2026,'...').Replace([char]0x00A0,' ')
  $facts += $t
}
if($facts.Count -eq 0){ throw "No facts found in $BriefFile (every line was blank or a # comment)." }

# any non-ASCII left after cleaning? report and stop (mojibake gate)
$bad = @()
for($i=0;$i -lt $facts.Count;$i++){ if(($facts[$i].ToCharArray() | Where-Object { [int][char]$_ -gt 127 }).Count){ $bad += ($i+1) } }
if($bad.Count){ throw ("These brief lines still contain unusual characters after cleaning: line(s) " + ($bad -join ', ') + ". Retype them in plain text and re-run.") }

# ---- build the ledger entries (append after any existing brief-NNN) -------
$src = Read-Utf8 $ChatJs
$existing = [regex]::Matches($src, "id:'brief-(\d+)'")
$start = 0
foreach($m in $existing){ $n=[int]$m.Groups[1].Value; if($n -gt $start){ $start=$n } }
$today = Get-Date -Format 'yyyy-MM-dd'

$entryLines = @()
$idx = $start
foreach($f in $facts){
  $idx++
  $id = 'brief-{0:d3}' -f $idx
  $e = $f.Replace('\','\\').Replace("'","\'")   # JS single-quote escape (literal)
  $entryLines += ("  {{ id:'$id', verified:'$today', verify_by:'permanent', source:'operator standing brief $today', body:'$e' }},")
}
$block = ($entryLines -join "`n")

$anchor = 'const CANONICAL = ['
$old = $anchor
$new = $anchor + "`n" + $block

# ---- verify anchor -------------------------------------------------------
$found = CountOf $src $old
Write-Host ("anchor 'const CANONICAL = ['  expect 1 found {0}" -f $found) -ForegroundColor $(if($found -eq 1){'Green'}else{'Red'})
if($found -ne 1){ Write-Host "Anchor not unique/found. Nothing written. Send me this output." -ForegroundColor Red; return }

Write-Host ("`nfacts to add: {0}   (ids brief-{1:d3} .. brief-{2:d3})" -f $facts.Count,($start+1),$idx) -ForegroundColor Cyan
Write-Host "preview (first 3):" -ForegroundColor DarkCyan
$entryLines | Select-Object -First 3 | ForEach-Object { Write-Host ("  " + ($_ -replace '\s+',' ').Trim()) }
Write-Host ""

if(-not $Commit){
  Write-Host "DRY RUN complete. Nothing written. Re-run with -Commit to apply." -ForegroundColor Cyan
  return
}

# ---- COMMIT --------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $ChatJs "$ChatJs.bak_brief_$stamp" -Force
Write-Host "`nBackup: chat.js.bak_brief_$stamp" -ForegroundColor DarkGray
$shaBefore = Sha $ChatJs

if((CountOf $src $old) -ne 1){ throw "Re-count drift on anchor. Aborting; no write." }
$out = $src.Replace($old,$new)
Write-Utf8NoBom $ChatJs $out

Write-Host "`n--- gates ---" -ForegroundColor Cyan
& node --check $ChatJs
if($LASTEXITCODE -ne 0){
  Write-Host "node --check FAILED  -  restoring from backup." -ForegroundColor Red
  Copy-Item "$ChatJs.bak_brief_$stamp" $ChatJs -Force
  Write-Host "chat.js restored. No change shipped." -ForegroundColor Yellow
  return
}
Write-Host "node --check chat.js: PASS" -ForegroundColor Green
$after = Read-Utf8 $ChatJs
Write-Host ("SHA before: {0}" -f $shaBefore)
Write-Host ("SHA after : {0}" -f (Sha $ChatJs))
Write-Host ("non-ASCII bytes in chat.js: {0}" -f [regex]::Matches($after,'[^\x00-\x7F]').Count)

Write-Host @"

DONE (written, not deployed). Next:
  git -C "$Repo" diff -- netlify/functions/chat.js    # only CANONICAL grew
  git -C "$Repo" add netlify/functions/chat.js
  git -C "$Repo" commit -m "Load operator standing brief into CANONICAL ($($facts.Count) facts)"
  git -C "$Repo" push                                  # Render auto-deploys

LIVE CHECK: open a NEW chat, switch to OncoDefy (or any project), ask Karim or
Karam to recite the standing brief. Every fact should be there - because
CANONICAL ignores the per-project bucket. That is the fix for the screenshot.
"@ -ForegroundColor Cyan
