import React, { useState, useEffect } from "react";

export default function GodModePanel() {
    const [features, setFeatures] = useState({});
    const [status, setStatus] = useState("CONNECTING...");

    useEffect(() => {
        const source = new EventSource("http://localhost:8080/api/stream");
        source.onopen = () => setStatus("ONLINE");
        source.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.topic === "GODMODE_EVENT" && data.payload.action === "FEATURE_TOGGLED") {
                setFeatures(prev => ({ ...prev, [data.payload.feature]: data.payload.state }));
            }
        };
        source.onerror = () => setStatus("OFFLINE");
        return () => source.close();
    }, []);

    const toggleFeature = async (featureKey, currentState) => {
        try {
            await fetch("http://localhost:8080/api/godmode/command", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer ADE_SUPREME_FOUNDER_KEY_2026"
                },
                body: JSON.stringify({ action: "TOGGLE_FEATURE", feature: featureKey, state: !currentState })
            });
        } catch (err) {
            console.error("Toggle failed:", err);
        }
    };

    return (
        <div style={{ background: "rgba(10, 25, 47, 0.9)", border: "1px solid #00ffff", borderRadius: "12px", padding: "20px", color: "#fff" }}>
            <h3>Founder God-Mode Matrix ({status})</h3>
            <div style={{ display: "grid", gap: "10px", marginTop: "15px" }}>
                {Object.entries(features).map(([key, val]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>
                        <span>{key}</span>
                        <button 
                            onClick={() => toggleFeature(key, val)}
                            style={{ background: val ? "#00ff88" : "#ff3366", border: "none", padding: "5px 15px", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}
                        >
                            {val ? "ENABLED" : "DISABLED"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
