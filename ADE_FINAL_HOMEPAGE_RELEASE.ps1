# ============================================================
# ADE — FINAL HOMEPAGE RECONCILIATION
# BOUNDED / NO OPENCODE / NO PROCESS MANAGEMENT
# ============================================================

$ErrorActionPreference = "Stop"

$repo = (Get-Location).Path
$file = Join-Path $repo "public\index.html"

Write-Host ""
Write-Host "============================================================"
Write-Host " ADE — FINAL HOMEPAGE RECONCILIATION"
Write-Host "============================================================"

# ------------------------------------------------------------
# 1. SAFETY GATE
# ------------------------------------------------------------

if (-not (Test-Path $file)) {
    throw "STOP: public/index.html not found."
}

$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()

Write-Host "Branch: $branch"
Write-Host "HEAD  : $head"

if ($branch -ne "main") {
    throw "STOP: branch is not main."
}

if ($head -ne "ad0dfc6d9e507bc382318f9747550b8b7287de50") {
    throw "STOP: expected ADE homepage checkpoint ad0dfc6 is not HEAD."
}

Write-Host ""
Write-Host "Existing working-tree changes will be preserved."
git status --short

# ------------------------------------------------------------
# 2. BACKUP ONLY THE TARGET HOMEPAGE FILE
# ------------------------------------------------------------

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $repo "public\index.html.before-final-ui-$stamp.bak"

Copy-Item $file $backup -Force

Write-Host ""
Write-Host "Homepage backup:"
Write-Host $backup

# ------------------------------------------------------------
# 3. READ CURRENT HOMEPAGE — NO OPENCODE
# ------------------------------------------------------------

$html = Get-Content $file -Raw

if ([string]::IsNullOrWhiteSpace($html)) {
    throw "STOP: public/index.html is empty."
}

Write-Host ""
Write-Host "Homepage size: $($html.Length) characters"

# ------------------------------------------------------------
# 4. ADD A PRECISE FINAL PRESENTATION LAYER
# ------------------------------------------------------------

$marker = '<style id="ADE_HOMEPAGE_FINAL_RECONCILIATION">'

if ($html.Contains($marker)) {
    Write-Host "[INFO] Final reconciliation CSS already exists; replacing only that block."
    $pattern = '(?s)<style id="ADE_HOMEPAGE_FINAL_RECONCILIATION">.*?</style>'
    $html = [regex]::Replace($html, $pattern, '')
}

$css = @'
<style id="ADE_HOMEPAGE_FINAL_RECONCILIATION">
/* ADE FINAL HOMEPAGE PRESENTATION RECONCILIATION */

.ade-home-responsive {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.ade-home-responsive .ade-header-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 14px;
  min-width: 0;
}

.ade-home-responsive .ade-header-nav a,
.ade-home-responsive .ade-header-nav button {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  min-width: max-content;
}

.ade-home-responsive .ade-identity {
  width: min(100%, 1000px);
  margin-left: auto;
  margin-right: auto;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}

.ade-home-responsive .ade-rotating-text {
  width: min(100%, 900px);
  margin-left: auto;
  margin-right: auto;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.45;
  font-size: clamp(18px, 2vw, 28px);
}

.ade-home-responsive .ade-architecture-stack {
  gap: 10px !important;
}

.ade-home-responsive .ade-pilot-cta {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding: 12px 18px;
  font-size: clamp(16px, 1.5vw, 22px);
  font-weight: 800;
  line-height: 1.35;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
}

@media (max-width: 1024px) {
  .ade-home-responsive .ade-header-nav {
    gap: 7px 11px;
  }

  .ade-home-responsive .ade-identity {
    padding-left: 20px;
    padding-right: 20px;
  }
}

@media (max-width: 768px) {
  .ade-home-responsive .ade-header-nav {
    gap: 6px 9px;
  }

  .ade-home-responsive .ade-header-nav a,
  .ade-home-responsive .ade-header-nav button {
    font-size: 14px;
  }

  .ade-home-responsive .ade-rotating-text {
    font-size: 19px;
    line-height: 1.45;
  }

  .ade-home-responsive .ade-architecture-stack {
    gap: 8px !important;
  }
}

@media (max-width: 480px) {
  .ade-home-responsive .ade-header-nav {
    width: 100%;
    gap: 5px 7px;
  }

  .ade-home-responsive .ade-header-nav a,
  .ade-home-responsive .ade-header-nav button {
    font-size: 13px;
  }

  .ade-home-responsive .ade-identity {
    padding-left: 12px;
    padding-right: 12px;
  }

  .ade-home-responsive .ade-rotating-text {
    width: calc(100% - 24px);
    font-size: 18px;
    line-height: 1.4;
  }

  .ade-home-responsive .ade-pilot-cta {
    width: calc(100% - 24px);
    font-size: 16px;
  }
}
</style>
'@

# Insert final CSS immediately before </head>.
if (-not $html.Contains("</head>")) {
    throw "STOP: </head> anchor not found."
}

$html = $html.Replace("</head>", "$css`r`n</head>")

# ------------------------------------------------------------
# 5. APPLY ONLY SAFE, EXACT PRESENTATION HOOKS
# ------------------------------------------------------------

# Root hook.
if ($html.Contains('<div id="root">')) {
    $html = $html.Replace(
        '<div id="root">',
        '<div id="root" class="ade-home-responsive">'
    )
}
elseif (-not $html.Contains('id="root" class="ade-home-responsive"')) {
    throw "STOP: React root could not be located safely."
}

# Existing generic nav class gets a dedicated hook.
$html = $html.Replace(
    "className:'nav'",
    "className:'nav ade-header-nav'"
)

# Existing architecture stack gets a dedicated hook.
$html = $html.Replace(
    "className:'stack'",
    "className:'stack ade-architecture-stack'"
)

# ------------------------------------------------------------
# 6. PRECISE TEXT-BASED HOOKS
# ------------------------------------------------------------

$ctaText = "REGISTER YOUR INTEREST TO PROGRESS TO PILOT OR ENTERPRISE NOW"

# Replace only visible occurrences of the old CTA text.
$html = $html.Replace(
    "Community · Pilot · Partner",
    $ctaText
)

$html = $html.Replace(
    "Community &middot; Pilot &middot; Partner",
    $ctaText
)

# Add CTA class to rendered elements containing the exact CTA.
$html = $html.Replace(
    "h('b',null,'$ctaText')",
    "h('b',{className:'ade-pilot-cta'},'$ctaText')"
)

$html = $html.Replace(
    "h('span',null,'$ctaText')",
    "h('span',{className:'ade-pilot-cta'},'$ctaText')"
)

# ------------------------------------------------------------
# 7. DO NOT GUESS AT UNKNOWN SOURCE BLOCKS
# ------------------------------------------------------------

# We deliberately do NOT perform broad deletion of:
# Operations Layer / Decision / Workflow / Knowledge / Quality /
# Confidence / Media Engine.
#
# The prior forensic run established that the exact enclosing
# source block was not safely identifiable.
#
# Therefore this command refuses to delete arbitrary matching
# strings and protects ADE internals.

Write-Host ""
Write-Host "[SAFE] No broad Operations Layer deletion performed."

# ------------------------------------------------------------
# 8. WRITE ONLY IF ACTUALLY CHANGED
# ------------------------------------------------------------

$original = Get-Content $file -Raw

if ($html -eq $original) {
    Write-Host "[INFO] No source change required."
}
else {
    Set-Content -Path $file -Value $html -Encoding UTF8
    Write-Host "[PASS] public/index.html updated."
}

# ------------------------------------------------------------
# 9. VALIDATION
# ------------------------------------------------------------

Write-Host ""
Write-Host "=== JAVASCRIPT / HTML VALIDATION ==="

# public/index.html contains HTML, so validate the embedded JS
# through the existing project validation/build chain rather than
# incorrectly treating the entire HTML document as JavaScript.

npm run validate
if ($LASTEXITCODE -ne 0) {
    Copy-Item $backup $file -Force
    throw "STOP: npm run validate failed. Homepage restored."
}

npm run build:community
if ($LASTEXITCODE -ne 0) {
    Copy-Item $backup $file -Force
    throw "STOP: community build failed. Homepage restored."
}

Write-Host "[PASS] Validation and build."

# ------------------------------------------------------------
# 10. SHOW EXACT DIFF
# ------------------------------------------------------------

Write-Host ""
Write-Host "=== HOMEPAGE DIFF ==="
git diff -- public/index.html

# ------------------------------------------------------------
# 11. STAGE ONLY HOMEPAGE
# ------------------------------------------------------------

git add -- public/index.html

$staged = @(git diff --cached --name-only)

Write-Host ""
Write-Host "=== STAGED FILES ==="
$staged

if ($staged.Count -ne 1 -or $staged[0] -ne "public/index.html") {
    git reset
    Copy-Item $backup $file -Force
    throw "STOP: staged files exceeded public/index.html. Homepage restored."
}

# ------------------------------------------------------------
# 12. COMMIT
# ------------------------------------------------------------

git commit -m "fix(ui): finalize ADE homepage responsive presentation"

if ($LASTEXITCODE -ne 0) {
    throw "STOP: commit failed."
}

$newHead = (git rev-parse HEAD).Trim()

Write-Host ""
Write-Host "New commit: $newHead"

# ------------------------------------------------------------
# 13. PUSH
# ------------------------------------------------------------

git push origin main

if ($LASTEXITCODE -ne 0) {
    throw "STOP: git push failed."
}

# ------------------------------------------------------------
# 14. PRODUCTION DEPLOYMENT
# ------------------------------------------------------------

Write-Host ""
Write-Host "=== VERCEL PRODUCTION DEPLOYMENT ==="

$deploy = @(
    vercel --prod --yes `
        --scope team_F8GGTy1TjByxVjuLK9ODjCYA 2>&1
)

$deploy | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) {
    throw "STOP: Vercel production deployment failed."
}

# ------------------------------------------------------------
# 15. PRODUCTION HEALTH
# ------------------------------------------------------------

$canonical = "https://ade-apex-community.vercel.app"
$healthUrl = "$canonical/api/v1/health"

Write-Host ""
Write-Host "=== PRODUCTION HEALTH ==="

$health = $null

for ($i = 1; $i -le 12; $i++) {
    try {
        $health = Invoke-WebRequest `
            -Uri $healthUrl `
            -UseBasicParsing `
            -TimeoutSec 15

        if ($health.StatusCode -eq 200) {
            break
        }
    }
    catch {
        Start-Sleep -Seconds 3
    }
}

if (-not $health -or $health.StatusCode -ne 200) {
    throw "STOP: production health did not return HTTP 200."
}

Write-Host $health.Content

if ($health.Content -notmatch '"status"\s*:\s*"OK"') {
    throw "STOP: production status is not OK."
}

if ($health.Content -notmatch '"status"\s*:\s*"HEALTHY"') {
    throw "STOP: production kernel is not HEALTHY."
}

if ($health.Content -notmatch '"subsystemCount"\s*:\s*9') {
    throw "STOP: expected 9 canonical subsystems."
}

# ------------------------------------------------------------
# 16. PRODUCTION HOMEPAGE
# ------------------------------------------------------------

Write-Host ""
Write-Host "=== PRODUCTION HOMEPAGE ==="

$resp = Invoke-WebRequest `
    -Uri "$canonical/" `
    -UseBasicParsing `
    -TimeoutSec 30

Write-Host "HTTP: $($resp.StatusCode)"
Write-Host "Length: $($resp.Content.Length)"

if ($resp.StatusCode -ne 200) {
    throw "STOP: production homepage HTTP status is not 200."
}

if ($resp.Content.Length -lt 10000) {
    throw "STOP: production homepage response is unexpectedly small."
}

$checks = @(
    @{ Name="ADE identity"; Pattern="AUTOMATED ALPHA ALIPH" },
    @{ Name="Responsive reconciliation"; Pattern="ADE_HOMEPAGE_FINAL_RECONCILIATION" },
    @{ Name="React root"; Pattern='id="root"' },
    @{ Name="Pilot CTA"; Pattern="REGISTER YOUR INTEREST TO PROGRESS TO PILOT OR ENTERPRISE NOW" },
    @{ Name="ADE value"; Pattern="One canonical runtime" }
)

foreach ($check in $checks) {
    if ($resp.Content -match $check.Pattern) {
        Write-Host "[PASS] $($check.Name)"
    }
    else {
        throw "STOP: production homepage missing $($check.Name)."
    }
}

# ------------------------------------------------------------
# 17. FINAL GIT SAFETY
# ------------------------------------------------------------

Write-Host ""
Write-Host "=== FINAL GIT SAFETY ==="

Write-Host "HEAD:"
git rev-parse HEAD

Write-Host ""
Write-Host "Working tree:"
git status --short

Write-Host ""
Write-Host "============================================================"
Write-Host " ADE HOMEPAGE RELEASE FINISHED"
Write-Host "============================================================"
Write-Host "Production : $canonical"
Write-Host "Commit     : $newHead"
Write-Host "Validation : PASS"
Write-Host "Build      : PASS"
Write-Host "Push       : PASS"
Write-Host "Deploy     : PASS"
Write-Host "Health     : HTTP 200 / KERNEL HEALTHY / 9 SUBSYSTEMS"
Write-Host "Homepage   : HTTP 200 / CONTENT VERIFIED"
Write-Host "============================================================"
