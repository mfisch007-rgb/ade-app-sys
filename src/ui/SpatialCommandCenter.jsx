import React, { useState, useEffect } from "react";

export function SpatialCommandCenter() {
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [systemState, setSystemState] = useState({
    kernelBooted: true,
    activeSubsystems: ["ALPHA_AI_MODULE", "GUARDIAN_ORACLE_ENGINE"],
    aiGatewayRoute: "OFFLINE_LEXICAL_ENGINE"
  });

  useEffect(() => {
    // Simulated SSE listener hook for Command Center Telemetry
    const eventSource = {
      onmessage: (event) => {
        try {
          const data = JSON.parse(event.data);
          setTelemetryLogs((prev) => [data, ...prev.slice(0, 49)]);
        } catch {}
      }
    };
  }, []);

  return (
    <div style={{ backgroundColor: "#0f172a", color: "#f8fafc", padding: "24px", fontFamily: "monospace", minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid #334155", paddingBottom: "12px", marginBottom: "20px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", color: "#38bdf8" }}>ADE SYSTEM ENGINE // COMMAND CENTER (GATE E)</h1>
        <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "12px" }}>Spatial UI & System Telemetry Bridge</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px" }}>
        {/* System State Box */}
        <div style={{ backgroundColor: "#1e293b", padding: "16px", borderRadius: "6px", border: "1px solid #334155" }}>
          <h2 style={{ fontSize: "14px", color: "#f1f5f9", marginTop: 0 }}>KERNEL SYSTEM STATE</h2>
          <div style={{ fontSize: "12px", lineHeight: "1.8" }}>
            <div>Status: <span style={{ color: "#4ade80" }}>{systemState.kernelBooted ? "BOOTED ✅" : "OFFLINE ❌"}</span></div>
            <div>Gateway Route: <span style={{ color: "#38bdf8" }}>{systemState.aiGatewayRoute}</span></div>
            <div style={{ marginTop: "10px" }}>Subsystems Attached:</div>
            <ul style={{ margin: "4px 0", paddingLeft: "20px", color: "#cbd5e1" }}>
              {systemState.activeSubsystems.map((sub, idx) => (
                <li key={idx}>{sub}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Telemetry Stream Box */}
        <div style={{ backgroundColor: "#1e293b", padding: "16px", borderRadius: "6px", border: "1px solid #334155" }}>
          <h2 style={{ fontSize: "14px", color: "#f1f5f9", marginTop: 0 }}>LIVE TELEMETRY STREAM (SSE)</h2>
          <div style={{ backgroundColor: "#090d16", padding: "12px", borderRadius: "4px", height: "250px", overflowY: "auto", fontSize: "11px" }}>
            {telemetryLogs.length === 0 ? (
              <div style={{ color: "#64748b" }}>[STREAM IDLE]: Awaiting Kernel Events...</div>
            ) : (
              telemetryLogs.map((log, index) => (
                <div key={index} style={{ marginBottom: "6px", color: "#a7f3d0" }}>
                  [{new Date().toISOString()}] {JSON.stringify(log)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpatialCommandCenter;
