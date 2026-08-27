# ADE-APEX — $0 Community/MVP Deployment

## Release ladder

1. **Community / MVP** — public-safe runtime, capability discovery, command center, telemetry, demo/simulation boundary, feedback, basic server-authoritative identity.
2. **Business** — organization onboarding, stronger entitlements, operational integrations, business workflows and monitored production use.
3. **Enterprise** — multi-tenant activation, organizational RBAC/ABAC, enterprise connectors, hardened persistence, SLA/observability and controlled integrations.
4. **Evolution** — bounded IoT/telematics, provider-specific hardware/carrier adapters, simulation/replay, advanced autonomous operations.

Physical GPS/GSM/IMEI/SIM/MQTT/CAN/J1939 integrations remain deferred until real providers/hardware are connected.

## $0 deployment topology

- **GitHub** — source control and CI/CD.
- **Vercel** — application hosting for the current Express/React surface through `api/index.js` and `vercel.json`.
- **Cloudflare** — DNS, TLS/edge protection and optional caching/proxy at the domain layer.
- **UptimeRobot** — external uptime monitor against `/api/v1/health`.
- **GitHub Actions** — repeatable validation/build checks.

No provider credentials are committed to the repository.

## Required production environment variables

Set these in the hosting provider's secret/environment settings:

- `ADE_ADMIN_PIN` — administrator bootstrap credential; never commit it.
- `ADE_ADMIN_LEVEL` — normally `3` for admin, `4` only when system shutdown authority is explicitly required.
- `ADE_ADMIN_TIER` — normally `ENTERPRISE` for the protected control plane.
- `ADE_PRIVATE_KEY` / `ADE_PUBLIC_KEY` — persistent RSA key pair for server-signed sessions. Keep the private key secret.
- `ADE_TOKEN_ISSUER` — `ADE-APEX`.
- `ADE_TOKEN_AUDIENCE` — `ADE-APEX-RUNTIME`.
- `ADE_DEMO_MODE` — `true` for demonstration/simulation environments; `false` for production policy mode.

## Vercel

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Vercel detects `vercel.json` and the `api/index.js` server entry.
4. Add the environment variables above in the Vercel project settings.
5. Deploy.
6. Verify `/api/v1/health`, `/api/v1/capabilities`, the command center, and SSE `/api/v1/events/stream`.

## Cloudflare

Use Cloudflare for the custom domain's DNS/TLS/edge layer. Do not expose or proxy private keys. Keep API behavior at the canonical application origin.

## UptimeRobot

Create an HTTPS monitor for:

`https://YOUR-DOMAIN/api/v1/health`

Expected HTTP status: `200` while the runtime is healthy.

## Release verification

Run before publishing a release:

```text
npm test
npm run validate
npm run verify:release
npm run build:community
```

The community artifact is `dist/ade-community-edition.zip` and its integrity record is `dist/build-manifest.json`.
