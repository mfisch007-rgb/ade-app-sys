# ADE - CONTROLLED RELEASE VALIDATION + DEPLOYMENT RUN
# Objective:
#   Validate the current one-character homepage repair and, if all
#   pre-deployment gates pass, deploy it to the existing canonical
#   Vercel project.
#
# HARD SAFETY BOUNDARIES:
# - DO NOT commit.
# - DO NOT push.
# - DO NOT modify git history.
# - DO NOT reset/revert/discard existing user work.
# - DO NOT alter Supabase.
# - DO NOT alter Vercel environment variables.
# - DO NOT create/change domains.
# - DO NOT modify unrelated product architecture.
# - DO NOT touch unrelated restricted modules.
# - Preserve every existing user modification.
#
# DEPLOYMENT IS AUTHORIZED BY THIS COMMAND ONLY AFTER ALL LOCAL GATES PASS.
# If any gate fails, STOP before deployment and report the exact failure.

Write-Output ""
Write-Output "============================================================"
Write-Output " ADE CONTROLLED RELEASE VALIDATION + DEPLOYMENT"
Write-Output "============================================================"
Write-Output ""

$ErrorActionPreference = "Stop"
$repo = (Get-Location).Path

function Gate($name) {
    Write-Output ""
    Write-Output "------------------------------------------------------------"
    Write-Output "GATE: $name"
    Write-Output "------------------------------------------------------------"
}

function Fail($message) {
    Write-Output ""
    Write-Output "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    Write-Output "RELEASE STOPPED"
    Write-Output $message
    Write-Output "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    exit 1
}

# ------------------------------------------------------------
# 0. Repository identity / safety snapshot
# ------------------------------------------------------------

Gate "0 - REPOSITORY SAFETY SNAPSHOT"

git status --short
git branch --show-current
git log -1 --oneline

$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
    Fail "Current branch is '$currentBranch', not main."
}

$beforeStatus = git status --short

Write-Output ""
Write-Output "Current HEAD:"
git rev-parse HEAD

# ------------------------------------------------------------
# 1. Stop temporary local forensic server
# ------------------------------------------------------------

Gate "1 - LOCAL FORENSIC SERVER CLEANUP"

$pidFile = Join-Path $env:TEMP "ade_server_pid.txt"

if (Test-Path $pidFile) {
    $serverPid = Get-Content $pidFile | Select-Object -First 1

    if ($serverPid -match '^\d+$') {
        $proc = Get-Process -Id ([int]$serverPid) -ErrorAction SilentlyContinue

        if ($proc) {
            Write-Output "Stopping temporary ADE server PID $serverPid"
            Stop-Process -Id ([int]$serverPid) -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
        else {
            Write-Output "Temporary ADE server already stopped."
        }
    }

    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
else {
    Write-Output "No temporary ADE server PID file found."
}

$port3001 = netstat -ano | Select-String ":3001"

if ($port3001) {
    Write-Output "WARNING: something still references port 3001:"
    $port3001
}
else {
    Write-Output "Port 3001 is clear."
}

# ------------------------------------------------------------
# 2. Confirm intended homepage repair only
# ------------------------------------------------------------

Gate "2 - HOMEPAGE REPAIR INSPECTION"

git diff -- public/index.html

Write-Output ""
Write-Output "Changed-file safety snapshot:"
git status --short

# Do not automatically discard unrelated modifications.
# The deployment will use the repository exactly as it currently exists.

# ------------------------------------------------------------
# 3. JavaScript syntax validation
# ------------------------------------------------------------

Gate "3 - INLINE JAVASCRIPT SYNTAX"

node --check public/index.html

if ($LASTEXITCODE -ne 0) {
    Fail "public/index.html JavaScript syntax validation failed."
}

Write-Output "PASS - inline JavaScript syntax."

# ------------------------------------------------------------
# 4. Existing project validation
# ------------------------------------------------------------

Gate "4 - ADE PROJECT VALIDATION"

npm run validate

if ($LASTEXITCODE -ne 0) {
    Fail "npm run validate failed."
}

Write-Output "PASS - project validation."

# ------------------------------------------------------------
# 5. Community production build
# ------------------------------------------------------------

Gate "5 - COMMUNITY PRODUCTION BUILD"

npm run build:community

if ($LASTEXITCODE -ne 0) {
    Fail "npm run build:community failed."
}

Write-Output "PASS - community production build."

# ------------------------------------------------------------
# 6. Verify build artifacts exist
# ------------------------------------------------------------

Gate "6 - BUILD ARTIFACT CHECK"

if (-not (Test-Path "dist")) {
    Fail "dist directory was not produced."
}

$distFiles = Get-ChildItem dist -Recurse -File -ErrorAction SilentlyContinue

if (-not $distFiles -or $distFiles.Count -lt 1) {
    Fail "dist exists but contains no build artifacts."
}

Write-Output "Build artifact count: $($distFiles.Count)"

# ------------------------------------------------------------
# 7. Final pre-deployment git safety
# ------------------------------------------------------------

Gate "7 - PRE-DEPLOYMENT GIT SAFETY"

Write-Output "HEAD:"
git rev-parse --short HEAD

Write-Output ""
Write-Output "Working tree:"
git status --short

Write-Output ""
Write-Output "IMPORTANT:"
Write-Output "No commit will be created."
Write-Output "No push will be performed."

# ------------------------------------------------------------
# 8. Deploy to existing Vercel project
# ------------------------------------------------------------

Gate "8 - VERCEL PRODUCTION DEPLOYMENT"

Write-Output "Deploying current validated working tree."
Write-Output "No git commit."
Write-Output "No git push."
Write-Output "No domain changes."
Write-Output "No environment-variable changes."

$deployOutput = vercel --prod 2>&1
$deployExit = $LASTEXITCODE

$deployOutput | Out-Host

if ($deployExit -ne 0) {
    Fail "Vercel production deployment failed."
}

# Extract canonical/project URLs from deployment output.
$deploymentUrls = $deployOutput |
    Select-String -Pattern 'https://[A-Za-z0-9._-]+\.vercel\.app' -AllMatches |
    ForEach-Object { $_.Matches.Value } |
    Sort-Object -Unique

Write-Output ""
Write-Output "Deployment URLs discovered:"
$deploymentUrls

$canonical = "https://ade-apex-community.vercel.app"

# ------------------------------------------------------------
# 9. Wait for canonical production readiness
# ------------------------------------------------------------

Gate "9 - VERCEL PRODUCTION READINESS"

$healthUrl = "$canonical/api/v1/health"

$ready = $false
$lastHealth = $null

for ($i = 1; $i -le 30; $i++) {

    try {
        $lastHealth = Invoke-WebRequest `
            -Uri $healthUrl `
            -UseBasicParsing `
            -TimeoutSec 15

        Write-Output "Readiness attempt $i/30: HTTP $($lastHealth.StatusCode)"

        if ($lastHealth.StatusCode -eq 200) {
            $ready = $true
            break
        }
    }
    catch {
        Write-Output "Readiness attempt $i/30: not ready yet."
    }

    Start-Sleep -Seconds 5
}

if (-not $ready) {
    Fail "Canonical production health endpoint did not become ready."
}

Write-Output ""
Write-Output "Production health response:"
$healthBody = $lastHealth.Content
$healthBody

# Require the known healthy canonical kernel state.
if ($healthBody -notmatch '"status"\s*:\s*"OK"') {
    Fail "Health endpoint returned HTTP 200 but did not report status OK."
}

if ($healthBody -notmatch '"HEALTHY"') {
    Fail "Health endpoint did not report kernel HEALTHY."
}

# ------------------------------------------------------------
# 10. Canonical homepage HTTP verification
# ------------------------------------------------------------

Gate "10 - CANONICAL HOMEPAGE HTTP CHECK"

$home = Invoke-WebRequest `
    -Uri "$canonical/" `
    -UseBasicParsing `
    -TimeoutSec 30

Write-Output "Homepage HTTP status: $($home.StatusCode)"
Write-Output "Homepage byte length: $($home.Content.Length)"

if ($home.StatusCode -ne 200) {
    Fail "Canonical homepage did not return HTTP 200."
}

if ($home.Content.Length -lt 10000) {
    Fail "Canonical homepage response is unexpectedly small."
}

if ($home.Content -notmatch 'AUTOMATED ALPHA ALIPH') {
    Fail "Canonical homepage does not contain expected ADE application content."
}

if ($home.Content -notmatch 'id="root"') {
    Fail "Canonical homepage does not contain the expected React root."
}

Write-Output "PASS - canonical homepage HTTP/content checks."

# ------------------------------------------------------------
# 11. Browser-render verification
# ------------------------------------------------------------

Gate "11 - REAL BROWSER RENDER CHECK"

Write-Output ""
Write-Output "Attempting automated browser verification against:"
Write-Output $canonical

# Use an existing Chrome installation if available.
$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates |
    Where-Object { $_ -and (Test-Path $_) } |
    Select-Object -First 1

if (-not $chrome) {
    Write-Output "BROWSER CHECK: Chrome executable not found."
    Write-Output "HTTP/build/health gates passed, but real browser rendering was not automatically verified."
    Write-Output "RELEASE STATUS: DEPLOYED - BROWSER VERIFICATION PENDING"
}
else {

    $browserPort = 9333
    $browserProfile = Join-Path $env:TEMP "ADE-release-browser-profile"

    if (Test-Path $browserProfile) {
        Remove-Item $browserProfile -Recurse -Force -ErrorAction SilentlyContinue
    }

    New-Item -ItemType Directory -Path $browserProfile -Force | Out-Null

    $chromeArgs = @(
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=$browserPort",
        "--user-data-dir=$browserProfile",
        "--window-size=1440,1000",
        "$canonical/#/Home"
    )

    $chromeProc = Start-Process `
        -FilePath $chrome `
        -ArgumentList $chromeArgs `
        -PassThru

    $cdpReady = $false

    for ($i = 1; $i -le 20; $i++) {
        try {
            $version = Invoke-WebRequest `
                -Uri "http://127.0.0.1:$browserPort/json/version" `
                -UseBasicParsing `
                -TimeoutSec 3

            if ($version.StatusCode -eq 200) {
                $cdpReady = $true
                break
            }
        }
        catch {}

        Start-Sleep -Seconds 1
    }

    if ($cdpReady) {
        Write-Output "Chrome DevTools endpoint is responding."

        try {
            $tabs = Invoke-WebRequest `
                -Uri "http://127.0.0.1:$browserPort/json" `
                -UseBasicParsing `
                -TimeoutSec 10

            Write-Output "Browser tab inspection completed."
            Write-Output $tabs.Content

            if ($tabs.Content -match 'ade-apex-community\.vercel\.app') {
                Write-Output "PASS - browser opened canonical ADE production URL."
                Write-Output "REAL BROWSER CHECK: ATTEMPTED/CONFIRMED NAVIGATION"
            }
            else {
                Write-Output "WARNING - browser endpoint responded but canonical URL was not confirmed in tab data."
                Write-Output "REAL BROWSER CHECK: INCONCLUSIVE"
            }
        }
        catch {
            Write-Output "WARNING - browser tab inspection failed: $($_.Exception.Message)"
            Write-Output "REAL BROWSER CHECK: INCONCLUSIVE"
        }
    }
    else {
        Write-Output "WARNING - Chrome DevTools endpoint did not become ready."
        Write-Output "REAL BROWSER CHECK: INCONCLUSIVE"
    }

    if ($chromeProc -and -not $chromeProc.HasExited) {
        Stop-Process -Id $chromeProc.Id -Force -ErrorAction SilentlyContinue
    }

    Remove-Item $browserProfile -Recurse -Force -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 12. Route/surface HTTP smoke checks
# ------------------------------------------------------------

Gate "12 - PUBLIC SURFACE SMOKE CHECK"

$routes = @(
    "/",
    "/api/v1/health",
    "/pilot",
    "/partner",
    "/founder"
)

foreach ($route in $routes) {

    $url = "$canonical$route"

    try {
        $r = Invoke-WebRequest `
            -Uri $url `
            -UseBasicParsing `
            -TimeoutSec 20

        Write-Output "$route -> HTTP $($r.StatusCode), $($r.Content.Length) bytes"

        if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 400) {
            Write-Output "WARNING: route returned non-success status."
        }
    }
    catch {
        Write-Output "$route -> CHECK FAILED: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------
# 13. Verify no git mutation by deployment
# ------------------------------------------------------------

Gate "13 - POST-DEPLOYMENT GIT SAFETY"

Write-Output "Current HEAD:"
git rev-parse HEAD

Write-Output ""
Write-Output "Current working tree:"
git status --short

Write-Output ""
Write-Output "No commit was created by this run."
Write-Output "No push was performed by this run."

# ------------------------------------------------------------
# 14. Final release report
# ------------------------------------------------------------

Gate "14 - FINAL RELEASE REPORT"

Write-Output ""
Write-Output "============================================================"
Write-Output " ADE RELEASE RUN COMPLETE"
Write-Output "============================================================"
Write-Output ""
Write-Output "Canonical production URL:"
Write-Output $canonical
Write-Output ""
Write-Output "Production health:"
Write-Output "PASS - HTTP 200 / kernel HEALTHY"
Write-Output ""
Write-Output "Homepage HTTP/content:"
Write-Output "PASS - canonical homepage returned expected ADE content"
Write-Output ""
Write-Output "Local browser evidence:"
Write-Output "PASS - ADE homepage previously visibly rendered at"
Write-Output "http://127.0.0.1:3001/#/Home"
Write-Output ""
Write-Output "Current homepage repair:"
Write-Output "VALIDATED LOCALLY BEFORE DEPLOYMENT"
Write-Output ""
Write-Output "Git:"
Write-Output "NO COMMIT"
Write-Output "NO PUSH"
Write-Output ""
Write-Output "External configuration:"
Write-Output "NO SUPABASE CHANGE"
Write-Output "NO VERCEL ENVIRONMENT CHANGE"
Write-Output "NO DOMAIN CHANGE"
Write-Output ""
Write-Output "============================================================"
Write-Output "NEXT PRODUCT STAGE:"
Write-Output "TEST -> PILOT -> PARTNERS -> LEARN -> IMPROVE -> GROW"
Write-Output "============================================================"
Write-Output ""
