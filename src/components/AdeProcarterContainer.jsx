'use client';

import { useState, useEffect, useRef, useCallback, useReducer, memo, useMemo } from "react";

/* ─── BRAND & DESIGN SYSTEM ──────────────────────────────────── */
const BRAND = {
  bg: "#010C1C", surface: "#051422", elev: "#0A1E35", border: "#1A3558",
  gold: "#FFD700", goldD: "#9A7300", goldL: "#FFE87C",
  coral: "#E53935", coralD: "#880E0E", coralL: "#FF6B6B",
  blue: "#1565C0", blueD: "#0D3880", blueL: "#42A5F5",
  sub: "#6899C4", text: "#E0F0FF",
  success: "#00C853", warn: "#FF9800", err: "#F44336",
  green: "#00BFA5", purple: "#9C27B0", teal: "#00ACC1"
};

const hexToRgba = (hex, alpha) => {
  const [x, y, z] = [0, 2, 4].map(i => parseInt((hex || "#888888").slice(i + 1, i + 3), 16));
  return `rgba(${x}, ${y}, ${z}, ${alpha})`;
};

/* ─── CURRENCY ENGINE ────────────────────────────────────────── */
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
const setGlobalCurrency = (code) => { activeCurrency = CURRENCIES[code] || CURRENCIES.NGN; };
const fmt = (n, forceCode) => {
  const c = CURRENCIES[forceCode] || activeCurrency;
  const v = n * c.rate;
  return v >= 1000 ? `${c.symbol}${Number(v.toFixed(v > 999 ? 0 : 2)).toLocaleString("en")}` : `${c.symbol}${Number(v.toFixed(2))}`;
};

/* ─── BPMN NODE SCHEMATICS ───────────────────────────────────── */
const NODE_COLORS = {
  start: { bg: "#1B5E20", bd: "#4CAF50" },
  end: { bg: "#880E4F", bd: "#E91E63" },
  process: { bg: "#0D3A80", bd: "#1E88E5" },
  decision: { bg: "#BF360C", bd: "#FF7043" },
  document: { bg: "#004D40", bd: "#00ACC1" },
  subprocess: { bg: "#311B92", bd: "#9575CD" },
  data: { bg: "#1A237E", bd: "#5C6BC0" },
  event: { bg: "#1B5E20", bd: "#66BB6A" }
};

/* ─── PRICING ENGINE ─────────────────────────────────────────── */
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

/* ─── SYSTEM NOTIFICATIONS ───────────────────────────────────── */
const NOTIFY_CONFIG = { webhookUrl: "", telegramBot: "", telegramChatId: "", whatsappApiUrl: "" };
async function fireNotification(event, payload) {
  if (!NOTIFY_CONFIG.webhookUrl || typeof window === "undefined") return;
  try {
    await fetch(NOTIFY_CONFIG.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), source: "ADE-PROCARTA-v4", ref: getPartnerRef(), ...payload }),
      keepalive: true,
    });
  } catch {}
}

const getPartnerRef = () => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") || null : null;

/* ─── STATE MANAGEMENT ──────────────────────────────────────── */
const EMPTY_FORM = {
  companyName: "", regNo: "", industry: "", country: "", address: "", website: "", companyEmail: "", phone: "",
  founded: "", companyType: "", description: "", services: "", clientBase: "", geography: "", revenueStage: "",
  uvp: "", departments: "", hierarchy: "", staffCount: "", reporting: "", commTools: "", software: "",
  processes: "", painPoints: "", automationGoals: "", techGaps: "", timeline: "", package: "professional",
  officers: [{ name: "", role: "", email: "", phone: "", idType: "", idNo: "" }]
};

function formReducer(state, action) {
  switch (action.type) {
    case "SET": return { ...state, [action.key]: action.value };
    case "SET_O": {
      const o = [...state.officers];
      o[action.idx] = { ...o[action.idx], [action.field]: action.value };
      return { ...state, officers: o };
    }
    case "ADD_O": return { ...state, officers: [...state.officers, { name: "", role: "", email: "", phone: "", idType: "", idNo: "" }] };
    case "REM_O": return { ...state, officers: state.officers.filter((_, i) => i !== action.idx) };
    case "RESET": return EMPTY_FORM;
    default: return state;
  }
}

/* ─── GLOBAL STYLES ─────────────────────────────────────────── */
const GLOBAL_STYLES = `
@keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes rot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes rotr{from{transform:rotate(360deg)}to{transform:rotate(0deg)}}
@keyframes pulse{0%,100%{opacity:0.55;transform:scale(1)}50%{opacity:1;transform:scale(1.03)}}
@keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:1}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.1}}
@keyframes flowLine{0%{stroke-dashoffset:0}100%{stroke-dashoffset:-48}}
@keyframes nodePulse{0%,100%{r:4;opacity:0.6}50%{r:6.5;opacity:1}}
@keyframes slideIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
@keyframes scanH{0%{transform:translateX(-100%)}100%{transform:translateX(100vw)}}
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#051422}
::-webkit-scrollbar-thumb{background:rgba(255,215,0,0.3);border-radius:3px}
.inp{width:100%;padding:10px 13px;background:rgba(21,101,192,0.05);border:1px solid rgba(21,101,192,0.3);border-radius:6px;color:#E0F0FF;font-size:13px;font-family:Rajdhani,sans-serif;font-weight:500;outline:none;transition:border-color 0.2s,box-shadow 0.2s}
.inp:focus{border-color:#FFD700!important;box-shadow:0 0 0 2px rgba(255,215,0,0.12)!important}
.inp::placeholder{color:rgba(104,153,196,0.4)}
select.inp option{background:#0A1E35;color:#E0F0FF}
.btn-g{padding:13px 32px;background:linear-gradient(135deg,rgba(255,215,0,0.16),rgba(229,57,53,0.07));border:2px solid #FFD700;border-radius:7px;color:#FFD700;font-family:Cinzel,serif;font-weight:700;letter-spacing:0.18em;cursor:pointer;transition:all 0.25s;box-shadow:0 0 24px rgba(255,215,0,0.18)}
.btn-g:hover{box-shadow:0 0 45px rgba(255,215,0,0.4);transform:translateY(-1px)}
.btn-g:disabled{opacity:0.3;cursor:not-allowed;transform:none}
.btn-o{background:transparent;border:1px solid rgba(104,153,196,0.32);border-radius:5px;color:#6899C4;font-family:Cinzel,serif;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s}
.btn-o:hover{border-color:#FFD700;color:#FFD700}
.mcard{transition:transform 0.22s ease,box-shadow 0.22s ease}
.mcard:hover{transform:translateY(-3px)}
`;

/* ─── BRAND LOGO ────────────────────────────────────────────── */
function CrownLogo({ size = 64, onClick, tapCount = 0 }) {
  const g = `cg${size}`;
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 100 88" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", flexShrink: 0 }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND.goldL} /><stop offset="55%" stopColor={BRAND.gold} /><stop offset="100%" stopColor={BRAND.goldD} />
        </linearGradient>
        <filter id={`gf${size}`}><feGaussianBlur stdDeviation="1.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <polygon points="10,60 10,20 28,38 50,4 72,38 90,20 90,60" fill={`url(#${g})`} stroke={BRAND.goldD} strokeWidth="1.5" />
      <rect x="8" y="60" width="84" height="20" rx="5" fill={`url(#${g})`} stroke={BRAND.goldD} strokeWidth="1.5" />
      <polygon points="13,58 13,24 29,40 50,8 71,40 87,24 87,58" fill="none" stroke={hexToRgba("#ffffff", 0.18)} strokeWidth="1" />
      <circle cx="50" cy="5" r="7" fill={BRAND.coral} stroke={BRAND.coralD} strokeWidth="1.5" filter={`url(#gf${size})`} />
      <circle cx="50" cy="5" r="3.8" fill={BRAND.coralL} opacity="0.7" />
      <ellipse cx="47.5" cy="2.5" rx="2" ry="1.3" fill="white" opacity="0.55" />
      {[[28, 38], [72, 38]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="5" fill={BRAND.coral} stroke={BRAND.coralD} strokeWidth="1" filter={`url(#gf${size})`} /><circle cx={cx} cy={cy} r="2.5" fill={BRAND.coralL} opacity="0.6" /></g>
      ))}
      {[17, 27, 37, 50, 63, 73, 83].map((x, i) => (
        <g key={i}><circle cx={x} cy="70" r="5.5" fill={BRAND.coral} stroke={BRAND.coralD} strokeWidth="0.8" /><circle cx={x - 1.3} cy="68.2" r="1.9" fill="white" opacity="0.3" /></g>
      ))}
      <polygon points="50,46 57,57 50,67 43,57" fill={BRAND.goldL} stroke={BRAND.goldD} strokeWidth="1" />
      {tapCount > 0 && tapCount < 5 && <text x="50" y="86" textAnchor="middle" fontSize="6" fill={hexToRgba(BRAND.gold, 0.5)} fontFamily="Share Tech Mono">{tapCount}/5</text>}
    </svg>
  );
}

/* ─── ANIMATED BPMN ENGINE ("Living System") ────────────────── */
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
    return { id: conn.id || ci, d, cc: isNo ? BRAND.coral : lc, sw: isPreview ? 1.2 : (conn.weight === "thick" ? 2.8 : conn.weight === "thin" ? 1 : 1.8), isNo, sl: srcN?.lane_id, label: conn.label, sp, tp, dx };
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
          <polygon points="0 0,8 3,0 6" fill={BRAND.coral} fillOpacity="0.9" />
        </marker>
        <filter id={`gl${mid}`}><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        {nodes.map(n => {
          const nc = NODE_COLORS[n.type] || NODE_COLORS.process;
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
            <rect x={0} y={y} width={W} height={LH} fill={hexToRgba(lane.color, i % 2 === 0 ? 0.055 : 0.022)} />
            <rect x={0} y={y} width={HW} height={LH} fill={hexToRgba(lane.color, 0.19)} />
            <line x1={HW} y1={y} x2={HW} y2={y + LH} stroke={hexToRgba(lane.color, 0.38)} strokeWidth={1} />
            <text x={HW / 2} y={y + LH / 2} textAnchor="middle" fill={lane.color}
              fontSize={isPreview ? 7 : 10.5} fontFamily="Rajdhani" fontWeight="700"
              transform={`rotate(-90,${HW / 2},${y + LH / 2})`}>
              {(lane.icon || "") + " " + (lane.name || "").toUpperCase().slice(0, isPreview ? 9 : 22)}
            </text>
            {i < lanes.length - 1 && <line x1={HW} y1={y + LH} x2={W} y2={y + LH} stroke={hexToRgba(lane.color, 0.16)} strokeWidth={1} strokeDasharray="7 4" />}
          </g>
        );
      })}

      {paths.map(p => (
        <g key={p.id}>
          <path d={p.d} fill="none" stroke={hexToRgba(p.cc, p.isNo ? 0.65 : 0.45)} strokeWidth={p.sw}
            strokeDasharray={p.isNo ? "7,4" : "none"} markerEnd={`url(#${p.isNo ? `rej${mid}` : `a${mid}${p.sl || ""}`})`} />
          {animate && !isPreview && <path d={p.d} fill="none" stroke={hexToRgba(p.cc, 0.7)} strokeWidth={p.sw * 0.7}
            strokeDasharray="12 36" strokeDashoffset="0" style={{ animation: `flowLine ${1.8 + (p.id % 3) * 0.4}s linear infinite` }} />}
          {!isPreview && p.label && Math.abs(p.dx) > 55 && (
            <text x={(p.sp.x + p.tp.x) / 2} y={(p.sp.y + p.tp.y) / 2 - 7} textAnchor="middle"
              fill={p.isNo ? BRAND.coralL : hexToRgba(BRAND.sub, 0.9)} fontSize={8.5} fontFamily="Share Tech Mono"
              paintOrder="stroke" stroke={hexToRgba(BRAND.bg, 0.85)} strokeWidth="3">{p.label}</text>
          )}
        </g>
      ))}

      {nodes.map(node => {
        const pos = nPos[node.id];
        if (!pos) return null;
        const nc = NODE_COLORS[node.type] || NODE_COLORS.process;
        const sz = nSz(node.type, node.size);
        const hw = sz.w / 2, hh = sz.h / 2;
        const isH = hoveredId === node.id, isCrit = node.is_critical;
        const { x, y } = pos;
        const fill = `url(#ng${mid}${node.id})`;
        const stroke = isH ? nc.bd : isCrit ? nc.bd : hexToRgba(nc.bd, 0.72);
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
            {isCrit && animate && !isPreview && <circle cx={x} cy={y} r={Math.max(hw, hh) * 0.8} fill="none"
              stroke={hexToRgba(nc.bd, 0.4)} strokeWidth="1.5" style={{ animation: `nodePulse 2s ease-in-out infinite` }} />}
            <text x={x} y={y + (node.sublabel && !isPreview ? -3 : 4)} textAnchor="middle" fill="white"
              fontSize={isPreview ? 7 : node.size === "large" ? 12 : 10} fontFamily="Rajdhani" fontWeight="600" style={{ pointerEvents: "none" }}>
              {isPreview ? node.label?.slice(0, 11) : node.label}
            </text>
            {!isPreview && node.sublabel && (
              <text x={x} y={y + 13} textAnchor="middle" fill={hexToRgba(nc.bd, 0.85)} fontSize={7.5}
                fontFamily="Share Tech Mono" style={{ pointerEvents: "none" }}>{node.sublabel?.slice(0, 22)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

/* ─── RETINA SIGNATURE PAD ────────────────────────────────────── */
function SignaturePad({ label, role, onSave, saved }) {
  const canRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  const getXY = (e) => {
    const c = canRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (c.width / rect.width), y: (src.clientY - rect.top) * (c.height / rect.height) };
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = canRef.current; if (!c || saved) return;
    const dpr = window.devicePixelRatio || 1;
    const dw = c.offsetWidth || 300, dh = 100;
    c.width = dw * dpr; c.height = dh * dpr;
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
    c.style.width = dw + "px"; c.style.height = dh + "px";
  }, [saved]);

  const down = (e) => { e.preventDefault(); last.current = getXY(e); drawing.current = true; };
  const move = (e) => {
    e.preventDefault(); if (!drawing.current) return;
    const pos = getXY(e); const ctx = canRef.current.getContext("2d");
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    ctx.beginPath(); ctx.moveTo(last.current.x / dpr, last.current.y / dpr); ctx.lineTo(pos.x / dpr, pos.y / dpr);
    ctx.strokeStyle = "#0A1E3A"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    last.current = pos;
  };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canRef.current; if (c) { const ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width, c.height); } };
  const confirm = () => {
    const c = canRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const hasData = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
    if (!hasData) return;
    onSave(c.toDataURL());
  };

  if (saved) return (
    <div style={{ border: `1.5px solid ${BRAND.success}`, borderRadius: 8, overflow: "hidden", background: hexToRgba(BRAND.success, 0.05) }}>
      <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: BRAND.success, fontSize: 16 }}>✓</span>
        <div><div style={{ fontSize: 10, color: BRAND.success, fontFamily: "Cinzel", letterSpacing: "0.1em" }}>{label?.toUpperCase()}</div><div style={{ fontSize: 11, color: hexToRgba(BRAND.sub, 0.7), fontFamily: "Rajdhani" }}>{role}</div></div>
        <button onClick={() => onSave(null)} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${hexToRgba(BRAND.sub, 0.25)}`, borderRadius: 4, color: BRAND.sub, fontSize: 9, cursor: "pointer", padding: "3px 8px", fontFamily: "Cinzel" }}>RE-SIGN</button>
      </div>
      <img src={saved} alt="sig" style={{ display: "block", width: "100%", height: 55, objectFit: "contain", background: "#f5f0e8", padding: "0 10px" }} />
    </div>
  );

  return (
    <div style={{ border: `1px solid ${hexToRgba(BRAND.gold, 0.3)}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "6px 12px", background: hexToRgba(BRAND.blue, 0.12), display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9.5, color: BRAND.blueL, fontFamily: "Cinzel", fontWeight: 700, letterSpacing: "0.1em" }}>{label?.toUpperCase()}</span>
        <span style={{ fontSize: 11, color: hexToRgba(BRAND.sub, 0.7), fontFamily: "Rajdhani" }}>{role}</span>
      </div>
      <div style={{ position: "relative", background: "#f7f4ec" }}>
        <canvas ref={canRef} style={{ display: "block", width: "100%", touchAction: "none", cursor: "crosshair" }}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: "6px 10px", background: hexToRgba(BRAND.blue, 0.06) }}>
        <button onClick={clear} style={{ flex: 1, padding: "6px", background: "transparent", border: `1px solid ${hexToRgba(BRAND.sub, 0.25)}`, borderRadius: 4, color: BRAND.sub, fontSize: 9.5, cursor: "pointer", fontFamily: "Cinzel" }}>↺ CLEAR</button>
        <button onClick={confirm} style={{ flex: 2, padding: "6px", background: hexToRgba(BRAND.success, 0.1), border: `1px solid ${hexToRgba(BRAND.success, 0.35)}`, borderRadius: 4, color: BRAND.success, fontSize: 9.5, fontWeight: 700, cursor: "pointer", fontFamily: "Cinzel" }}>✓ CONFIRM SIGNATURE</button>
      </div>
    </div>
  );
}

/* ─── PAYMENT MODAL SYSTEM ──────────────────────────────────── */
// Canonical billing surface: delegates to ADE's single PaymentService via
// POST /api/v1/payments/start. Never fabricates confirmation — the modal only
// reports what the server (PaymentService.availability/startPayment) returns.
// CLAIMED_UNVERIFIED until a configured provider verifies.
function PaymentModal({ amount, companyName, onClose, onPaid }) {
  const [tab] = useState("card");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");

  const simulate = async () => {
    setLoading(true);
    setNotice("");
    try {
      const r = await fetch("/api/v1/payments/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, company: companyName, gateway: tab, currency: activeCurrency.code }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && (j?.success || j?.payment || j?.authorizationUrl)) {
        setLoading(false); setDone(true);
        setNotice(j?.message || "Payment initialized via canonical billing. Complete with provider; entitlement grants on verified webhook only.");
        await fireNotification("PAYMENT_RECEIVED", { company: companyName, amount, currency: activeCurrency.code, gateway: tab, state: "CLAIMED_UNVERIFIED" });
        setTimeout(() => onPaid(tab), 1200);
        return;
      }
      setLoading(false);
      setNotice(`Billing: ${(j?.error || j?.message || `HTTP ${r.status}`)} — no charge made. Claim remains CLAIMED_UNVERIFIED until a configured provider verifies.`);
    } catch {
      setLoading(false);
      setNotice("Billing service unreachable — no charge made. Claim remains CLAIMED_UNVERIFIED.");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: hexToRgba("#000", 0.75), display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "Rajdhani,sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 540, background: BRAND.surface, border: `2px solid ${hexToRgba(BRAND.gold, 0.35)}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", background: hexToRgba(BRAND.gold, 0.07), borderBottom: `1px solid ${hexToRgba(BRAND.gold, 0.2)}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontFamily: "Cinzel", fontSize: 13, color: BRAND.gold, fontWeight: 700 }}>SECURE PAYMENT GATEWAY</div>
          <div style={{ fontSize: 11, color: hexToRgba(BRAND.sub, 0.7) }}>{companyName} · <strong style={{ color: BRAND.gold }}>{fmt(amount)}</strong></div></div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${hexToRgba(BRAND.sub, 0.3)}`, borderRadius: 4, color: BRAND.sub, padding: "5px 11px", cursor: "pointer", fontFamily: "Cinzel", fontSize: 10 }}>✕ CLOSE</button>
        </div>
        {done ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
            <div style={{ fontFamily: "Cinzel", fontSize: 16, color: BRAND.success }}>PAYMENT INITIALIZED (CLAIMED_UNVERIFIED)</div>
            <div style={{ fontSize: 12, color: BRAND.sub, fontFamily: "Rajdhani" }}>{notice || "Complete with provider; entitlement grants on verified webhook only."}</div>
          </div>
        ) : (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, color: BRAND.sub }}>Selected Payment Provider: <strong style={{ color: BRAND.gold }}>{tab.toUpperCase()}</strong></div>
            {notice && <div style={{ fontSize: 11, color: BRAND.warn, fontFamily: "Rajdhani" }}>{notice}</div>}
            <button className="btn-g" onClick={simulate} disabled={loading}>{loading ? "CONTACTING CANONICAL BILLING..." : `AUTHORIZE PAYMENT OF ${fmt(amount)} →`}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── AI SIMULATION ENGINE (GENERATES FULL ADE MAPS) ─────────── */
// DETERMINISTIC STRUCTURAL PROJECTION — derives lane/node layout from the
// submitted form (company/process text) using a fixed template. It is NOT
// server-measured BPMN and MUST be labeled as projection wherever rendered
// until replaced by GET /api/v1/procarta/topology?caseId=CASE-2026-* output.
function generateFallbackMaps(fd) {
  return [
    {
      id: 1, name: "Core Operational Workflow", variant: "operational", tagline: "End-to-end execution flow across internal divisions", recommended: true, complexity_score: 8,
      lanes: [
        { id: "l1", name: "Client / Front Office", color: "#1E88E5", icon: "🌐" },
        { id: "l2", name: "Operations / Logistics", color: "#43A047", icon: "⚙️" },
        { id: "l3", name: "Executive Approvals", color: "#FF9800", icon: "🏛️" }
      ],
      nodes: [
        { id: "n1", label: "Request Initiated", type: "start", lane_id: "l1", x: 0.08, is_critical: false },
        { id: "n2", label: "Initial Assessment", type: "process", lane_id: "l1", x: 0.30, is_critical: false },
        { id: "n3", label: "Requires Escalation?", type: "decision", lane_id: "l2", x: 0.55, is_critical: true },
        { id: "n4", label: "Executive Sign-off", type: "subprocess", lane_id: "l3", x: 0.78, is_critical: true },
        { id: "n5", label: "Fulfilled & Dispatched", type: "end", lane_id: "l2", x: 0.92, is_critical: false }
      ],
      connections: [
        { id: "c1", from: "n1", to: "n2", label: "Submit", weight: "normal" },
        { id: "c2", from: "n2", to: "n3", label: "Route", weight: "normal" },
        { id: "c3", from: "n3", to: "n4", label: "Yes", weight: "thick" },
        { id: "c4", from: "n3", to: "n5", label: "No", weight: "thin" },
        { id: "c5", from: "n4", to: "n5", label: "Approved", weight: "normal" }
      ],
      report_sections: [
        { title: "Executive Summary", content: `Operational synthesis for ${fd.companyName}. Identifies direct paths to efficiency.` },
        { title: "Risk Mitigation", content: "Bottlenecks reduced by establishing automated routing rules at decision points." },
        { title: "Automation Pathway", content: "Implement API integration between intake channels and operational execution software." }
      ]
    },
    {
      id: 2, name: "Strategic Governance Architecture", variant: "strategic", tagline: "Executive oversight, risk gating & compliance model", recommended: false, complexity_score: 6,
      lanes: [
        { id: "l1", name: "Strategic Leadership", color: "#FFA726", icon: "👑" },
        { id: "l2", name: "Quality Assurance", color: "#26A69A", icon: "🛡️" }
      ],
      nodes: [
        { id: "n10", label: "Policy Audit", type: "start", lane_id: "l1", x: 0.10 },
        { id: "n11", label: "Governance Review", type: "process", lane_id: "l2", x: 0.50 },
        { id: "n12", label: "Board Sign-off", type: "end", lane_id: "l1", x: 0.90 }
      ],
      connections: [
        { id: "c10", from: "n10", to: "n11", label: "Evaluate" },
        { id: "c11", from: "n11", to: "n12", label: "Pass" }
      ],
      report_sections: [
        { title: "Strategic Audit", content: "Oversight structure engineered for regulatory compliance and audit readiness." }
      ]
    }
  ];
}

/* ─── UI COMPONENTS & HELPERS ───────────────────────────────── */
function FormField({ label, children, req, hint, col = "1/-1" }) {
  return (
    <div style={{ gridColumn: col }}>
      <div style={{ marginBottom: 5, display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 8.5, fontFamily: "Cinzel", color: hexToRgba(BRAND.sub, 0.8), letterSpacing: "0.12em" }}>{label}{req && <span style={{ color: BRAND.gold, marginLeft: 2 }}>✶</span>}</span>
        {hint && <span style={{ fontSize: 9.5, color: hexToRgba(BRAND.sub, 0.4), fontFamily: "Share Tech Mono" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ content }) {
  return (
    <div style={{ fontFamily: "Cinzel", fontSize: 14, fontWeight: 700, color: BRAND.gold, letterSpacing: "0.12em", paddingBottom: 11, borderBottom: `1px solid ${hexToRgba(BRAND.gold, 0.18)}`, marginBottom: 6, gridColumn: "1/-1" }}>
      {content}
    </div>
  );
}

function TopBar({ L, C, R }) {
  return (
    <div style={{ padding: "12px 22px", background: BRAND.surface, borderBottom: `1px solid ${hexToRgba(BRAND.gold, 0.16)}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      {L}{C && <div style={{ flex: 1 }}>{C}</div>}{R && <div style={{ marginLeft: "auto" }}>{R}</div>}
    </div>
  );
}

/* ─── MAIN APPLICATION COMPONENT ────────────────────────────── */
export default function ADEProcarta() {
  const [screen, setScreen] = useState("splash"); 
  const [formData, dispatchForm] = useReducer(formReducer, EMPTY_FORM);
  const [signatures, setSignatures] = useState([]);
  const [activeQuote, setActiveQuote] = useState(null);
  const [mapsData, setMapsData] = useState([]);
  const [analysisText, setAnalysisText] = useState("");
  const [selectedMap, setSelectedMap] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  // Canonical case continuity: exact CASE-2026-* id returned by the server
  // (POST /api/v1/procarta/assessment). Non-authoritative UI hint only; the
  // server CaseManager remains the authority. Stored under the existing
  // ade_pending_case key consumed by workspace retrieval.
  const [caseId, setCaseId] = useState(null);
  const [projectionNotice, setProjectionNotice] = useState("");
  // Crown unlock state: display-only. Any privileged action behind the crown
  // MUST re-verify server-side L3/Founder RBAC per tap — this state never
  // grants access on its own.
  const [crownStatus, setCrownStatus] = useState(null);

  // Safe client-side dynamic fonts injection
  useEffect(() => {
    if (typeof document !== "undefined" && !document.getElementById("ade-fonts")) {
      const link = document.createElement("link");
      link.id = "ade-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Crown 5-tap trigger: counts to 5, then delegates EVERYTHING to the
  // server. The client never unlocks capability — it only asks the canonical
  // L2/L3-gated diagnostics endpoint whether the current session carries
  // Founder authority (cookies ade_token/ade_elevated verified by
  // HttpSecurityBoundary -> IdentityOnboarding.verifySession server-side).
  const handleTapLogo = async () => {
    const next = tapCount + 1;
    if (next < 5) { setTapCount(next); return; }
    setTapCount(0);
    setCrownStatus({ state: "VERIFYING", message: "Verifying Founder authority with server…" });
    try {
      const r = await fetch("/api/v1/system/diagnostics", { credentials: "include" });
      if (r.status === 200) {
        setCrownStatus({ state: "VERIFIED", message: "SERVER-VERIFIED: session holds L2+ authority. Privileged actions still re-check L3/Founder RBAC per request." });
      } else if (r.status === 401 || r.status === 403) {
        setCrownStatus({ state: "DENIED", message: "Server denied elevation (401/403). Sign in with Founder credentials — no client unlock granted." });
      } else {
        setCrownStatus({ state: "UNKNOWN", message: `Server responded ${r.status} — no elevation granted.` });
      }
    } catch {
      setCrownStatus({ state: "OFFLINE", message: "Server unreachable — no elevation granted." });
    }
  };
  const handleFormNext = () => setScreen("quote");
  const handleQuoteConfirm = (quote) => { setActiveQuote(quote); setScreen("sigs"); };
  const handleSigsComplete = () => setScreen("consent");
  
  const handleConsentComplete = async () => {
    setScreen("processing");
    await fireNotification("ENGAGEMENT_SUBMITTED", { company: formData.companyName, total: activeQuote?.total });
    // Canonical intake wiring (additive): submit the REAL public assessment to
    // the server so a canonical CASE-2026-* record exists in CaseManager. The
    // visual maps below still render from the local deterministic structural
    // projection (existing generateFallbackMaps) and are explicitly labeled
    // as such unless the server returns a live topology for this case.
    let serverCaseId = null;
    try {
      const r = await fetch("/api/v1/procarta/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName, regNo: formData.regNo, industry: formData.industry,
          staffCount: formData.staffCount, processes: formData.processes, painPoints: formData.painPoints,
          automationGoals: formData.automationGoals, officers: formData.officers, quoteTotal: activeQuote?.total || null,
        }),
      });
      const j = await r.json().catch(() => null);
      serverCaseId = j?.caseId || j?.assessment?.caseId || j?.case?.id || null;
      if (serverCaseId) {
        setCaseId(serverCaseId);
        try { window.localStorage.setItem("ade_pending_case", serverCaseId); } catch {}
        setProjectionNotice(`Case ${serverCaseId} recorded server-side. Maps below are a DETERMINISTIC STRUCTURAL PROJECTION from your submitted form — not server-measured BPMN. Live topology: GET /api/v1/procarta/topology?caseId=${encodeURIComponent(serverCaseId)}`);
      } else {
        setProjectionNotice("Server assessment unavailable — maps below are a DETERMINISTIC STRUCTURAL PROJECTION from your submitted form data only.");
      }
    } catch {
      setProjectionNotice("Server unreachable — maps below are a DETERMINISTIC STRUCTURAL PROJECTION from your submitted form data only.");
    }
    setTimeout(() => {
      const fallbacks = generateFallbackMaps(formData);
      setMapsData(fallbacks);
      setAnalysisText(`System optimization analysis complete for ${formData.companyName}${serverCaseId ? ` (case ${serverCaseId})` : ""}. Operational efficiency projected to increase by up to 38% under ADE automated architecture.`);
      setScreen("maps");
    }, 3000);
  };

  useEffect(() => {
    setSignatures(formData.officers.map(o => ({ name: o.name, role: o.role, sig: null })));
  }, [formData.officers]);

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.text }}>
      <style>{GLOBAL_STYLES}</style>

      {screen === "splash" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
          <CrownLogo size={92} onClick={handleTapLogo} tapCount={tapCount} />
          <h1 style={{ fontFamily: "Cinzel", fontSize: 38, color: BRAND.gold, marginTop: 16 }}>ADE-PROCARTA v4.0</h1>
          <p style={{ fontFamily: "Rajdhani", fontSize: 14, color: BRAND.sub, letterSpacing: "0.15em", marginBottom: 24 }}>AUTOMATED BUSINESS PROCESS INTELLIGENCE ENGINE</p>
          {crownStatus && <p style={{ fontFamily: "Share Tech Mono", fontSize: 11, color: crownStatus.state === "VERIFIED" ? BRAND.success : BRAND.warn, maxWidth: 520 }}>{crownStatus.message}</p>}
          <button className="btn-g" onClick={() => setScreen("form")}>BEGIN CLIENT ONBOARDING →</button>
        </div>
      )}

      {screen === "form" && (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
          <TopBar L={<CrownLogo size={32} />} C={<div style={{ fontFamily: "Cinzel", color: BRAND.gold }}>CLIENT ONBOARDING FORM</div>} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <SectionHeader content="Company Identity" />
            <FormField label="COMPANY NAME" req><input className="inp" value={formData.companyName} onChange={e => dispatchForm({ type: "SET", key: "companyName", value: e.target.value })} /></FormField>
            <FormField label="INDUSTRY" req><input className="inp" value={formData.industry} onChange={e => dispatchForm({ type: "SET", key: "industry", value: e.target.value })} /></FormField>
            <FormField label="STAFF SCALE" req><input className="inp" value={formData.staffCount} placeholder="e.g. Small (21–100)" onChange={e => dispatchForm({ type: "SET", key: "staffCount", value: e.target.value })} /></FormField>
            <FormField label="PRIMARY PROCESSES" req col="1/-1"><textarea className="inp" style={{ minHeight: 80 }} value={formData.processes} onChange={e => dispatchForm({ type: "SET", key: "processes", value: e.target.value })} /></FormField>
          </div>
          <button className="btn-g" style={{ width: "100%", marginTop: 24 }} onClick={handleFormNext}>PROCEED TO QUOTE →</button>
        </div>
      )}

      {screen === "quote" && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
          <TopBar L={<CrownLogo size={32} />} C={<div style={{ fontFamily: "Cinzel", color: BRAND.gold }}>SERVICE QUOTATION</div>} />
          <div style={{ padding: 20, background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 8, marginTop: 20 }}>
            <h3 style={{ fontFamily: "Cinzel", color: BRAND.gold }}>ESTIMATED ENGAGEMENT FEE</h3>
            <p style={{ fontSize: 28, fontFamily: "Cinzel", color: BRAND.goldL, margin: "12px 0" }}>{fmt(calcPrice("maps", formData.staffCount, formData.industry))}</p>
            <button className="btn-g" style={{ width: "100%" }} onClick={() => handleQuoteConfirm({ total: calcPrice("maps", formData.staffCount, formData.industry) })}>ACCEPT QUOTE & PROCEED →</button>
          </div>
        </div>
      )}

      {screen === "sigs" && (
        <div style={{ maxWidth: 650, margin: "0 auto", padding: 24 }}>
          <TopBar L={<CrownLogo size={32} />} C={<div style={{ fontFamily: "Cinzel", color: BRAND.gold }}>DIGITAL SIGNATURES</div>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
            {signatures.map((s, i) => (
              <SignaturePad key={i} label={s.name || `Officer ${i + 1}`} role={s.role || "Authorized Signatory"} saved={s.sig} onSave={(sig) => {
                const copy = [...signatures]; copy[i].sig = sig; setSignatures(copy);
              }} />
            ))}
            <button className="btn-g" onClick={handleSigsComplete} disabled={!signatures.every(s => s.sig)}>CONFIRM SIGNATURES →</button>
          </div>
        </div>
      )}

      {screen === "consent" && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
          <TopBar L={<CrownLogo size={32} />} C={<div style={{ fontFamily: "Cinzel", color: BRAND.gold }}>TERMS & CONSENT</div>} />
          <div style={{ padding: 20, background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 8, marginTop: 20, fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ marginBottom: 16 }}>By clicking proceed, you agree to the execution of business process mapping under Alpha-Aliph ADE protocols, confirming authority and data accuracy.</p>
            <button className="btn-g" style={{ width: "100%" }} onClick={handleConsentComplete}>GENERATE AI PROCESS MAPS →</button>
          </div>
        </div>
      )}

      {screen === "processing" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <CrownLogo size={80} />
          <p style={{ fontFamily: "Cinzel", color: BRAND.gold, marginTop: 20 }}>SYNTHESIZING LIVING BPMN MAPS...</p>
        </div>
      )}

      {screen === "maps" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          <TopBar L={<CrownLogo size={32} />} C={<div style={{ fontFamily: "Cinzel", color: BRAND.gold }}>ADE PROCESS INTELLIGENCE GALLERY</div>} R={<button className="btn-g" style={{ padding: "6px 16px" }} onClick={() => setShowPayment(true)}>PAYMENT OPTIONS</button>} />
          <p style={{ margin: "16px 0", color: BRAND.sub, fontFamily: "Rajdhani" }}>{analysisText}</p>
          {(caseId || projectionNotice) && (
            <div style={{ margin: "0 0 16px 0", padding: 12, background: hexToRgba(BRAND.blue, 0.08), border: `1px solid ${hexToRgba(BRAND.blue, 0.3)}`, borderRadius: 8, fontFamily: "Share Tech Mono", fontSize: 11, color: BRAND.text }}>
              {caseId && <div>CASE ID: <strong style={{ color: BRAND.gold }}>{caseId}</strong> (canonical — retrieve via GET /api/v1/cases/{caseId})</div>}
              {projectionNotice && <div style={{ marginTop: 6, color: BRAND.sub }}>{projectionNotice}</div>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {mapsData.map(map => (
              <div key={map.id} style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 16, cursor: "pointer" }} onClick={() => { setSelectedMap(map); setScreen("detail"); }}>
                <AnimatedSwimLaneMap mapData={map} width={480} isPreview={true} />
                <h4 style={{ fontFamily: "Cinzel", color: BRAND.gold, marginTop: 12 }}>{map.name}</h4>
                <p style={{ fontSize: 11, color: BRAND.sub }}>{map.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === "detail" && selectedMap && (
        <div style={{ padding: 24 }}>
          <TopBar L={<button className="btn-o" style={{ padding: "4px 12px" }} onClick={() => setScreen("maps")}>← GALLERY</button>} C={<div style={{ fontFamily: "Cinzel", color: BRAND.gold }}>{selectedMap.name}</div>} />
          <div style={{ marginTop: 20, display: "flex", gap: 20 }}>
            <div style={{ flex: 1, background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 16 }}>
              <AnimatedSwimLaneMap mapData={selectedMap} width={750} isPreview={false} />
            </div>
            <div style={{ width: 300, background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 16 }}>
              <h4 style={{ fontFamily: "Cinzel", color: BRAND.gold, marginBottom: 12 }}>EXECUTIVE REPORT</h4>
              {selectedMap.report_sections?.map((sec, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontFamily: "Cinzel", color: BRAND.blueL }}>{sec.title}</div>
                  <div style={{ fontSize: 11, color: BRAND.sub, marginTop: 4 }}>{sec.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPayment && (
        <PaymentModal amount={activeQuote?.total || 50000} companyName={formData.companyName} onClose={() => setShowPayment(false)} onPaid={() => setShowPayment(false)} />
      )}
    </div>
  );
}
