import React, { useState, useEffect, useRef, useReducer, memo, useMemo } from "react";

/* ─── FONTS & STYLES INJECTION ───────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("ade-f")) {
  const l = document.createElement("link"); 
  l.id = "ade-f"; 
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap";
  document.head.appendChild(l);
}

/* ─── BRAND DESIGN SYSTEM ────────────────────────────── */
const B = {
  bg: "#010C1C", surface: "#051422", elev: "#0A1E35", border: "#1A3558",
  gold: "#FFD700", goldD: "#9A7300", goldL: "#FFE87C",
  coral: "#E53935", coralD: "#880E0E", coralL: "#FF6B6B",
  blue: "#1565C0", blueD: "#0D3880", blueL: "#42A5F5",
  sub: "#6899C4", text: "#E0F0FF",
  success: "#00C853", warn: "#FF9800", err: "#F44336",
  green: "#00BFA5", purple: "#9C27B0", teal: "#00ACC1"
};

const r = (h, a) => {
  const [x, y, z] = [0, 2, 4].map(i => parseInt((h || "#888888").slice(i + 1, i + 3), 16));
  return `rgba(${x},${y},${z},${a})`;
};

/* ─── HARDCODED MASTER ACCESS ───────────────────────── */
const MASTER_CONFIG_PWD = "ADE_PROCARTA_MASTER_2026!";

/* ─── CURRENCY ENGINE ────────────────────────────────── */
const CURRENCIES = {
  NGN: { code: "NGN", symbol: "₦", name: "Nigerian Naira", rate: 1 },
  USD: { code: "USD", symbol: "$", name: "US Dollar", rate: 0.00063 },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", rate: 0.00050 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", rate: 0.00058 },
  GHS: { code: "GHS", symbol: "GH₵", name: "Ghana Cedi", rate: 0.0095 },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling", rate: 0.082 },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand", rate: 0.012 },
  USDT: { code: "USDT", symbol: "USDT ", name: "Tether USD", rate: 0.00063 },
};

let activeCurrency = CURRENCIES.NGN;
const fmt = (n, forceCode) => {
  const c = CURRENCIES[forceCode] || activeCurrency;
  const v = n * c.rate;
  return v >= 1000 ? `${c.symbol}${Number(v.toFixed(v > 999 ? 0 : 2)).toLocaleString("en")}` : `${c.symbol}${Number(v.toFixed(2))}`;
};

/* ─── BPMN COLORS ────────────────────────────────────── */
const NC = {
  start: { bg: "#1B5E20", bd: "#4CAF50" },
  end: { bg: "#880E4F", bd: "#E91E63" },
  process: { bg: "#0D3A80", bd: "#1E88E5" },
  decision: { bg: "#BF360C", bd: "#FF7043" },
  document: { bg: "#004D40", bd: "#00ACC1" },
  subprocess: { bg: "#311B92", bd: "#9575CD" },
  data: { bg: "#1A237E", bd: "#5C6BC0" },
  event: { bg: "#1B5E20", bd: "#66BB6A" }
};

/* ─── PRICING CONFIGURATION ──────────────────────────── */
const PRICING_DEFAULTS = {
  diagnostic:   { micro: 15000, startup: 35000, small: 75000, medium: 150000, large: 350000, enterprise: 700000 },
  maps:         { micro: 25000, startup: 65000, small: 150000, medium: 350000, large: 800000, enterprise: 2000000 },
  flawAnalysis: { micro: 20000, startup: 50000, small: 100000, medium: 250000, large: 600000, enterprise: 1500000 },
  automation:   { micro: 30000, startup: 85000, small: 200000, medium: 500000, large: 1200000, enterprise: 3000000 },
  retainerMo:   { micro: 20000, startup: 45000, small: 100000, medium: 220000, large: 500000, enterprise: 1200000 },
};

const SCALE_MAP = {
  "Micro (1–5)": "micro", "Startup (6–20)": "startup", "Small (21–100)": "small",
  "Medium (101–500)": "medium", "Large (501–2,000)": "large", "Enterprise (2,000+)": "enterprise"
};

const CMULT = {
  "Technology / Software": 1.3, "Finance / Banking / Fintech": 1.4, "Healthcare / Pharma": 1.35,
  "Government / Public Sector": 1.5, "Manufacturing / Industrial": 1.25, "Oil & Gas": 1.45,
  "Logistics / Supply Chain": 1.2, "Legal / Law Firm": 1.3, "Insurance": 1.3, "Energy / Utilities": 1.35
};

const calcPrice = (stage, staffCount, industry, px = PRICING_DEFAULTS) => {
  const tier = SCALE_MAP[staffCount] || "small";
  const base = (px[stage] || {})[tier] || (px[stage] || {}).small || 50000;
  return Math.round(base * (CMULT[industry] || 1.0) / 1000) * 1000;
};

/* ─── NOTIFICATION ENGINE ────────────────────────────── */
const NOTIFY_CONFIG = {
  webhookUrl: "", telegramBot: "", telegramChatId: "", whatsappApiUrl: ""
};

async function fireNotification(event, payload) {
  if (!NOTIFY_CONFIG.webhookUrl) return;
  try {
    await fetch(NOTIFY_CONFIG.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), source: "ADE-PROCARTA-v4", ...payload }),
      keepalive: true,
    });
  } catch (e) {
    console.warn("Notification trigger warning:", e);
  }
}

/* ─── FORM REDUCER & INITIAL STATE ───────────────────── */
const EMPTY_FORM = {
  companyName: "", regNo: "", industry: "", country: "", address: "", website: "",
  companyEmail: "", phone: "", founded: "", companyType: "", description: "", services: "",
  clientBase: "", geography: "", revenueStage: "", uvp: "", departments: "", hierarchy: "",
  staffCount: "", reporting: "", commTools: "", software: "", processes: "", painPoints: "",
  automationGoals: "", techGaps: "", timeline: "", package: "professional",
  officers: [{ name: "", role: "", email: "", phone: "", idType: "", idNo: "" }]
};

function fRed(s, action) {
  switch (action.type) {
    case "SET": return { ...s, [action.key]: action.value };
    case "SET_O": {
      const o = [...s.officers];
      o[action.idx] = { ...o[action.idx], [action.field]: action.value };
      return { ...s, officers: o };
    }
    case "ADD_O": return { ...s, officers: [...s.officers, { name: "", role: "", email: "", phone: "", idType: "", idNo: "" }] };
    case "REM_O": return { ...s, officers: s.officers.filter((_, i) => i !== action.idx) };
    default: return s;
  }
}

/* ─── GLOBAL CSS STYLES ──────────────────────────────── */
const GCS = `
@keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes rot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:0.55;transform:scale(1)}50%{opacity:1;transform:scale(1.03)}}
@keyframes flowLine{0%{stroke-dashoffset:0}100%{stroke-dashoffset:-48}}
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#051422}
::-webkit-scrollbar-thumb{background:rgba(255,215,0,0.3);border-radius:3px}
.inp{width:100%;padding:10px 13px;background:rgba(21,101,192,0.05);border:1px solid rgba(21,101,192,0.3);border-radius:6px;color:#E0F0FF;font-size:13px;font-family:Rajdhani,sans-serif;font-weight:500;outline:none;box-sizing:border-box;transition:border-color 0.2s,box-shadow 0.2s}
.inp:focus{border-color:#FFD700!important;box-shadow:0 0 0 2px rgba(255,215,0,0.12)!important}
.inp::placeholder{color:rgba(104,153,196,0.4)}
select.inp option{background:#0A1E35;color:#E0F0FF}
.btn-g{padding:13px 32px;background:linear-gradient(135deg,rgba(255,215,0,0.16),rgba(229,57,53,0.07));border:2px solid #FFD700;border-radius:7px;color:#FFD700;font-family:Cinzel,serif;font-weight:700;letter-spacing:0.18em;cursor:pointer;transition:all 0.25s;box-shadow:0 0 24px rgba(255,215,0,0.18)}
.btn-g:hover{box-shadow:0 0 45px rgba(255,215,0,0.4);transform:translateY(-1px)}
.btn-g:disabled{opacity:0.3;cursor:not-allowed;transform:none}
.btn-o{background:transparent;border:1px solid rgba(104,153,196,0.32);border-radius:5px;color:#6899C4;font-family:Cinzel,serif;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s}
.btn-o:hover{border-color:#FFD700;color:#FFD700}
`;

/* ─── CROWN LOGO ─────────────────────────────────────── */
function CrownLogo({ size = 64, onClick, tapCount = 0 }) {
  const g = `cg${size}`;
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 100 88" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", flexShrink: 0 }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={B.goldL} /><stop offset="55%" stopColor={B.gold} /><stop offset="100%" stopColor={B.goldD} />
        </linearGradient>
        <filter id={`gf${size}`}><feGaussianBlur stdDeviation="1.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <polygon points="10,60 10,20 28,38 50,4 72,38 90,20 90,60" fill={`url(#${g})`} stroke={B.goldD} strokeWidth="1.5" />
      <rect x="8" y="60" width="84" height="20" rx="5" fill={`url(#${g})`} stroke={B.goldD} strokeWidth="1.5" />
      <polygon points="13,58 13,24 29,40 50,8 71,40 87,24 87,58" fill="none" stroke={r("#ffffff", 0.18)} strokeWidth="1" />
      <circle cx="50" cy="5" r="7" fill={B.coral} stroke={B.coralD} strokeWidth="1.5" filter={`url(#gf${size})`} />
      <circle cx="50" cy="5" r="3.8" fill={B.coralL} opacity="0.7" />
      <ellipse cx="47.5" cy="2.5" rx="2" ry="1.3" fill="white" opacity="0.55" />
      {[[28, 38], [72, 38]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="5" fill={B.coral} stroke={B.coralD} strokeWidth="1" filter={`url(#gf${size})`} />
          <circle cx={cx} cy={cy} r="2.5" fill={B.coralL} opacity="0.6" />
        </g>
      ))}
      {[17, 27, 37, 50, 63, 73, 83].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy="70" r="5.5" fill={B.coral} stroke={B.coralD} strokeWidth="0.8" />
          <circle cx={x - 1.3} cy="68.2" r="1.9" fill="white" opacity="0.3" />
        </g>
      ))}
      <polygon points="50,46 57,57 50,67 43,57" fill={B.goldL} stroke={B.goldD} strokeWidth="1" />
      {tapCount > 0 && tapCount < 5 && <text x="50" y="86" textAnchor="middle" fontSize="6" fill={r(B.gold, 0.5)} fontFamily="Share Tech Mono">{tapCount}/5</text>}
    </svg>
  );
}

/* ─── HIDDEN MASTER CONFIG MODAL ─────────────────────── */
function MasterConfigModal({ onClose, config, onSave }) {
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [webhook, setWebhook] = useState(config.webhookUrl || "");
  const [err, setErr] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    if (pass === MASTER_CONFIG_PWD) {
      setAuthed(true);
      setErr("");
    } else {
      setErr("INVALID MASTER ACCESS KEY");
    }
  };

  const handleSave = () => {
    onSave({ webhookUrl: webhook });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: r("#000", 0.85), display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, fontFamily: "Rajdhani,sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 460, background: B.surface, border: `2px solid ${B.gold}`, borderRadius: 12, padding: 24, boxShadow: `0 0 50px ${r(B.gold, 0.3)}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "Cinzel", color: B.gold, fontSize: 14, fontWeight: 700 }}>⚙️ SYSTEM CONFIGURATION PANEL</div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${B.sub}`, color: B.sub, borderRadius: 4, cursor: "pointer", padding: "2px 8px" }}>✕</button>
        </div>

        {!authed ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 11, color: B.sub, fontFamily: "Share Tech Mono" }}>PROTECTED MASTER ENVIRONMENT CONTROL</div>
            <input type="password" className="inp" placeholder="Enter Master Password..." value={pass} onChange={e => setPass(e.target.value)} autoFocus />
            {err && <div style={{ color: B.coral, fontSize: 11, fontFamily: "Share Tech Mono" }}>{err}</div>}
            <button type="submit" className="btn-g" style={{ padding: "10px" }}>UNLOCK PANEL →</button>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 10, color: B.sub, fontFamily: "Cinzel", display: "block", marginBottom: 6 }}>WEBHOOK NOTIFICATION ENDPOINT</label>
              <input type="text" className="inp" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://n8n.yourdomain.com/webhook/..." />
            </div>
            <button className="btn-g" onClick={handleSave} style={{ padding: "10px" }}>SAVE & CLOSE</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── ANIMATED SWIM LANE MAP ─────────────────────────── */
const AnimatedSwimLaneMap = memo(function AnimatedSwimLaneMap({ mapData, width, isPreview = false, onHover, hoveredId, animate = true }) {
  if (!mapData) return null;
  const { lanes = [], nodes = [], connections = [], id: mid = "m" } = mapData;
  const HW = isPreview ? 55 : 80, LH = isPreview ? 70 : 126, TP = isPreview ? 8 : 26, BP = isPreview ? 8 : 16;
  const H = TP + lanes.length * LH + BP, W = width, UW = W - HW - (isPreview ? 8 : 16);
  const laneIdx = {}; lanes.forEach((l, i) => { laneIdx[l.id] = i; });
  
  const nPos = {};
  nodes.forEach(n => {
    const li = laneIdx[n.lane_id];
    if (li === undefined) return;
    nPos[n.id] = { x: HW + (n.x ?? 0.1) * UW, y: TP + li * LH + LH / 2 };
  });

  const nSz = (type, sz) => {
    const bw = isPreview ? 48 : 102, bh = isPreview ? 23 : 42;
    const m = sz === "large" ? 1.3 : sz === "small" ? 0.78 : 1;
    if (type === "start" || type === "end") return { w: (isPreview ? 19 : 34) * m, h: (isPreview ? 19 : 34) * m };
    if (type === "decision") return { w: bw * 1.12 * m, h: bh * 1.32 * m };
    return { w: bw * m, h: bh * m };
  };

  const paths = useMemo(() => connections.map((conn, ci) => {
    const sp = nPos[conn.from], tp = nPos[conn.to];
    if (!sp || !tp) return null;
    const srcN = nodes.find(n => n.id === conn.from);
    const lc = lanes.find(l => l.id === srcN?.lane_id)?.color || "#5599AA";
    const isNo = conn.type === "reject" || ["no", "failed", "rejected"].includes((conn.label || "").toLowerCase());
    const dx = tp.x - sp.x, dy = tp.y - sp.y;
    const d = Math.abs(dy) < 8
      ? `M${sp.x} ${sp.y} C${(sp.x + tp.x) / 2} ${sp.y},${(sp.x + tp.x) / 2} ${tp.y},${tp.x} ${tp.y}`
      : `M${sp.x} ${sp.y} C${sp.x + dx * 0.45} ${sp.y},${tp.x - dx * 0.35} ${tp.y},${tp.x} ${tp.y}`;
    return { id: conn.id || ci, d, cc: isNo ? B.coral : lc, sw: isPreview ? 1.2 : (conn.weight === "thick" ? 2.8 : conn.weight === "thin" ? 1 : 1.8), isNo, sl: srcN?.lane_id, label: conn.label, sp, tp, dx };
  }).filter(Boolean), [connections, nPos, nodes, lanes, isPreview]);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        {lanes.map(l => (
          <marker key={l.id} id={`a${mid}${l.id}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0,8 3,0 6" fill={l.color} fillOpacity="0.9" />
          </marker>
        ))}
        <marker id={`rej${mid}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill={B.coral} fillOpacity="0.9" />
        </marker>
        <filter id={`gl${mid}`}><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        {nodes.map(n => {
          const nc = NC[n.type] || NC.process;
          return (
            <linearGradient key={n.id} id={`ng${mid}${n.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={nc.bg} stopOpacity="0.99" />
              <stop offset="100%" stopColor={nc.bg} stopOpacity="0.65" />
            </linearGradient>
          );
        })}
      </defs>

      <rect width={W} height={H} fill={isPreview ? "#031020" : "#010C1C"} />

      {lanes.map((lane, i) => {
        const y = TP + i * LH;
        return (
          <g key={lane.id}>
            <rect x={0} y={y} width={W} height={LH} fill={r(lane.color, i % 2 === 0 ? 0.055 : 0.022)} />
            <rect x={0} y={y} width={HW} height={LH} fill={r(lane.color, 0.19)} />
            <line x1={HW} y1={y} x2={HW} y2={y + LH} stroke={r(lane.color, 0.38)} strokeWidth={1} />
            <text x={HW / 2} y={y + LH / 2} textAnchor="middle" fill={lane.color}
              fontSize={isPreview ? 7 : 10.5} fontFamily="Rajdhani" fontWeight="700"
              transform={`rotate(-90,${HW / 2},${y + LH / 2})`}>
              {(lane.icon || "") + " " + (lane.name || "").toUpperCase().slice(0, isPreview ? 9 : 22)}
            </text>
            {i < lanes.length - 1 && <line x1={HW} y1={y + LH} x2={W} y2={y + LH} stroke={r(lane.color, 0.16)} strokeWidth={1} strokeDasharray="7 4" />}
          </g>
        );
      })}

      {paths.map(p => (
        <g key={p.id}>
          <path d={p.d} fill="none" stroke={r(p.cc, p.isNo ? 0.65 : 0.45)} strokeWidth={p.sw}
            strokeDasharray={p.isNo ? "7,4" : "none"}
            markerEnd={`url(#${p.isNo ? `rej${mid}` : `a${mid}${p.sl || ""}`})`} />
          {animate && !isPreview && <path d={p.d} fill="none" stroke={r(p.cc, 0.7)} strokeWidth={p.sw * 0.7}
            strokeDasharray="12 36" strokeDashoffset="0"
            style={{ animation: `flowLine ${1.8 + (p.id % 3) * 0.4}s linear infinite` }} />}
          {!isPreview && p.label && Math.abs(p.dx) > 55 && (
            <text x={(p.sp.x + p.tp.x) / 2} y={(p.sp.y + p.tp.y) / 2 - 7} textAnchor="middle"
              fill={p.isNo ? B.coralL : r(B.sub, 0.9)} fontSize={8.5} fontFamily="Share Tech Mono"
              paintOrder="stroke" stroke={r(B.bg, 0.85)} strokeWidth="3">{p.label}</text>
          )}
        </g>
      ))}

      {nodes.map(node => {
        const pos = nPos[node.id];
        if (!pos) return null;
        const nc = NC[node.type] || NC.process;
        const sz = nSz(node.type, node.size);
        const hw = sz.w / 2, hh = sz.h / 2;
        const isH = hoveredId === node.id, isCrit = node.is_critical;
        const { x, y } = pos;
        const fill = `url(#ng${mid}${node.id})`;
        const stroke = isH ? nc.bd : isCrit ? nc.bd : r(nc.bd, 0.72);
        const sw = isCrit ? 2.5 : isH ? 2 : 1.5;

        const Shape = () => {
          switch (node.type) {
            case "start": return <circle cx={x} cy={y} r={hw} fill={fill} stroke={stroke} strokeWidth={sw} />;
            case "end": return <g><circle cx={x} cy={y} r={hw} fill={fill} stroke={stroke} strokeWidth={sw} /><circle cx={x} cy={y} r={hw * 0.55} fill={nc.bd} opacity="0.6" /></g>;
            case "decision": return <polygon points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
            default: return <rect x={x - hw} y={y - hh} width={sz.w} height={sz.h} rx={3.5} fill={fill} stroke={stroke} strokeWidth={sw} />;
          }
        };

        return (
          <g key={node.id} onMouseEnter={() => onHover && onHover(node)} onMouseLeave={() => onHover && onHover(null)}
            style={{ cursor: "pointer" }} filter={(isCrit || isH) && !isPreview ? `url(#gl${mid})` : undefined}>
            <Shape />
            <text x={x} y={y + (node.sublabel && !isPreview ? -3 : 4)} textAnchor="middle" fill="white"
              fontSize={isPreview ? 7 : node.size === "large" ? 12 : 10} fontFamily="Rajdhani" fontWeight="600"
              style={{ pointerEvents: "none" }}>
              {isPreview ? node.label?.slice(0, 11) : node.label}
            </text>
            {!isPreview && node.sublabel && (
              <text x={x} y={y + 13} textAnchor="middle" fill={r(nc.bd, 0.85)} fontSize={7.5}
                fontFamily="Share Tech Mono" style={{ pointerEvents: "none" }}>{node.sublabel?.slice(0, 22)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

/* ─── RETINA SIGNATURE PAD ────────────────────────────── */
function SignaturePad({ label, role, onSave, saved }) {
  const canRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

  const getXY = (e) => {
    const c = canRef.current, rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (c.width / rect.width), y: (src.clientY - rect.top) * (c.height / rect.height) };
  };

  useEffect(() => {
    const c = canRef.current; if (!c) return;
    const dw = c.offsetWidth || 300, dh = 100;
    c.width = dw * dpr; c.height = dh * dpr;
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
    c.style.width = dw + "px"; c.style.height = dh + "px";
  }, [dpr]);

  const down = (e) => { e.preventDefault(); last.current = getXY(e); drawing.current = true; };
  const move = (e) => {
    e.preventDefault(); if (!drawing.current) return;
    const pos = getXY(e); const ctx = canRef.current.getContext("2d");
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#0A1E3A"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    last.current = pos;
  };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canRef.current, ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width / dpr, c.height / dpr); };
  const confirm = () => {
    const c = canRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const hasData = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
    if (!hasData) return;
    onSave(c.toDataURL());
  };

  if (saved) return (
    <div style={{ border: `1.5px solid ${B.success}`, borderRadius: 8, overflow: "hidden", background: r(B.success, 0.05) }}>
      <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: B.success, fontSize: 16 }}>✓</span>
        <div><div style={{ fontSize: 10, color: B.success, fontFamily: "Cinzel", letterSpacing: "0.1em" }}>{label?.toUpperCase()}</div><div style={{ fontSize: 11, color: r(B.sub, 0.7), fontFamily: "Rajdhani" }}>{role}</div></div>
        <button onClick={() => onSave(null)} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${r(B.sub, 0.25)}`, borderRadius: 4, color: B.sub, fontSize: 9, cursor: "pointer", padding: "3px 8px", fontFamily: "Cinzel" }}>RE-SIGN</button>
      </div>
      <img src={saved} alt="signature" style={{ display: "block", width: "100%", height: 55, objectFit: "contain", background: "#f5f0e8", padding: "0 10px" }} />
    </div>
  );

  return (
    <div style={{ border: `1px solid ${r(B.gold, 0.3)}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "6px 12px", background: r(B.blue, 0.12), display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9.5, color: B.blueL, fontFamily: "Cinzel", fontWeight: 700, letterSpacing: "0.1em" }}>{label?.toUpperCase()}</span>
        <span style={{ fontSize: 11, color: r(B.sub, 0.7), fontFamily: "Rajdhani" }}>{role}</span>
      </div>
      <div style={{ position: "relative", background: "#f7f4ec" }}>
        <canvas ref={canRef} style={{ display: "block", width: "100%", touchAction: "none", cursor: "crosshair" }}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: "6px 10px", background: r(B.blue, 0.06) }}>
        <button onClick={clear} style={{ flex: 1, padding: "6px", background: "transparent", border: `1px solid ${r(B.sub, 0.25)}`, borderRadius: 4, color: B.sub, fontSize: 9.5, cursor: "pointer", fontFamily: "Cinzel" }}>↺ CLEAR</button>
        <button onClick={confirm} style={{ flex: 2, padding: "6px", background: r(B.success, 0.1), border: `1px solid ${r(B.success, 0.35)}`, borderRadius: 4, color: B.success, fontSize: 9.5, fontWeight: 700, cursor: "pointer", fontFamily: "Cinzel" }}>✓ CONFIRM SIGNATURE</button>
      </div>
    </div>
  );
}

/* ─── PAYMENT MODAL ──────────────────────────────────── */
function PaymentModal({ amount, companyName, onClose, onPaid }) {
  const [tab, setTab] = useState("card");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const GATEWAYS = [
    { id: "card", label: "Card", icon: "💳", color: B.blueL },
    { id: "paystack", label: "Paystack", icon: "🇳🇬", color: "#00C3F7" },
    { id: "paypal", label: "PayPal", icon: "🅿", color: "#0070BA" },
    { id: "crypto", label: "Crypto", icon: "₿", color: B.gold },
    { id: "bank", label: "Bank Transfer", icon: "🏦", color: B.green },
    { id: "palmpay", label: "PalmPay", icon: "🌴", color: "#27AE60" }
  ];

  const simulate = async () => {
    setLoading(true);
    await new Promise(res => setTimeout(res, 2200));
    setLoading(false); setDone(true);
    await fireNotification("PAYMENT_RECEIVED", { company: companyName, amount, currency: activeCurrency.code, gateway: tab });
    setTimeout(() => onPaid(tab), 1500);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: r("#000", 0.75), display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "Rajdhani,sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 540, background: B.surface, border: `2px solid ${r(B.gold, 0.35)}`, borderRadius: 14, overflow: "hidden", boxShadow: `0 0 80px ${r(B.gold, 0.15)}` }}>
        <div style={{ padding: "16px 20px", background: r(B.gold, 0.07), borderBottom: `1px solid ${r(B.gold, 0.2)}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "Cinzel", fontSize: 13, color: B.gold, fontWeight: 700 }}>SECURE PAYMENT</div>
            <div style={{ fontSize: 11, color: r(B.sub, 0.7), fontFamily: "Rajdhani" }}>{companyName} · <strong style={{ color: B.gold }}>{fmt(amount)}</strong></div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${r(B.sub, 0.3)}`, borderRadius: 4, color: B.sub, padding: "5px 11px", cursor: "pointer", fontFamily: "Cinzel", fontSize: 10 }}>✕ CLOSE</button>
        </div>
        {done ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
            <div style={{ fontFamily: "Cinzel", fontSize: 16, color: B.success, marginBottom: 6 }}>PAYMENT CONFIRMED</div>
            <div style={{ fontSize: 12, color: B.sub, fontFamily: "Rajdhani" }}>Your maps are being generated. ADE notification sent.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${r(B.border, 0.4)}` }}>
              {GATEWAYS.map(g => (
                <button key={g.id} onClick={() => setTab(g.id)} style={{ flex: "0 0 auto", padding: "10px 14px", background: tab === g.id ? r(g.color, 0.12) : "transparent", border: "none", borderBottom: `2px solid ${tab === g.id ? g.color : "transparent"}`, color: tab === g.id ? g.color : r(B.sub, 0.55), cursor: "pointer", fontFamily: "Cinzel", fontSize: 9, letterSpacing: "0.08em" }}>
                  {g.icon} {g.label}
                </button>
              ))}
            </div>
            <div style={{ padding: "20px" }}>
              <button className="btn-g" onClick={simulate} style={{ width: "100%", padding: "12px" }} disabled={loading}>
                {loading ? "Processing..." : `EXECUTE PAYMENT (${fmt(amount)}) →`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── SHARED UI COMPONENTS ───────────────────────────── */
const S = { inp: { width: "100%", padding: "10px 13px", background: r(B.blue, 0.05), border: `1px solid ${r(B.blue, 0.3)}`, borderRadius: 6, color: B.text, fontSize: 13, fontFamily: "Rajdhani,sans-serif", fontWeight: 500, outline: "none", boxSizing: "border-box" } };

function F({ label, children, req, hint, col = "1/-1" }) {
  return (
    <div style={{ gridColumn: col }}>
      <div style={{ marginBottom: 5, display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 8.5, fontFamily: "Cinzel", color: r(B.sub, 0.8), letterSpacing: "0.12em" }}>{label}{req && <span style={{ color: B.gold, marginLeft: 2 }}>✶</span>}</span>
        {hint && <span style={{ fontSize: 9.5, color: r(B.sub, 0.4), fontFamily: "Share Tech Mono" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SH({ c }) {
  return <div style={{ fontFamily: "Cinzel", fontSize: 14, fontWeight: 700, color: B.gold, letterSpacing: "0.12em", paddingBottom: 11, borderBottom: `1px solid ${r(B.gold, 0.18)}`, marginBottom: 6, gridColumn: "1/-1" }}>{c}</div>;
}

function Brand({ size = 32, onTap, tapCount }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <CrownLogo size={size} onClick={onTap} tapCount={tapCount} />
      <div>
        <div style={{ fontFamily: "Cinzel", fontSize: size * 0.34, fontWeight: 800, color: B.gold, lineHeight: 1.1, letterSpacing: "0.05em" }}>ADE-PROCARTA</div>
        <div style={{ fontSize: size * 0.18, color: r(B.sub, 0.5), fontFamily: "Share Tech Mono", letterSpacing: "0.1em" }}>ALPHA-ALIPH DIGITAL ENTERPRISE</div>
      </div>
    </div>
  );
}

function TBar({ L, C, R }) {
  return <div style={{ padding: "12px 22px", background: B.surface, borderBottom: `1px solid ${r(B.gold, 0.16)}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>{L}{C && <div style={{ flex: 1 }}>{C}</div>}{R && <div style={{ marginLeft: "auto" }}>{R}</div>}</div>;
}

/* ─── SCREEN: SPLASH ─────────────────────────────────── */
function SplashScreen({ onStart, tapCount, onTap }) {
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 25% 35%,${r(B.blue, 0.22)} 0%,${r(B.blueD, 0.1)} 40%,${B.bg} 70%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", fontFamily: "Rajdhani,sans-serif" }}>
      <style>{GCS}</style>
      <CrownLogo size={92} onClick={onTap} tapCount={tapCount} />
      <h1 style={{ fontFamily: "Cinzel", fontSize: 42, fontWeight: 900, color: B.gold, marginTop: 14 }}>ADE-PROCARTA</h1>
      <button className="btn-g" onClick={onStart} style={{ marginTop: 24 }}>BEGIN CLIENT ONBOARDING →</button>
    </div>
  );
}

/* ─── SCREEN: FORM ───────────────────────────────────── */
const STPLBLS = ["Company Identity", "Business Profile", "Organisation", "Operations", "Principal Officers", "Package"];

function FormScreen({ dispatch, fd, onNext, onTap, tapCount }) {
  const [step, setStep] = useState(0);
  const up = (k, v) => dispatch({ type: "SET", key: k, value: v });

  return (
    <div style={{ minHeight: "100vh", background: B.bg, fontFamily: "Rajdhani,sans-serif", color: B.text }}>
      <TBar L={<Brand size={32} onTap={onTap} tapCount={tapCount} />} R={<div style={{ fontFamily: "Cinzel", fontSize: 13, color: B.gold }}>{STPLBLS[step]}</div>} />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "26px 22px 80px" }}>
        {step === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
            <SH c="Company Identity & Registration" />
            <F label="COMPANY NAME" req col="1/-1"><input className="inp" style={S.inp} value={fd.companyName} onChange={e => up("companyName", e.target.value)} /></F>
            <F label="INDUSTRY" req><input className="inp" style={S.inp} value={fd.industry} onChange={e => up("industry", e.target.value)} /></F>
            <F label="COUNTRY" req><input className="inp" style={S.inp} value={fd.country} onChange={e => up("country", e.target.value)} /></F>
          </div>
        )}
        {step > 0 && step < 5 && <div style={{ color: B.sub, fontSize: 13 }}>Input details for step: {STPLBLS[step]}</div>}
        {step === 5 && <div style={{ color: B.gold, fontSize: 14 }}>Select Package Step Active</div>}
        <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
          {step > 0 && <button className="btn-o" onClick={() => setStep(s => s - 1)}>BACK</button>}
          <button className="btn-g" onClick={() => (step === STPLBLS.length - 1 ? onNext() : setStep(s => s + 1))}>NEXT →</button>
        </div>
      </div>
    </div>
  );
}

/* ─── SCREEN: QUOTE ──────────────────────────────────── */
function QuoteScreen({ fd, pricing, onConfirm, onBack, onTap, tapCount }) {
  const [sel] = useState({ diagnostic: true, maps: true });
  const total = calcPrice("diagnostic", fd.staffCount, fd.industry, pricing) + calcPrice("maps", fd.staffCount, fd.industry, pricing);

  return (
    <div style={{ minHeight: "100vh", background: B.bg, fontFamily: "Rajdhani,sans-serif", color: B.text }}>
      <TBar L={<Brand size={32} onTap={onTap} tapCount={tapCount} />} R={<button className="btn-o" onClick={onBack}>← BACK</button>} />
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "26px 22px 80px" }}>
        <SH c="Service Quotation Summary" />
        <div style={{ fontSize: 18, color: B.gold, margin: "20px 0" }}>Total Due: {fmt(total)}</div>
        <button className="btn-g" onClick={() => onConfirm({ sel, total })}>ACCEPT QUOTE & PROCEED →</button>
      </div>
    </div>
  );
}

/* ─── SCREEN: SIGNATURES ─────────────────────────────── */
function SigsScreen({ sigs, setSigs, onNext, onTap, tapCount }) {
  const save = (i, d) => setSigs(p => { const n = [...p]; n[i] = { ...n[i], sig: d }; return n; });
  return (
    <div style={{ minHeight: "100vh", background: B.bg, fontFamily: "Rajdhani,sans-serif", color: B.text }}>
      <TBar L={<Brand size={32} onTap={onTap} tapCount={tapCount} />} />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "26px 22px 80px" }}>
        <SH c="Digital Signatures" />
        {sigs.map((o, i) => <SignaturePad key={i} label={o.name || `Officer ${i+1}`} role={o.role} onSave={d => save(i, d)} saved={o.sig} />)}
        <button className="btn-g" onClick={onNext} style={{ marginTop: 20, width: "100%" }}>CONFIRM SIGNATURES →</button>
      </div>
    </div>
  );
}

/* ─── SCREEN: CONSENT ────────────────────────────────── */
function ConsentScreen({ onComplete, onTap, tapCount }) {
  return (
    <div style={{ minHeight: "100vh", background: B.bg, fontFamily: "Rajdhani,sans-serif", color: B.text }}>
      <TBar L={<Brand size={32} onTap={onTap} tapCount={tapCount} />} />
      <div style={{ maxWidth: 740, margin: "0 auto", padding: "26px 22px 80px" }}>
        <SH c="Terms & Compliance Consent" />
        <button className="btn-g" onClick={onComplete} style={{ marginTop: 20, width: "100%" }}>SUBMIT & GENERATE MAPS →</button>
      </div>
    </div>
  );
}

/* ─── SCREEN: PROCESSING ─────────────────────────────── */
function ProcessingScreen({ company }) {
  return (
    <div style={{ minHeight: "100vh", background: B.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <CrownLogo size={80} />
      <div style={{ fontFamily: "Cinzel", color: B.gold, marginTop: 20 }}>GENERATING LIVING BPMN MAPS FOR {company}...</div>
    </div>
  );
}

/* ─── SCREEN: MAP GALLERY & DETAIL ────────────────────── */
const MOCK_MAP = {
  id: 1, name: "Operational Core System", variant: "operational",
  lanes: [{ id: "l1", name: "Client", color: "#1E88E5", icon: "🌐" }, { id: "l2", name: "Operations", color: "#FF9800", icon: "⚙️" }],
  nodes: [
    { id: "n1", label: "Client Request", type: "start", lane_id: "l1", x: 0.1 },
    { id: "n2", label: "Process Invoice", type: "process", lane_id: "l2", x: 0.5, is_critical: true },
    { id: "n3", label: "Complete Order", type: "end", lane_id: "l2", x: 0.9 }
  ],
  connections: [{ id: "c1", from: "n1", to: "n2" }, { id: "c2", from: "n2", to: "n3" }]
};

function MapsGallery({ maps = [MOCK_MAP], onSelect, onTap, tapCount }) {
  return (
    <div style={{ minHeight: "100vh", background: B.bg, fontFamily: "Rajdhani,sans-serif", color: B.text, padding: 24 }}>
      <TBar L={<Brand size={30} onTap={onTap} tapCount={tapCount} />} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
        {maps.map(m => (
          <div key={m.id} style={{ background: B.surface, border: `1px solid ${B.border}`, padding: 16, borderRadius: 8 }}>
            <h3 style={{ color: B.gold, fontFamily: "Cinzel" }}>{m.name}</h3>
            <AnimatedSwimLaneMap mapData={m} width={400} isPreview={true} />
            <button className="btn-g" onClick={() => onSelect(m)} style={{ width: "100%", marginTop: 12 }}>EXPLORE MAP →</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapDetailScreen({ mapData, onBack }) {
  const [hov, setHov] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: B.bg, color: B.text, padding: 20 }}>
      <TBar L={<button className="btn-o" onClick={onBack}>← BACK TO GALLERY</button>} />
      <div style={{ marginTop: 20 }}>
        <AnimatedSwimLaneMap mapData={mapData} width={1000} isPreview={false} onHover={setHov} hoveredId={hov?.id} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MASTER CONTAINER (WITH 5-TAP CROWN HIDDEN TRIGGER)
═══════════════════════════════════════════════════════ */
export default function AdeProcarterContainer() {
  const [screen, setScreen] = useState("splash");
  const [fd, dispatch] = useReducer(fRed, EMPTY_FORM);
  const [sigs, setSigs] = useState([{ name: "", role: "Managing Director", sig: null }]);
  const [quote, setQuote] = useState(null);
  const [activeMap, setActiveMap] = useState(null);
  const [showPay, setShowPay] = useState(false);
  
  /* Tap Trigger State & Master Modal Control */
  const [tapCount, setTapCount] = useState(0);
  const [showConfig, setShowConfig] = useState(false);

  const handleCrownTap = () => {
    setTapCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setShowConfig(true);
        return 0;
      }
      return next;
    });
  };

  const handleSaveConfig = (newCfg) => {
    if (newCfg.webhookUrl) NOTIFY_CONFIG.webhookUrl = newCfg.webhookUrl;
  };

  const handleFormDone = () => {
    setSigs(fd.officers.map(o => ({ name: o.name, role: o.role || "Officer", sig: null })));
    setScreen("quote");
  };

  const handleQuoteAccept = (qData) => {
    setQuote(qData);
    setScreen("sigs");
  };

  const handleConsentDone = () => {
    setScreen("processing");
    setTimeout(() => setScreen("gallery"), 3500);
  };

  return (
    <div style={{ background: B.bg, minHeight: "100vh" }}>
      {screen === "splash" && <SplashScreen onStart={() => setScreen("form")} tapCount={tapCount} onTap={handleCrownTap} />}
      {screen === "form" && <FormScreen dispatch={dispatch} fd={fd} onNext={handleFormDone} tapCount={tapCount} onTap={handleCrownTap} />}
      {screen === "quote" && <QuoteScreen fd={fd} pricing={PRICING_DEFAULTS} onConfirm={handleQuoteAccept} onBack={() => setScreen("form")} tapCount={tapCount} onTap={handleCrownTap} />}
      {screen === "sigs" && <SigsScreen sigs={sigs} setSigs={setSigs} onNext={() => setScreen("consent")} tapCount={tapCount} onTap={handleCrownTap} />}
      {screen === "consent" && <ConsentScreen onComplete={handleConsentDone} tapCount={tapCount} onTap={handleCrownTap} />}
      {screen === "processing" && <ProcessingScreen company={fd.companyName} />}
      {screen === "gallery" && <MapsGallery maps={[MOCK_MAP]} onSelect={(m) => { setActiveMap(m); setScreen("detail"); }} tapCount={tapCount} onTap={handleCrownTap} />}
      {screen === "detail" && activeMap && <MapDetailScreen mapData={activeMap} onBack={() => setScreen("gallery")} />}

      {showPay && (
        <PaymentModal 
          amount={quote?.total || 50000} 
          companyName={fd.companyName || "Client Company"} 
          onClose={() => setShowPay(false)} 
          onPaid={() => setShowPay(false)} 
        />
      )}

      {showConfig && (
        <MasterConfigModal 
          onClose={() => setShowConfig(false)} 
          config={NOTIFY_CONFIG} 
          onSave={handleSaveConfig} 
        />
      )}
    </div>
  );
}
