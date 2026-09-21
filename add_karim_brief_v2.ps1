<#
============================================================================
 add_karim_brief_v2.ps1  -  Load your standing brief into permanent memory
 Bionectech AI Lab  -  bionectech-lab-render (Render), NOT the Netlify twin
 v2 fix: non-ASCII cleanup uses -replace (handles multi-char like the ellipsis
 correctly, which crashed v1); tolerates a brief file with no trailing newline
 and a fact glued onto the last # comment line.
============================================================================
 USAGE
   powershell
   cd $HOME\Downloads\bionectech-lab-render
   powershell -ExecutionPolicy Bypass -File .\add_karim_brief_v2.ps1          # dry run
   powershell -ExecutionPolicy Bypass -File .\add_karim_brief_v2.ps1 -Commit  # apply
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

function Clean-Ascii([string]$s){
  $s = $s -replace [char]0x2018,"'"
  $s = $s -replace [char]0x2019,"'"
  $s = $s -replace [char]0x201C,'"'
  $s = $s -replace [char]0x201D,'"'
  $s = $s -replace [char]0x2013,'-'
  $s = $s -replace [char]0x2014,'-'
  $s = $s -replace [char]0x2026,'...'
  $s = $s -replace [char]0x00A0,' '
  return $s
}

$ChatJs = Join-Path $Repo "netlify\functions\chat.js"
if(-not (Test-Path $ChatJs)){ throw "Missing file: $ChatJs" }

Write-Host "=== add_karim_brief_v2.ps1  ($(if($Commit){'COMMIT'}else{'DRY RUN'})) ===`n" -ForegroundColor Cyan

if(-not (Test-Path $BriefFile)){
  Write-Utf8NoBom $BriefFile ("# KARIM / KARAM STANDING BRIEF`n# One fact per line. Lines starting with # are ignored.`n")
  Write-Host "Created $BriefFile - add one fact per line, save, run again." -ForegroundColor Yellow
  return
}

$rawLines = (Read-Utf8 $BriefFile) -split "`r?`n"
$facts = @()
foreach($ln in $rawLines){
  $t = $ln.Trim()
  if($t -eq ''){ continue }
  if($t.StartsWith('#')){
    $glued = $t -replace '^#.*?([A-Z].*)$','$1'
    if($glued -ne $t -and -not $glued.StartsWith('#')){ $t = $glued.Trim() } else { continue }
  }
  $t = (Clean-Ascii $t).Trim()
  if($t -ne '' -and -not $t.StartsWith('#')){ $facts += $t }
}
if($facts.Count -eq 0){ throw "No facts found in $BriefFile (every line was blank or a # comment)." }

$bad = @()
for($i=0;$i -lt $facts.Count;$i++){ if(($facts[$i].ToCharArray() | Where-Object { [int][char]$_ -gt 127 }).Count){ $bad += ($i+1) } }
if($bad.Count){ throw ("Brief line(s) still have unusual characters after cleaning: " + ($bad -join ', ') + ". Retype them plainly and re-run.") }

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
  $e = $f.Replace('\','\\').Replace("'","\'")
  $entryLines += ("  {{ id:'$id', verified:'$today', verify_by:'permanent', source:'operator standing brief $today', body:'$e' }},")
}
$block = ($entryLines -join "`n")

$anchor = 'const CANONICAL = ['
$found = CountOf $src $anchor
Write-Host ("anchor 'const CANONICAL = ['  expect 1 found {0}" -f $found) -ForegroundColor $(if($found -eq 1){'Green'}else{'Red'})
if($found -ne 1){ Write-Host "Anchor not found/unique. Nothing written." -ForegroundColor Red; return }

Write-Host ("`nfacts to add: {0}   (ids brief-{1:d3} .. brief-{2:d3})" -f $facts.Count,($start+1),$idx) -ForegroundColor Cyan
Write-Host "the facts I read:" -ForegroundColor DarkCyan
$facts | ForEach-Object { Write-Host ("  - " + $_) }
Write-Host ""

if(-not $Commit){
  Write-Host "DRY RUN complete. Nothing written. Re-run with -Commit to apply." -ForegroundColor Cyan
  return
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $ChatJs "$ChatJs.bak_brief_$stamp" -Force
Write-Host "`nBackup: chat.js.bak_brief_$stamp" -ForegroundColor DarkGray
$shaBefore = Sha $ChatJs

if((CountOf $src $anchor) -ne 1){ throw "Re-count drift on anchor. Aborting; no write." }
$out = $src.Replace($anchor, $anchor + "`n" + $block)
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

Write-Host "`nDONE (written, not deployed). Next:" -ForegroundColor Cyan
Write-Host ('  git -C "' + $Repo + '" add netlify/functions/chat.js')
Write-Host ('  git -C "' + $Repo + '" commit -m "Load operator standing brief into CANONICAL"')
Write-Host ('  git -C "' + $Repo + '" push')
Write-Host "LIVE CHECK: new chat, switch to OncoDefy, ask Karim to recite the brief - all facts present." -ForegroundColor Cyan
