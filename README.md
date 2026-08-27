# ADE-APEX — Final Engineered Community/MVP Source

ADE-APEX is a kernel-first, event-driven enterprise operations platform. The canonical runtime is JavaScript/Node.js + Express; the control surface is a React 18/HTML5 event-driven interface served by the canonical server.

## Canonical runtime

- `src/kernel/EnterpriseKernelMaster.js`
- `src/kernel/EnterpriseEventBus.js`
- `src/core/CapabilityRegistry.js`
- `src/kernel/PluginRegistry.js`
- `src/ai/UniversalAIGateway.js`
- `src/kernel/SupportingEngines.js`
- `src/server.js`

## UI

`public/index.html` is the current Community/MVP control surface. It provides:

- real-time SSE/EventBus telemetry
- server-authoritative capability discovery
- live capability search
- Ctrl/Cmd+K command palette
- server-authorized command execution
- runtime metrics
- security/session state
- ICX and release surfaces
- LIVE/SIMULATED/CONCEPT-safe presentation boundaries

## Security

Privileged browser state is not persisted in localStorage. Sessions are RSA-signed by the server, expiration is checked, and revocation is persisted. Production secrets belong in hosting-provider environment variables.

## Validation

```text
npm test
npm run validate
npm run verify:release
npm run build:community
```

## Local production-like start

1. Copy `.env.example` to `.env`.
2. Set `ADE_ADMIN_PIN` to a secret value.
3. Start with `npm start`.
4. Open `http://localhost:3000`.

For a production deployment, supply persistent `ADE_PRIVATE_KEY` and `ADE_PUBLIC_KEY` environment variables rather than committing private key material.

## Deployment

See `docs/deployment/FREE_ZERO_DEPLOYMENT.md` for the $0 GitHub + Vercel + Cloudflare + UptimeRobot arrangement.

## Release ladder

Community/MVP → Business → Enterprise → Evolution.

Hardware/carrier integrations remain provider-neutral and deferred until real physical integrations exist.
