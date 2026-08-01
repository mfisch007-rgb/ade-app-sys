class ObservabilityMatrix { getMetrics() { return { uptime: process.uptime(), memory: process.memoryUsage() }; } } module.exports = ObservabilityMatrix;
