$ErrorActionPreference = "Stop"

Write-Host "============================================================"
Write-Host "ADE APEX — SECURITY ACTION ISOLATION REPAIR"
Write-Host "============================================================"

$root = (Get-Location).Path
$file = Join-Path $root "public\index.html"

if (!(Test-Path $file)) {
    throw "public\index.html was not found. Stop."
}

Write-Host ""
Write-Host "[1/7] Creating protected backup..."
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$file.pre-security-isolation-$stamp.bak"
Copy-Item $file $backup -Force
Write-Host "Backup: $backup"

Write-Host ""
Write-Host "[2/7] Reading current source..."
$text = Get-Content $file -Raw

$original = $text

Write-Host ""
Write-Host "[3/7] Adding independent busy states..."

$old = 'const [authBusy,setAuthBusy]=useState(false),[authMsg,setAuthMsg]=useState(null),[pwErr,setPwErr]=useState(""),[pwMsg,setPwMsg]=useState(""),[pinErr,setPinErr]=useState(""),[pinMsg,setPinMsg]=useState(""),[recMsg,setRecMsg]=useState(""),[elevMsg,setElevMsg]=useState("");'

$new = 'const [authBusy,setAuthBusy]=useState(false),[pwBusy,setPwBusy]=useState(false),[pinBusy,setPinBusy]=useState(false),[elevBusy,setElevBusy]=useState(false),[recBusy,setRecBusy]=useState(false),[authMsg,setAuthMsg]=useState(null),[pwErr,setPwErr]=useState(""),[pwMsg,setPwMsg]=useState(""),[pinErr,setPinErr]=useState(""),[pinMsg,setPinMsg]=useState(""),[recMsg,setRecMsg]=useState(""),[elevMsg,setElevMsg]=useState("");'

if (!$text.Contains($old)) {
    throw "Expected credential state declaration was not found. No changes made."
}

$text = $text.Replace($old,$new)

Write-Host ""
Write-Host "[4/7] Isolating Elevate / Password / PIN / Recovery busy states..."

$text = $text.Replace(
    'const elevate=async()=>{if(authBusy)return;setElevMsg("");setAuthBusy(true);',
    'const elevate=async()=>{if(elevBusy)return;setElevMsg("");setElevBusy(true);'
)

$text = $text.Replace(
    'setAuthBusy(false);setElevMsg(''✓ Session elevated — PIN verified successfully.'');',
    'setElevBusy(false);setElevMsg(''✓ Session elevated — PIN verified successfully.'');'
)

$text = $text.Replace(
    'setAuthBusy(false);setElevMsg(e.message||''Elevation failed.'');',
    'setElevBusy(false);setElevMsg(e.message||''Elevation failed.'');'
)

$text = $text.Replace(
    'const changePasswordUI=async()=>{if(authBusy)return;',
    'const changePasswordUI=async()=>{if(pwBusy)return;'
)

$text = $text.Replace(
    'setPwErr("");setPwMsg("");setAuthBusy(true);',
    'setPwErr("");setPwMsg("");setPwBusy(true);'
)

$text = $text.Replace(
    'setAuthBusy(false);setPwMsg(',
    'setPwBusy(false);setPwMsg('
)

$text = $text.Replace(
    'setAuthBusy(false);setPwErr(',
    'setPwBusy(false);setPwErr('
)

$text = $text.Replace(
    'const changePinUI=async()=>{if(authBusy)return;',
    'const changePinUI=async()=>{if(pinBusy)return;'
)

$text = $text.Replace(
    'setPinErr("");setPinMsg("");setAuthBusy(true);',
    'setPinErr("");setPinMsg("");setPinBusy(true);'
)

$text = $text.Replace(
    'setAuthBusy(false);setPinMsg(',
    'setPinBusy(false);setPinMsg('
)

$text = $text.Replace(
    'setAuthBusy(false);setPinErr(',
    'setPinBusy(false);setPinErr('
)

$text = $text.Replace(
    'const rotateCodes=async()=>{if(authBusy)return;',
    'const rotateCodes=async()=>{if(recBusy)return;'
)

$text = $text.Replace(
    'setRecMsg('''');setAuthBusy(true);',
    'setRecMsg('''');setRecBusy(true);'
)

$text = $text.Replace(
    'setAuthBusy(false);setRecMsg(',
    'setRecBusy(false);setRecMsg('
)

Write-Host ""
Write-Host "[5/7] Making credential action buttons explicitly non-submit..."

$text = $text.Replace(
    "h('button',{onClick:changePasswordUI,disabled:authBusy},'Update Password')",
    "h('button',{type:'button',onClick:changePasswordUI,disabled:pwBusy},pwBusy?'Updating…':'Update Password')"
)

$text = $text.Replace(
    "h('button',{onClick:changePinUI,disabled:authBusy},'Update Authorization PIN')",
    "h('button',{type:'button',onClick:changePinUI,disabled:pinBusy},pinBusy?'Updating…':'Update Authorization PIN')"
)

$text = $text.Replace(
    "h('button',{onClick:elevate,disabled:authBusy},'Elevate Session by PIN')",
    "h('button',{type:'button',onClick:elevate,disabled:elevBusy},elevBusy?'Verifying…':'Elevate Session by PIN')"
)

$text = $text.Replace(
    "h('button',{onClick:rotateCodes,disabled:authBusy},'Generate Recovery Codes')",
    "h('button',{type:'button',onClick:rotateCodes,disabled:recBusy},recBusy?'Generating…':'Generate Recovery Codes')"
)

Write-Host ""
Write-Host "[6/7] Checking that the expected isolation changes actually landed..."

$checks = @(
    "pwBusy",
    "pinBusy",
    "elevBusy",
    "recBusy",
    "type:'button',onClick:changePasswordUI",
    "type:'button',onClick:changePinUI",
    "type:'button',onClick:elevate",
    "type:'button',onClick:rotateCodes"
)

foreach ($check in $checks) {
    if (!$text.Contains($check)) {
        throw "Verification failed: missing expected repair marker: $check"
    }
    Write-Host "PASS: $check"
}

Set-Content $file $text -NoNewline -Encoding UTF8

Write-Host ""
Write-Host "[7/7] Showing source diff..."
git diff -- public/index.html

Write-Host ""
Write-Host "============================================================"
Write-Host "REPAIR FILE WRITTEN"
Write-Host "============================================================"
Write-Host "Backup: $backup"
Write-Host ""

Write-Host "Running frontend syntax extraction/check..."

node -e @"
const fs=require('fs');
const s=fs.readFileSync('public/index.html','utf8');
const m=s.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
if(!m) throw new Error('No script found in public/index.html');
fs.writeFileSync('.ade-security-js-check.js',m[1]);
"@

node --check .ade-security-js-check.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SYNTAX CHECK FAILED — RESTORING BACKUP"
    Copy-Item $backup $file -Force
    Remove-Item .ade-security-js-check.js -ErrorAction SilentlyContinue
    throw "Repair rolled back because frontend JavaScript syntax failed."
}

Remove-Item .ade-security-js-check.js -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "============================================================"
Write-Host "SUCCESS: SECURITY ACTION ISOLATION PATCH PASSED SYNTAX CHECK"
Write-Host "============================================================"
Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "1. Do NOT push yet."
Write-Host "2. Do NOT change password/PIN yet."
Write-Host "3. Paste the complete output here."
Write-Host "4. We will inspect the diff, then deploy and test immediately."
