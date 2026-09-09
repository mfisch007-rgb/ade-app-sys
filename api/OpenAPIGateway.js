// LEGACY / NON-CANONICAL SURFACE — reference only; NOT imported by the canonical
// runtime or api/index.js. Canonical HTTP runtime: src/app.js -> src/server.js.
class OpenAPIGateway { getSpec() { return { openapi: "3.0.0", info: { title: "ADE Enterprise OS API", version: "1.0.0" }, paths: { "/api/v1/health": { get: { responses: { 200: { description: "System Healthy" } } } } } }; } } module.exports = OpenAPIGateway;
