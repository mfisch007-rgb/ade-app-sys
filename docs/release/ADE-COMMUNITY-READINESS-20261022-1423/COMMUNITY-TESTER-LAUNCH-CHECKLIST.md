# Community Tester Launch Checklist

- **Release:** ADE Community start
- **Report:** `ADE-COMMUNITY-READINESS-REPORT.md`
- **Status:** Local candidate passes functional and dependency-audit gates; post-deploy media privacy and browser login remain to be verified.
- **Use this checklist only after the Founder/operator confirms the deployed commit and initial post-deploy checks.**

## 1. Test conditions

- Test on the deployed URL, not a local file.
- Use desktop and one mobile browser.
- Use an invited test account only. Do not use a real customer’s credentials or data.
- Do not send live WhatsApp messages, real money, or customer communications during this test.
- Do not share the Founder PIN or any token in screenshots, chat, or tickets.
- Record browser, viewport, timestamp, build/deployment ID, and account role.

## 2. Pre-launch checks (operator)

- [ ] Deployment is the intended commit and `/api/v1/health` reports that commit.
- [ ] Kernel is `HEALTHY`; no failing subsystem in the health payload.
- [ ] `/api/v1/product-surface` returns 24 surfaces and AWBULI is on `#/products`.
- [ ] Anonymous `/ade-experience/media/<file>.mp4` returns 401.
- [ ] Anonymous `/ade-experience/media-manifest.json` returns 401.
- [ ] No `.bak` file or `README-INTEGRATION.md` is reachable from production.
- [ ] `/admin` and `/founder` show login gates, not anonymous consoles.
- [ ] Public “See AWBULI Status” opens the AWBULI status surface, not Product Theater.
- [ ] The AWBULI page still states that no public number is configured unless the server publishes one.
- [ ] Release decision and any dependency-risk exception are recorded.

## 3. Anonymous public journeys

### A. Home and navigation

- [ ] Home loads without a login redirect.
- [ ] Hero, product cards, navigation, and footer render; no blank sections.
- [ ] No browser-console exception blocks the first paint.
- [ ] Product links resolve to a real section and do not open a dead end.
- [ ] “Products” shows the product matrix with honest status labels.
- [ ] Command Center / Workspace / Admin operator links are not exposed to an anonymous visitor.

### B. PROCARTA

- [ ] Open PROCARTA from Home and from the Products surface.
- [ ] The form explains what to enter and has one unambiguous submit action.
- [ ] Submit a clearly labelled test scenario.
- [ ] A case/result is returned with findings, evidence, and next actions.
- [ ] No claim of live AI appears when the runtime is on lexical fallback.
- [ ] A failure or unavailable state is shown honestly, not as success.

### C. AWBULI

- [ ] Open AWBULI status from Home; it opens the AWBULI surface.
- [ ] Status shows `CONFIGURATION_REQUIRED` or the server’s current truth.
- [ ] The page states that no public WhatsApp number is configured, unless the server publishes one.
- [ ] “Request a Pilot” / setup path reaches Community intake.
- [ ] No button claims live messaging, a verified sender, or a connected provider.
- [ ] Product Theater is available only as an explicitly labelled demo, never as AWBULI status.

### D. Oracle

- [ ] Oracle is reachable from an authenticated surface.
- [ ] A query returns grounded output with the current mode labelled.
- [ ] If no external AI provider is configured, the UI does not claim live provider execution.

### E. Community, pilots, partners, feedback

- [ ] Community page explains the pilot/partner/feedback paths.
- [ ] Pilot-interest and partner-interest forms validate required fields.
- [ ] Submission returns a truthful confirmation or a clear failure.
- [ ] Feedback accepts a test message and confirms receipt without exposing PII.
- [ ] No duplicate submit creates duplicate records unexpectedly.

### F. Invitation and sign-in

- [ ] Invitation page accepts a test invitation code and rejects an invalid code clearly.
- [ ] Sign-in submits once; the modal closes and the Workspace opens.
- [ ] Pressing Enter in the username field submits once.
- [ ] Cancel closes the modal and does not leave a second modal queued.
- [ ] An invalid password shows an error without exposing whether an account exists.
- [ ] PIN step-up is a separate, clearly labelled action.

### G. Workspace (invited test account)

- [ ] Workspace loads permitted modules only.
- [ ] No blank module, dead tab, or infinite spinner.
- [ ] Account page shows session/security actions.
- [ ] Sign out clears the session and protected routes return to the login gate.
- [ ] Unauthorized role actions are hidden or blocked, not merely relabelled.

### H. Founder / Admin gates

- [ ] Founder/Admin URL without a session shows the login gate.
- [ ] An ordinary invited account cannot reach Founder controls.
- [ ] Founder password + PIN succeeds only when both are correct.
- [ ] Wrong PIN is rejected and does not fall back to password-only access.
- [ ] No secret, raw PIN, hash, or token is visible in the DOM, URL, or console.

## 4. Mobile checks

- [ ] Home, Products, PROCARTA, Community, and sign-in are usable at 360–390 px width.
- [ ] No horizontal clipping of forms, cards, or navigation.
- [ ] Primary buttons meet a comfortable touch target.
- [ ] Mobile menu does not expose operator routes to anonymous users.
- [ ] The AWBULI modal is scrollable and its action buttons remain reachable.

## 5. Stop conditions

Stop testing and report immediately if any of these occurs:

- Raw source-media filename, media manifest, or `/ade-experience/media/` content is visible or downloadable anonymously.
- A `.bak` file or internal README is reachable.
- A public page claims live WhatsApp, a verified sender, or a live AI provider without server evidence.
- A protected route returns data without a valid session.
- A role can perform an action outside its permissions.
- Founder/Admin can be reached without the login gate.
- The sign-in flow opens a second modal, loops, or requires a duplicate submit.
- A 500 error, unhandled exception, or blank first paint blocks a primary journey.
- Any real credential, token, PIN, or customer data appears in a screenshot or log.

## 6. Evidence template

For each journey, record:

```text
Journey:
Build / deployment ID:
Environment URL:
Browser / version / viewport:
Account role (no credentials):
Timestamp (UTC):
Expected:
Actual:
Pass / Fail / Blocked:
Screenshot or recording reference:
Console/network error (redact secrets):
```

## 7. Known limitations to state to testers

- AWBULI live WhatsApp is not configured; only status/setup paths are testable.
- NEXUS, EVENTOS, and TIDE are implementation/roadmap surfaces, not production integrations.
- ADE-MARKET CIRCLE supports partner registration only; commerce operations are not verified.
- FOUNDERS CIRCLE supports request access; the full hub is not verified.
- Oracle may run on the offline lexical engine when no AI provider key is configured.
- Email delivery is unavailable until Resend is configured.
- Media playback in a logged-in browser requires the Bearer-token path; a bare protected `<video src>` is expected to fail.
- Testers should not be invited until the deployed media/manifest routes return 401 and the operator has verified the deployed commit.

## 8. Tester sign-off

```text
Tester:
Role:
Date:
Build:
Journeys passed:
Journeys failed:
Blockers:
Evidence location:
Recommendation: GO / NO-GO
```
