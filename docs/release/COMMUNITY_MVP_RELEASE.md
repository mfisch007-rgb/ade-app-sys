# ADE-APEX Community/MVP Release Contract

## Runtime authority

- Kernel: `src/kernel/EnterpriseKernelMaster.js`
- EventBus: `src/kernel/EnterpriseEventBus.js`
- Capability Registry: `src/core/CapabilityRegistry.js`
- Plugin Registry: `src/kernel/PluginRegistry.js`
- AI Gateway: `src/ai/UniversalAIGateway.js`
- Server: `src/server.js`

Compatibility surfaces remain in place for historical consumers; they do not replace the canonical runtime chain.

## Experience surface

The production-safe control surface is `public/index.html`. It is a React 18 interface using HTML5 browser APIs, SSE, keyboard command palette interaction, server-owned capability discovery, and live event rendering. It does not use browser storage as an authorization authority.

## Capability exposure

The UI discovers capabilities through `/api/v1/capabilities` and searches through `/api/v1/search`. Command execution goes through `/api/v1/dispatch`, which validates the signed session and the capability RBAC level on the server.

## Event-driven operation

The UI subscribes to `/api/v1/events/stream`. The canonical EventBus emits kernel, security, capability, ICX, scenario and feedback events into that stream.

## ICX

ADE-ICX is an internal enterprise subsystem. It provides organizational identity, role-aware communication, server-derived presence, messaging metadata validation and auditable escalation routing. It is not WhatsApp and does not claim carrier SMS capability.

## Safety boundary

`ADE_DEMO_MODE=true` blocks destructive/irreversible external side effects. Simulation remains explicitly distinguishable from live execution.

## Telematics boundary

GPS/GNSS, GSM/cellular, IMEI/IMSI/ICCID/SIM, carrier/cell-tower tracking, MQTT, OBD-II, CAN, J1939, physical devices, fleet tracking and geofencing remain deferred provider-neutral integrations. No fake production telemetry is shipped.
