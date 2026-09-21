<#
 lighten_karam.ps1 - make Karam lighter: load KARAM_BASE + KARAM_BOOK3 only.
 Book4 (advertising) and Book5 (visual) stay in the file, just not auto-loaded.
 Nothing deleted. Brand/regulatory locks unaffected (they live in CANONICAL).
 Pure one-token text swap; dry-run first; node --check gated; auto-restore on fail.

 USAGE
   cd $HOME\Downloads\bionectech-lab-render
   powershell -ExecutionPolicy Bypass -File .\lighten_karam.ps1           # dry run
   powershell -ExecutionPolicy Bypass -File .\lighten_karam.ps1 -Commit   # apply
 REVERT (undo): git -C $HOME\Downloads\bionectech-lab-render revert --no-edit HEAD ; git push
#>
param([switch]$Commit,[string]$Repo="$HOME\Downloads\bionectech-lab-render")
$ErrorActionPreference='Stop'
function R($p){[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)}
function W($p,$c){[IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding $false))}
function C($h,$n){([regex]::Matches($h,[regex]::Escape($n))).Count}
$ChatJs=Join-Path $Repo "netlify\functions\chat.js"
if(-not(Test-Path $ChatJs)){throw "Missing $ChatJs"}
Write-Host "=== lighten_karam.ps1 ($(if($Commit){'COMMIT'}else{'DRY RUN'})) ===" -ForegroundColor Cyan
$src=R $ChatJs
$old='KARAM_BASE.concat(KARAM_BOOK3).concat(KARAM_BOOK4).concat(KARAM_BOOK5)'
$new='KARAM_BASE.concat(KARAM_BOOK3)'
if((C $src $old) -eq 0 -and (C $src $new) -ge 1){Write-Host "Already lightened - nothing to do." -ForegroundColor Yellow;return}
$found=C $src $old
Write-Host ("match  expect 1 found $found") -ForegroundColor $(if($found -eq 1){'Green'}else{'Red'})
if($found -ne 1){Write-Host "Karam routing not in expected form. Nothing written." -ForegroundColor Red;return}
Write-Host "`nBEFORE: $old" -ForegroundColor DarkCyan
Write-Host "AFTER : $new" -ForegroundColor DarkCyan
if(-not $Commit){Write-Host "`nDRY RUN done. Nothing written. Re-run with -Commit." -ForegroundColor Cyan;return}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $ChatJs "$ChatJs.bak_karam_$stamp" -Force
Write-Host "`nBackup: chat.js.bak_karam_$stamp" -ForegroundColor DarkGray
$out=$src.Replace($old,$new)
W $ChatJs $out
& node --check $ChatJs
if($LASTEXITCODE -ne 0){Copy-Item "$ChatJs.bak_karam_$stamp" $ChatJs -Force;Write-Host "node --check FAILED - restored. No change." -ForegroundColor Red;return}
Write-Host "node --check chat.js: PASS" -ForegroundColor Green
Write-Host "`nDONE (written, not deployed). Next:" -ForegroundColor Cyan
Write-Host ('  git -C "'+$Repo+'" add netlify/functions/chat.js')
Write-Host ('  git -C "'+$Repo+'" commit -m "Lighten Karam: load BASE+Book3 by default"')
Write-Host ('  git -C "'+$Repo+'" push')
Write-Host "LIVE CHECK: new chat, Karam, ask anything - he should be faster/leaner." -ForegroundColor Cyan
Write-Host "TOO LIGHT? one-line undo:  git revert --no-edit HEAD ; git push" -ForegroundColor Yellow
