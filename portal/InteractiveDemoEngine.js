class InteractiveDemoEngine { runSandbox() { return { session: "demo_" + Date.now(), status: "ACTIVE", dataset: "MOCK_ENTERPRISE_DATA" }; } } module.exports = InteractiveDemoEngine;
