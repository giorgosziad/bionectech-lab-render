<#
 add_karim_brief_v3.ps1  -  Load standing brief into CANONICAL (permanent, all personas/projects)
 v3 fix: build entries with plain string concatenation (no -f operator), so single
 braces are written, not doubled. Verified the output form parses as valid JS.
 Bionectech AI Lab - bionectech-lab-render (Render), NOT the Netlify twin.

 USAGE
   cd $HOME\Downloads\bionectech-lab-render
   powershell -ExecutionPolicy Bypass -File .\add_karim_brief_v3.ps1           # dry run
   powershell -ExecutionPolicy Bypass -File .\add_karim_brief_v3.ps1 -Commit   # apply
#>
param(
  [switch]$Commit,
  [string]$Repo = "$HOME\Downloads\bionectech-lab-render",
  [string]$BriefFile = "$HOME\Downloads\karim_brief.txt"
)
$ErrorActionPreference = 'Stop'
function Read-Utf8($p){ [IO.File]::ReadAllText($p,[Text.Encoding]::UTF8) }
function Write-Utf8NoBom($p,$c){ [IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding $false)) }
function Sha($p){ (Get-FileHash $p -Algorithm SHA256).Hash }
function CountOf($hay,$needle){ ([regex]::Matches($hay,[regex]::Escape($needle))).Count }
function Clean-Ascii($s){
  $s = $s -replace [char]0x2018,"'"; $s = $s -replace [char]0x2019,"'"
  $s = $s -replace [char]0x201C,'"'; $s = $s -replace [char]0x201D,'"'
  $s = $s -replace [char]0x2013,'-'; $s = $s -replace [char]0x2014,'-'
  $s = $s -replace [char]0x2026,'...'; $s = $s -replace [char]0x00A0,' '
  return $s
}

$ChatJs = Join-Path $Repo "netlify\functions\chat.js"
if(-not (Test-Path $ChatJs)){ throw "Missing file: $ChatJs" }
Write-Host "=== add_karim_brief_v3.ps1  ($(if($Commit){'COMMIT'}else{'DRY RUN'})) ===" -ForegroundColor Cyan
Write-Host ""

if(-not (Test-Path $BriefFile)){
  Write-Utf8NoBom $BriefFile "# one fact per line`n"
  Write-Host "Created $BriefFile - add one fact per line, save, run again." -ForegroundColor Yellow
  return
}

# read facts: keep only NON-# lines (no glued-comment guessing - that was the v2 bug)
$facts = @()
foreach($ln in ((Read-Utf8 $BriefFile) -split "`r?`n")){
  $t = $ln.Trim()
  if($t -eq '' -or $t.StartsWith('#')){ continue }
  $t = (Clean-Ascii $t).Trim()
  if($t -ne ''){ $facts += $t }
}
if($facts.Count -eq 0){ throw "No facts found in $BriefFile." }

$bad=@(); for($i=0;$i -lt $facts.Count;$i++){ if(($facts[$i].ToCharArray()|?{[int][char]$_ -gt 127}).Count){$bad+=($i+1)} }
if($bad.Count){ throw ("Non-ASCII left on line(s): "+($bad -join ', ')+". Retype plainly.") }

$src = Read-Utf8 $ChatJs
$start = 0
foreach($m in [regex]::Matches($src,"id:'brief-(\d+)'")){ $n=[int]$m.Groups[1].Value; if($n -gt $start){$start=$n} }
$today = Get-Date -Format 'yyyy-MM-dd'

# BUILD ENTRIES WITH PLAIN CONCATENATION - single braces, no -f operator
$entryLines = @()
$idx = $start
foreach($f in $facts){
  $idx++
  $id = 'brief-' + ('{0:d3}' -f $idx)
  $e  = $f.Replace('\','\\').Replace("'","\'")
  $line = "  { id:'" + $id + "', verified:'" + $today + "', verify_by:'permanent', source:'operator standing brief " + $today + "', body:'" + $e + "' },"
  $entryLines += $line
}
$block = ($entryLines -join "`n")

$anchor = 'const CANONICAL = ['
$found = CountOf $src $anchor
Write-Host ("anchor 'const CANONICAL = ['  expect 1 found " + $found) -ForegroundColor $(if($found -eq 1){'Green'}else{'Red'})
if($found -ne 1){ Write-Host "Anchor not unique/found. Nothing written." -ForegroundColor Red; return }

Write-Host ""
Write-Host ("facts to add: " + $facts.Count) -ForegroundColor Cyan
$facts | ForEach-Object { Write-Host ("  - " + $_) }
Write-Host ""
Write-Host "sample entry that will be written:" -ForegroundColor DarkCyan
Write-Host ("  " + $entryLines[0])
Write-Host ""

if(-not $Commit){ Write-Host "DRY RUN done. Nothing written. Re-run with -Commit to apply." -ForegroundColor Cyan; return }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $ChatJs ($ChatJs + ".bak_brief_" + $stamp) -Force
Write-Host ("Backup: chat.js.bak_brief_" + $stamp) -ForegroundColor DarkGray
$shaBefore = Sha $ChatJs
if((CountOf $src $anchor) -ne 1){ throw "Anchor drift. Aborting." }
$out = $src.Replace($anchor, $anchor + "`n" + $block)
Write-Utf8NoBom $ChatJs $out

Write-Host "--- gates ---" -ForegroundColor Cyan
& node --check $ChatJs
if($LASTEXITCODE -ne 0){
  Write-Host "node --check FAILED - restoring backup." -ForegroundColor Red
  Copy-Item ($ChatJs + ".bak_brief_" + $stamp) $ChatJs -Force
  Write-Host "chat.js restored. No change shipped." -ForegroundColor Yellow
  return
}
Write-Host "node --check chat.js: PASS" -ForegroundColor Green
Write-Host ("SHA before: " + $shaBefore)
Write-Host ("SHA after : " + (Sha $ChatJs))
Write-Host ""
Write-Host "DONE (written, not deployed). Next:" -ForegroundColor Cyan
Write-Host ('  git -C "' + $Repo + '" add netlify/functions/chat.js')
Write-Host ('  git -C "' + $Repo + '" commit -m "Load standing brief into CANONICAL"')
Write-Host ('  git -C "' + $Repo + '" push')
