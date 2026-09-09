/**
 * ADE GUIDED DEMO SCENARIOS
 *
 * Pre-defined demonstration scenarios based on real/safe ADE pathways.
 * Each scenario provides: concise explanation, example input,
 * Run Demo action, visible execution, result, truth classification,
 * and trace evidence.
 */

export const DEMO_SCENARIOS = Object.freeze([
  {
    id: "operational-assessment",
    category: "Operational Assessment",
    label: "Find the bottleneck in our customer operations.",
    description: "ADE observes operational signals, identifies patterns, and surfaces insights about process bottlenecks.",
    exampleInput: "Find the bottleneck in our customer operations. We have declining response times and increasing complaint volume.",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Describe your operational challenge..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "30s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  },
  {
    id: "workflow-automation",
    category: "Workflow Automation",
    label: "Simulate a customer complaint workflow.",
    description: "ADE structures a complaint handling workflow and simulates the end-to-end process from intake to resolution.",
    exampleInput: "Simulate a customer complaint workflow from intake to resolution including escalation paths.",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Describe the workflow to simulate..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "25s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  },
  {
    id: "performance-decline",
    category: "Decision Intelligence",
    label: "Why has operational performance declined?",
    description: "ADE applies decision intelligence to analyze potential causes of performance decline and recommends investigation paths.",
    exampleInput: "Why has operational performance declined? Our team productivity metrics have dropped 15% this quarter.",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Describe the performance concern..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "25s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  },
  {
    id: "business-process-assessment",
    category: "Operational Assessment",
    label: "Assess this business process.",
    description: "ADE performs a structured assessment of a business process, identifying strengths, weaknesses, and improvement opportunities.",
    exampleInput: "Assess our invoice processing workflow for efficiency and compliance risks.",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Describe the process to assess..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "20s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  },
  {
    id: "automation-opportunity",
    category: "Workflow Automation",
    label: "Recommend an automation opportunity.",
    description: "ADE analyzes available processes and recommends the highest-impact automation opportunity with implementation guidance.",
    exampleInput: "Recommend an automation opportunity in our supply chain management process.",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Describe your operational area..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "25s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  },
  {
    id: "oracle-intelligence",
    category: "ADE Oracle / Operational Intelligence",
    label: "Query the ADE Oracle for operational insights.",
    description: "ADE Oracle Intelligence Engine synthesizes knowledge, decisions, and operational signals to provide predictive insights.",
    exampleInput: "What are the top three operational risks in our current process flow?",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Ask the Oracle..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "20s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  },
  {
    id: "full-trace",
    category: "Telemetry / Full Operational Trace",
    label: "Run a full trace of ADE operations.",
    description: "ADE executes a complete demonstration with full telemetry, event capture, and operational trace for every stage.",
    exampleInput: "Run a full demonstration trace showing all ADE operational stages with telemetry.",
    inputFields: [
      { key: "prompt", type: "textarea", placeholder: "Customize the full trace..." }
    ],
    truthClassification: "SIMULATED",
    available: true,
    estimatedDuration: "35s",
    stages: ["OBSERVE", "EXTRACT", "STRUCTURE", "VALIDATE", "DECIDE", "EXECUTE", "EVALUATE", "LEARN", "STORE", "REPORT"]
  }
]);

export function getScenario(id) {
  return DEMO_SCENARIOS.find(s => s.id === id);
}

export function getScenariosByCategory(category) {
  return DEMO_SCENARIOS.filter(s => s.category === category);
}

export function listScenarioCategories() {
  return [...new Set(DEMO_SCENARIOS.map(s => s.category))];
}

export default DEMO_SCENARIOS;
