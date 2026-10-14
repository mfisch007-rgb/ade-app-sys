$ErrorActionPreference = "Stop"

Write-Output ""
Write-Output "============================================================"
Write-Output " ADE HOMEPAGE UI RECONCILIATION"
Write-Output "============================================================"

Write-Output ""
Write-Output "=== 1. GIT SAFETY SNAPSHOT ==="
git status --short
git branch --show-current
git log -1 --oneline

if ((git branch --show-current) -ne "main") {
    throw "STOP: current branch is not main."
}

$beforeHead = git rev-parse HEAD

Write-Output ""
Write-Output "=== 2. OPEN CODE — UI-ONLY RECONCILIATION ==="

opencode run @"
ADE HOMEPAGE UI RECONCILIATION.

Work ONLY on the public homepage presentation in:
public/index.html

Do not redesign the application.
Do not rewrite the kernel.
Do not change backend/API behavior.
Do not change authentication.
Do not change Supabase.
Do not change Vercel configuration.
Do not change domains.
Do not touch unrelated modules.
Do not modify trading, broker, market-signal, gaming, sports, binary, or related areas.
Do not delete internal capabilities.

Preserve all current functionality and existing structure.

MAKE ONLY THESE REQUESTED UI CHANGES:

1. TOP HEADER / NAVIGATION

Keep all existing header elements in their current general positions.

Make the complete text readable and prevent clipping/truncation.

The following navigation labels must visibly render completely:

Home
Products
PROCARTA
Product Theater
Try ADE
Architecture
Community
Feedback
Account

Do not allow:
"tecture"
"Communit..."
"Feed..."
"Acc..."

Use responsive wrapping/flexible sizing where required.

2. ADE IDENTITY BLOCK

Keep the existing identity area in its current general position.

Make the complete identity readable:

"AUTOMATED ALPHA ALIPH DIGITAL ECOSYSTEMS (ADE)"

and:

"Building African Digital Business Operational Systems
& African Businesses' Backbone"

Allow wrapping rather than clipping.

3. ROTATING / AUTO-CHANGING TEXT

Keep this content in its CURRENT POSITION.

Examples include:

"Find the bottleneck in our customer operations."
"Simulate a customer complaint workflow."
"Why has operational performance declined?"
"Assess this business process."
"Recommend an automation opportunity."

Do NOT move the component.

Only improve its readability:
- larger readable font
- adequate line-height
- sufficient width
- wrapping allowed
- no clipping
- no horizontal overflow
- maintain its current visual concept and automatic changing behavior.

4. ARCHITECTURE AT A GLANCE

Keep the section.

Reduce excessive vertical spacing between:

ADE USERS
↓
ADE EXPERIENCE LAYER
↓

The elements should remain visually connected and compact.

Do not redesign the architecture illustration.

5. REMOVE OPERATIONS LAYER FROM HOMEPAGE DISPLAY ONLY

Do NOT delete the underlying code/capabilities.

Hide/remove ONLY this front-page presentation block:

OPERATIONS LAYER
Decision
Workflow
Knowledge
Quality
Confidence
Media Engine
↓

It must no longer appear on the public homepage.

6. PILOT / ENTERPRISE CTA

Remove ONLY this displayed heading:

"Community · Pilot · Partner"

Replace it with a prominent readable CTA:

"REGISTER YOUR INTEREST TO PROGRESS TO PILOT OR ENTERPRISE NOW"

Make it:
- bold
- larger
- clearly clickable
- visually prominent
- responsive

Connect it to the existing appropriate intake/pilot form route.
Prefer the existing intake/pilot destination rather than inventing a new backend.

Do not create a new authentication system.

7. FOOTER IDENTITY RELOCATION

Remove this identity block ONLY from the footer:

"AUTOMATED ALPHA ALIPH DIGITAL ECOSYSTEMS
BUILDING AFRICAN DIGITAL BUSINESS OPERATIONAL SYSTEMS & AFRICAN BUSINESSES' BACKBONE
ADE"

Place the identity near the existing:

"Kernel online
COMMUNITY EDITION
SECURE
ADE"

area as requested.

Do not duplicate the identity in multiple places.

8. PRESERVE THIS SECTION

Do NOT remove or alter:

"The ADE value

One canonical runtime, product-ready surfaces, and honest boundaries — nothing on this site is fabricated."

9. RESPONSIVE REQUIREMENT

The resulting homepage must remain readable at:

- small Android phone widths
- iPhone widths
- tablet widths
- laptop widths
- desktop widths

Use the existing CSS/design system where possible.

Use responsive rules rather than hard-coded viewport-specific hacks.

Prevent:
- clipped text
- overlapping navigation
- horizontal page overflow
- tiny unreadable text
- broken buttons
- broken cards
- broken hero layout

10. DO NOT CHANGE THE PRODUCT CONTENT

Do not rewrite marketing copy except for the exact text relocation/replacement explicitly requested above.

11. AFTER EDITING

Run:

node --check public/index.html
npm run validate
npm run build:community

If any validation fails, fix ONLY the relevant UI syntax/build issue and rerun validation.

Then show:

git diff -- public/index.html
git status --short

STOP before committing if validation is not green.

Do not commit anything other than the intended homepage UI reconciliation.
"@

Write-Output ""
Write-Output "=== 3. POST-EDIT VALIDATION ==="

node --check public/index.html
if ($LASTEXITCODE -ne 0) {
    throw "STOP: homepage JavaScript syntax failed."
}

npm run validate
if ($LASTEXITCODE -ne 0) {
    throw "STOP: npm run validate failed."
}

npm run build:community
if ($LASTEXITCODE -ne 0) {
    throw "STOP: community build failed."
}

Write-Output ""
Write-Output "=== 4. INSPECT HOMEPAGE DIFF ==="
git diff -- public/index.html

Write-Output ""
Write-Output "=== 5. GIT STATUS ==="
git status --short

Write-Output ""
Write-Output "=== 6. COMMIT ONLY HOMEPAGE UI FILE ==="

git add public/index.html

git diff --cached --name-only

$staged = git diff --cached --name-only

if (($staged.Count -ne 1) -or ($staged -ne "public/index.html")) {
    git reset
    throw "STOP: staged files are not limited to public/index.html."
}

git commit -m "fix(ui): reconcile responsive ADE homepage layout"

if ($LASTEXITCODE -ne 0) {
    throw "STOP: commit failed."
}

Write-Output ""
Write-Output "=== 7. COMMIT CONFIRMATION ==="
git log -1 --oneline
git status --short

Write-Output ""
Write-Output "=== 8. PRODUCTION DEPLOYMENT ==="

$deployOutput = vercel --prod 2>&1
$deployExit = $LASTEXITCODE

$deployOutput | Out-Host

if ($deployExit -ne 0) {
    throw "STOP: Vercel production deployment failed."
}

Write-Output ""
Write-Output "=== 9. WAIT FOR CANONICAL PRODUCTION ==="

$canonical = "https://ade-apex-community.vercel.app"
$healthUrl = "$canonical/api/v1/health"

$health = $null

for ($i = 1; $i -le 30; $i++) {
    try {
        $health = Invoke-WebRequest `
            -Uri $healthUrl `
            -UseBasicParsing `
            -TimeoutSec 15

        Write-Output "Health attempt $i/30 -> HTTP $($health.StatusCode)"

        if ($health.StatusCode -eq 200) {
            break
        }
    }
    catch {
        Write-Output "Health attempt $i/30 -> waiting..."
    }

    Start-Sleep -Seconds 5
}

if (-not $health -or $health.StatusCode -ne 200) {
    throw "STOP: canonical production health did not return HTTP 200."
}

Write-Output $health.Content

if ($health.Content -notmatch '"status"\s*:\s*"OK"') {
    throw "STOP: production health status is not OK."
}

if ($health.Content -notmatch '"status"\s*:\s*"HEALTHY"') {
    throw "STOP: production kernel is not HEALTHY."
}

Write-Output ""
Write-Output "=== 10. PRODUCTION HOMEPAGE CHECK ==="

$resp = Invoke-WebRequest `
    -Uri "$canonical/" `
    -UseBasicParsing `
    -TimeoutSec 30

Write-Output "HTTP: $($resp.StatusCode)"
Write-Output "Length: $($resp.Content.Length)"

if ($resp.StatusCode -ne 200) {
    throw "STOP: production homepage did not return HTTP 200."
}

if ($resp.Content.Length -lt 10000) {
    throw "STOP: production homepage response unexpectedly small."
}

$checks = @(
    @{ Name="ADE identity"; Pattern="AUTOMATED ALPHA ALIPH" },
    @{ Name="React root"; Pattern='id="root"' },
    @{ Name="Pilot CTA"; Pattern="REGISTER YOUR INTEREST TO PROGRESS TO PILOT OR ENTERPRISE NOW" },
    @{ Name="ADE value section"; Pattern="One canonical runtime" }
)

foreach ($check in $checks) {
    if ($resp.Content -match $check.Pattern) {
        Write-Output "[PASS] $($check.Name)"
    }
    else {
        throw "STOP: production homepage missing $($check.Name)."
    }
}

Write-Output ""
Write-Output "=== 11. PRODUCTION OLD FOOTER IDENTITY CHECK ==="

if ($resp.Content -match "BUILDING AFRICAN DIGITAL BUSINESS OPERATIONAL SYSTEMS & AFRICAN BUSINESSES' BACKBONE") {
    Write-Output "[INFO] Identity wording exists in production HTML; browser placement determines final visual location."
}
else {
    Write-Output "[PASS] Removed footer wording not found as a standalone production occurrence."
}

Write-Output ""
Write-Output "=== 12. FINAL GIT SAFETY ==="

Write-Output "HEAD:"
git rev-parse HEAD

Write-Output ""
Write-Output "STATUS:"
git status --short

Write-Output ""
Write-Output "============================================================"
Write-Output " ADE HOMEPAGE UI DEPLOYMENT COMPLETE"
Write-Output "============================================================"
Write-Output ""
Write-Output "Production:"
Write-Output $canonical
Write-Output ""
Write-Output "Validation: PASS"
Write-Output "Build: PASS"
Write-Output "Commit: CREATED"
Write-Output "Deployment: READY"
Write-Output "Health: HTTP 200 / KERNEL HEALTHY"
Write-Output "Homepage: HTTP 200 / ADE CONTENT PRESENT"
Write-Output ""
Write-Output "NEXT:"
Write-Output "OPEN THE CANONICAL URL AND VISUALLY TEST:"
Write-Output "PHONE -> TABLET -> IPHONE -> LAPTOP -> DESKTOP"
Write-Output ""
Write-Output "THEN:"
Write-Output "TEST -> PILOT -> PARTNERS -> LEARN -> IMPROVE -> GROW"
Write-Output "============================================================"
