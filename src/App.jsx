import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

//  ALERT SOUND ENGINE 
function playAlertSound(type) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  if (type === "critical") {
    // Urgent double-beep for critical
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.30);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } else {
    // Single soft beep for warning
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  }
}

// ─── BROWSER NOTIFICATION ────────────────────────────────────────
function sendBrowserNotification(title, body, type) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: type === "critical" ? "" : "",
      tag:  type, // prevents duplicate stacking
    });
  }
}

// ─── REQUEST NOTIFICATION PERMISSION (call once on load) ─────────
function useNotificationPermission() {
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

// ─── DESIGN TOKENS ───────────────────────────────────────────────
const THEMES = {
  mine:     { bg: "#0d0a00", surface: "#1a1400", card: "#211a00", border: "#3d3000", accent: "#f59e0b", accent2: "#ef4444", muted: "#78716c", text: "#fef3c7", glow: "rgba(245,158,11,0.15)", name: "Mine / Underground" },
  hospital: { bg: "#00080f", surface: "#001524", card: "#001e31", border: "#003a5c", accent: "#22d3ee", accent2: "#10b981", muted: "#64748b", text: "#e0f7ff", glow: "rgba(34,211,238,0.15)", name: "Hospital Ward" },
  industry: { bg: "#080010", surface: "#100020", card: "#180030", border: "#2e0060", accent: "#a855f7", accent2: "#f43f5e", muted: "#6b5e7e", text: "#f0e8ff", glow: "rgba(168,85,247,0.15)", name: "Industrial Facility" },
  env:      { bg: "#000d08", surface: "#001a0f", card: "#002415", border: "#00451e", accent: "#4ade80", accent2: "#fbbf24", muted: "#4b7a5a", text: "#e8fff0", glow: "rgba(74,222,128,0.15)", name: "Environmental / Outdoor" },
};

//  SENSOR CONFIGS 
const ENV_CONFIG = {
  mine: {
     label: "Mine",
    sensors: [
      { key: "co",    label: "CO",       unit: "ppm",   min: 0,   max: 200,  safe: 35,   warn: 100,  base: 20,   noise: 8   },
      { key: "ch4",   label: "Methane",  unit: "% LEL", min: 0,   max: 100,  safe: 10,   warn: 40,   base: 5,    noise: 4   },
      { key: "o2",    label: "O₂",       unit: "%",     min: 15,  max: 23,   safe: 20.9, warn: 19.5, base: 20.9, noise: 0.3, inverted: true },
      { key: "dust",  label: "Dust",     unit: "mg/m³", min: 0,   max: 10,   safe: 2,    warn: 5,    base: 1.2,  noise: 0.5 },
      { key: "temp",  label: "Temp",     unit: "°C",    min: 15,  max: 55,   safe: 30,   warn: 40,   base: 28,   noise: 1.5 },
      { key: "humid", label: "Humidity", unit: "%",     min: 20,  max: 100,  safe: 80,   warn: 90,   base: 65,   noise: 3   },
    ],
    scenarios: ["Normal Operations", "Gas Pocket Detected", "Ventilation Failure", "Dust Storm Event", "Deep Level Heat"],
    scenarioBias: [
      { co: 0,  ch4: 0,  o2: 0,    dust: 0, temp: 0,  humid: 0  },
      { co: 80, ch4: 35, o2: -1.5, dust: 1, temp: 2,  humid: 5  },
      { co: 60, ch4: 20, o2: -2,   dust: 3, temp: 8,  humid: 15 },
      { co: 5,  ch4: 3,  o2: 0,    dust: 6, temp: 1,  humid: 2  },
      { co: 10, ch4: 5,  o2: -0.5, dust: 2, temp: 18, humid: 10 },
    ],
    mlFeatures: ["CO Level", "Methane %", "O₂ Deficit", "Dust Load", "Temperature"],
  },
  hospital: {
     label: "Hospital",
    sensors: [
      { key: "co2",   label: "CO₂",      unit: "ppm",   min: 300, max: 3000, safe: 800,  warn: 1500, base: 550,  noise: 40 },
      { key: "temp",  label: "Temp",     unit: "°C",    min: 18,  max: 30,   safe: 22,   warn: 26,   base: 22,   noise: 0.5 },
      { key: "humid", label: "Humidity", unit: "%",     min: 20,  max: 80,   safe: 60,   warn: 70,   base: 50,   noise: 2  },
      { key: "voc",   label: "VOC",      unit: "ppb",   min: 0,   max: 500,  safe: 100,  warn: 250,  base: 60,   noise: 15 },
      { key: "pm25",  label: "PM2.5",    unit: "μg/m³", min: 0,   max: 150,  safe: 12,   warn: 35,   base: 8,    noise: 3  },
      { key: "noise", label: "Noise",    unit: "dB",    min: 20,  max: 90,   safe: 45,   warn: 60,   base: 38,   noise: 4  },
    ],
    scenarios: ["Normal Ward", "High Occupancy", "Chemical Spill", "HVAC Fault", "Post-Procedure"],
    scenarioBias: [
      { co2: 0,   temp: 0, humid: 0,  voc: 0,   pm25: 0,  noise: 0  },
      { co2: 600, temp: 2, humid: 8,  voc: 30,  pm25: 5,  noise: 10 },
      { co2: 100, temp: 1, humid: 3,  voc: 200, pm25: 15, noise: 5  },
      { co2: 400, temp: 4, humid: 15, voc: 50,  pm25: 8,  noise: 3  },
      { co2: 200, temp: 1, humid: 5,  voc: 80,  pm25: 10, noise: 15 },
    ],
    mlFeatures: ["CO₂ Level", "VOC Load", "PM2.5", "Temperature Drift", "Humidity"],
  },
  industry: {
     label: "Industry",
    sensors: [
      { key: "temp",  label: "Temp",      unit: "°C",    min: 10,  max: 120, safe: 60,  warn: 85,  base: 45,  noise: 3   },
      { key: "vib",   label: "Vibration", unit: "mm/s",  min: 0,   max: 20,  safe: 4,   warn: 10,  base: 2.5, noise: 0.8 },
      { key: "press", label: "Pressure",  unit: "bar",   min: 0,   max: 15,  safe: 8,   warn: 11,  base: 6,   noise: 0.3 },
      { key: "co",    label: "CO",        unit: "ppm",   min: 0,   max: 300, safe: 50,  warn: 100, base: 25,  noise: 8   },
      { key: "noise", label: "Noise",     unit: "dB",    min: 40,  max: 110, safe: 85,  warn: 95,  base: 72,  noise: 4   },
      { key: "pm10",  label: "PM10",      unit: "μg/m³", min: 0,   max: 200, safe: 50,  warn: 100, base: 35,  noise: 8   },
    ],
    scenarios: ["Normal Run", "Overload Condition", "Bearing Failure", "Pressure Spike", "Emergency Shutdown"],
    scenarioBias: [
      { temp: 0,  vib: 0,    press: 0, co: 0,  noise: 0,  pm10: 0  },
      { temp: 25, vib: 3,    press: 2, co: 20, noise: 8,  pm10: 20 },
      { temp: 15, vib: 12,   press: 1, co: 10, noise: 12, pm10: 10 },
      { temp: 10, vib: 2,    press: 5, co: 5,  noise: 5,  pm10: 5  },
      { temp: 5,  vib: 0.5,  press: 0, co: 2,  noise: 2,  pm10: 30 },
    ],
    mlFeatures: ["Temperature", "Vibration RMS", "Pressure", "CO Leakage", "Noise Level"],
  },
  env: {
     label: "Outdoor",
    sensors: [
      { key: "aqi",   label: "AQI",      unit: "",      min: 0,   max: 300,  safe: 50,  warn: 100, base: 35,  noise: 8  },
      { key: "pm25",  label: "PM2.5",    unit: "μg/m³", min: 0,   max: 250,  safe: 12,  warn: 35,  base: 10,  noise: 3  },
      { key: "temp",  label: "Temp",     unit: "°C",    min: 5,   max: 45,   safe: 35,  warn: 40,  base: 26,  noise: 2  },
      { key: "humid", label: "Humidity", unit: "%",     min: 10,  max: 100,  safe: 80,  warn: 90,  base: 55,  noise: 5  },
      { key: "co2",   label: "CO₂",      unit: "ppm",   min: 380, max: 1000, safe: 450, warn: 600, base: 415, noise: 10 },
      { key: "uv",    label: "UV Index", unit: "",      min: 0,   max: 12,   safe: 3,   warn: 6,   base: 4,   noise: 1  },
    ],
    scenarios: ["Clear Day", "Industrial Smog", "Bushfire Smoke", "Rainy Season", "Heatwave"],
    scenarioBias: [
      { aqi: 0,   pm25: 0,   temp: 0,  humid: 0,   co2: 0,  uv: 0  },
      { aqi: 80,  pm25: 30,  temp: 3,  humid: -10, co2: 60, uv: 1  },
      { aqi: 150, pm25: 100, temp: 5,  humid: -15, co2: 30, uv: -1 },
      { aqi: -15, pm25: -5,  temp: -5, humid: 30,  co2: 10, uv: -3 },
      { aqi: 30,  pm25: 10,  temp: 14, humid: -20, co2: 5,  uv: 5  },
    ],
    mlFeatures: ["AQI", "PM2.5", "Temperature", "UV Index", "CO₂ ppm"],
  },
};

// ML RISK ENGINE 
function computeRiskScore(envKey, readings, scenarioIdx) {
  const cfg = ENV_CONFIG[envKey];
  let score = 0, maxScore = 0;
  cfg.sensors.forEach((s, i) => {
    const val = readings[s.key] ?? s.base;
    const range = s.max - s.min;
    const normalized = (val - s.min) / range;
    const danger = s.inverted ? (1 - normalized) : normalized;
    const weight = i === 0 ? 2.5 : 1;
    score += danger * weight;
    maxScore += weight;
  });
  const baseRisk = (score / maxScore) * 100;
  const scenarioBoost = scenarioIdx * 12;
  return Math.min(99, Math.round(baseRisk + scenarioBoost));
}

function getRiskLabel(score) {
  if (score < 25) return { label: "SAFE",      color: "#4ade80" };
  if (score < 50) return { label: "MODERATE",  color: "#fbbf24" };
  if (score < 75) return { label: "HIGH RISK", color: "#f97316" };
  return               { label: "CRITICAL",   color: "#ef4444" };
}

// ─── SIMULATION ENGINE (generates sensor readings based on scenario + random noise)
function generateReading(sensor, bias, t) {
  const wave = Math.sin(t * 0.05) * sensor.noise * 0.5;
  const rand = (Math.random() - 0.5) * sensor.noise;
  const val  = sensor.base + (bias[sensor.key] ?? 0) + wave + rand;
  return Math.max(sensor.min, Math.min(sensor.max, +val.toFixed(2)));
}

function getSensorStatus(sensor, val) {
  if (sensor.inverted) {
    if (val <= sensor.warn) return "critical";
    if (val <= sensor.safe) return "warn";
    return "safe";
  }
  if (val >= sensor.warn) return "critical";
  if (val >= sensor.safe) return "warn";
  return "safe";
}

// ─── GAUGE RING ─
function GaugeRing({ score }) {
  const { color } = getRiskLabel(score);
  const r = 52, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const dash  = (score / 100) * circ;
  return (
    <svg width={128} height={128} viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e3a" strokeWidth={10} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 8px ${color})` }} />
      <text x={cx} y={cy - 6}  textAnchor="middle" fill={color} fontSize={22} fontWeight={700} fontFamily="monospace">{score}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={color} fontSize={8}  fontWeight={600} letterSpacing={1.5} fontFamily="monospace">{getRiskLabel(score).label}</text>
    </svg>
  );
}

// ─── SENSOR CARD ─
function SensorCard({ sensor, value, theme }) {
  const status = getSensorStatus(sensor, value);
  const colors = { safe: theme.accent2, warn: "#fbbf24", critical: "#ef4444" };
  const c = colors[status];
  const pct    = Math.round(((value - sensor.min) / (sensor.max - sensor.min)) * 100);
  const barPct = sensor.inverted ? 100 - pct : pct;
  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${status === "critical" ? c : theme.border}`,
      borderRadius: 12, padding: "14px 16px",
      boxShadow: status === "critical" ? `0 0 16px ${c}40` : "none",
      transition: "all 0.4s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: theme.muted, fontFamily: "monospace" }}>
          {sensor.label}
        </span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, border: `1px solid ${c}`, color: c, fontFamily: "monospace", letterSpacing: 1 }}>
          {status}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: c, fontFamily: "monospace", transition: "color 0.4s" }}>
          {value}
        </span>
        <span style={{ fontSize: 12, color: theme.muted }}>{sensor.unit}</span>
      </div>
      <div style={{ height: 4, background: theme.border, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, barPct))}%`, background: c, borderRadius: 4, transition: "width 0.6s ease, background 0.4s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 9, color: theme.muted, fontFamily: "monospace" }}>{sensor.min} {sensor.unit}</span>
        <span style={{ fontSize: 9, color: theme.muted, fontFamily: "monospace" }}>{sensor.max} {sensor.unit}</span>
      </div>
    </div>
  );
}

// ─── ALERT BANNER (with sound + notifications) 
function AlertBanner({ envKey, readings, theme }) {
  const cfg = ENV_CONFIG[envKey];
  const prevAlertsRef = useRef({});
  const [toasts, setToasts] = useState([]);

  const alerts = [];
  cfg.sensors.forEach(s => {
    const val = readings[s.key];
    if (val == null) return;
    const status = getSensorStatus(s, val);
    if (status === "critical") alerts.push({ key: s.key, label: s.label, val, unit: s.unit, type: "critical" });
    else if (status === "warn")  alerts.push({ key: s.key, label: s.label, val, unit: s.unit, type: "warn" });
  });

  // ── Detect NEW alerts and trigger sound + notification ──────────
  useEffect(() => {
    const prev = prevAlertsRef.current;
    alerts.forEach(a => {
      const wasOk = !prev[a.key] || prev[a.key] === "safe";
      const escalated = prev[a.key] === "warn" && a.type === "critical";

      if (wasOk || escalated) {
        // Sound
        playAlertSound(a.type);

        // Browser notification
        const title = a.type === "critical"
          ? ` CRITICAL: ${a.label}`
          : ` WARNING: ${a.label}`;
        const body = `${a.label} is at ${a.val} ${a.unit} — ${a.type === "critical" ? "Immediate action required!" : "Approaching danger threshold."}`;
        sendBrowserNotification(title, body, a.type);

        // Toast
        const id = Date.now() + Math.random();
        setToasts(t => [...t, { id, ...a }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
      }
    });

    // Update previous state
    const newPrev = {};
    cfg.sensors.forEach(s => {
      const val = readings[s.key];
      if (val != null) newPrev[s.key] = getSensorStatus(s, val);
    });
    prevAlertsRef.current = newPrev;
  }, [readings]);

  return (
    <>
      {/* ── Toast notifications (top-right corner) ── */}
      <div style={{ position: "fixed", top: 60, right: 16, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            background: toast.type === "critical" ? "#1a0505" : "#1a1500",
            border: `1px solid ${toast.type === "critical" ? "#ef4444" : "#fbbf24"}`,
            borderLeft: `4px solid ${toast.type === "critical" ? "#ef4444" : "#fbbf24"}`,
            borderRadius: 10, padding: "12px 16px", minWidth: 260, maxWidth: 320,
            boxShadow: `0 4px 24px ${toast.type === "critical" ? "rgba(239,68,68,0.3)" : "rgba(251,191,36,0.2)"}`,
            animation: "slideIn 0.3s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{toast.type === "critical" ? "" : ""}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: toast.type === "critical" ? "#ef4444" : "#fbbf24", fontFamily: "monospace", letterSpacing: 1 }}>
                {toast.type === "critical" ? "CRITICAL ALERT" : "WARNING"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#e8e8f0" }}>
              <strong>{toast.label}</strong> at {toast.val} {toast.unit}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              {toast.type === "critical" ? "Immediate action required" : "Approaching danger threshold"}
            </div>
          </div>
        ))}
      </div>

      {/* ── Inline alert bar ── */}
      {alerts.length === 0 ? (
        <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 16 }}></span>
          <span style={{ fontSize: 13, color: "#4ade80", fontFamily: "monospace" }}>All sensors within safe parameters</span>
        </div>
      ) : (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              background: a.type === "critical" ? "rgba(239,68,68,0.1)" : "rgba(251,191,36,0.08)",
              border: `1px solid ${a.type === "critical" ? "#ef444460" : "#fbbf2460"}`,
              borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10,
              animation: a.type === "critical" ? "flashRed 1.5s infinite" : "none",
            }}>
              <span>{a.type === "critical" ? "" : ""}</span>
              <span style={{ fontSize: 12, color: a.type === "critical" ? "#ef4444" : "#fbbf24", fontFamily: "monospace" }}>
                {a.label} at {a.val} {a.unit} — {a.type === "critical" ? "CRITICAL: immediate action required" : "WARNING: approaching threshold"}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes flashRed { 0%,100% { background: rgba(239,68,68,0.1); } 50% { background: rgba(239,68,68,0.22); } }
      `}</style>
    </>
  );
}

//  ML PANEL
function MLPanel({ envKey, readings, scenarioIdx, theme }) {
  const cfg   = ENV_CONFIG[envKey];
  const score = computeRiskScore(envKey, readings, scenarioIdx);
  const { color } = getRiskLabel(score);

  const features = cfg.mlFeatures.map((f, i) => {
    const imp = Math.min(99, Math.round(10 + (i % 3) * 8 + scenarioIdx * 7 + (readings[cfg.sensors[i]?.key] ?? 0) % 20));
    return { name: f, importance: imp };
  });

  const maintenance = scenarioIdx >= 2 ? Math.round(60 + scenarioIdx * 8) : Math.round(5 + scenarioIdx * 8);
  const anomaly     = scenarioIdx >= 1 ? Math.round(30 + scenarioIdx * 12) : Math.round(3);

  const recommendation =
    score < 25 ? " Conditions nominal. Continue standard monitoring." :
    score < 50 ? " Minor deviations detected. Increase check frequency." :
    score < 75 ? " Elevated risk. Prepare intervention. Alert supervisor." :
                  " CRITICAL THRESHOLD. Initiate emergency protocol immediately.";

  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: theme.muted, fontFamily: "monospace", marginBottom: 16 }}>
        ML Predictive Engine
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center", marginBottom: 24 }}>
        <GaugeRing score={score} />
        <div>
          <div style={{ fontSize: 10, color: theme.muted, marginBottom: 4, fontFamily: "monospace", letterSpacing: 2 }}>HEALTH RISK SCORE</div>
          <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "monospace", marginBottom: 12 }}>{score} / 100</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: theme.surface, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: theme.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 2 }}>MAINT. RISK</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: maintenance > 50 ? "#f97316" : "#4ade80", fontFamily: "monospace" }}>{maintenance}%</div>
            </div>
            <div style={{ background: theme.surface, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: theme.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 2 }}>ANOMALY</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: anomaly > 30 ? "#ef4444" : "#4ade80", fontFamily: "monospace" }}>{anomaly}%</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, letterSpacing: 2, color: theme.muted, fontFamily: "monospace", marginBottom: 10, textTransform: "uppercase" }}>
        Feature Importance
      </div>
      {features.map((f, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: theme.text }}>{f.name}</span>
            <span style={{ fontSize: 11, color: theme.accent, fontFamily: "monospace" }}>{f.importance}%</span>
          </div>
          <div style={{ height: 3, background: theme.border, borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${f.importance}%`, background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`, borderRadius: 3, transition: "width 0.8s ease" }} />
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16, padding: "10px 14px", background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: theme.muted, fontFamily: "monospace", marginBottom: 4, letterSpacing: 1 }}>MODEL RECOMMENDATION</div>
        <div style={{ fontSize: 12, color, fontFamily: "monospace", lineHeight: 1.5 }}>{recommendation}</div>
      </div>
    </div>
  );
}

//  HISTORY CHART
function HistoryChart({ history, sensors, theme }) {
  const s = sensors[0];
  if (!history.length || !s) return null;
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: theme.muted, fontFamily: "monospace", marginBottom: 16 }}>
        Live Trend — {s.label} {s.unit ? `(${s.unit})` : ""}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={history}>
          <defs>
            <linearGradient id={`grad_${theme.accent}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={theme.accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={theme.accent} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: theme.muted, fontFamily: "monospace" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: theme.muted, fontFamily: "monospace" }} domain={[s.min, s.max]} width={40} />
          <Tooltip
            contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
            labelStyle={{ color: theme.muted }}
            itemStyle={{ color: theme.accent }}
          />
          <ReferenceLine y={s.warn} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: "WARN", fill: "#ef4444", fontSize: 9 }} />
          <Area type="monotone" dataKey={s.key} stroke={theme.accent} fill={`url(#grad_${theme.accent})`} strokeWidth={2} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ENVIRONMENT PAGE 
function EnvPage({ envKey }) {
  const cfg   = ENV_CONFIG[envKey];
  const theme = THEMES[envKey];
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [readings,    setReadings]    = useState({});
  const [history,     setHistory]     = useState([]);
  useNotificationPermission(); // request browser notification access
  const tickRef = useRef(0);

  const simulate = useCallback(() => {
    tickRef.current++;
    const bias = cfg.scenarioBias[scenarioIdx];
    const newR = {};
    cfg.sensors.forEach(s => { newR[s.key] = generateReading(s, bias, tickRef.current); });
    setReadings(newR);
    setHistory(h => {
      const point = { t: `${tickRef.current}s`, ...newR };
      return [...h.slice(-29), point];
    });
  }, [envKey, scenarioIdx, cfg]);

  useEffect(() => {
    simulate();
    const id = setInterval(simulate, 1800);
    return () => clearInterval(id);
  }, [simulate]);

  const handleScenario = (i) => {
    setScenarioIdx(i);
    setHistory([]);
    tickRef.current = 0;
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, padding: "24px 20px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: theme.muted, fontFamily: "monospace", marginBottom: 6 }}>
          EnviroSense Platform · {theme.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>{cfg.icon}</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: theme.text }}>{theme.name}</div>
            <div style={{ fontSize: 12, color: theme.muted }}>Real-time monitoring · {cfg.sensors.length} active sensors · ML risk scoring</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent, animation: "pulse 2s infinite", boxShadow: `0 0 8px ${theme.accent}` }} />
            <span style={{ fontSize: 11, color: theme.accent, fontFamily: "monospace" }}>LIVE</span>
          </div>
        </div>

        {/* Scenario selector */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {cfg.scenarios.map((sc, i) => (
            <button key={i} onClick={() => handleScenario(i)} style={{
              padding: "6px 14px", borderRadius: 20,
              border: `1px solid ${i === scenarioIdx ? theme.accent : theme.border}`,
              background: i === scenarioIdx ? `${theme.accent}20` : "transparent",
              color: i === scenarioIdx ? theme.accent : theme.muted,
              fontSize: 11, cursor: "pointer", fontFamily: "monospace", letterSpacing: 0.5,
              transition: "all 0.2s",
            }}>
              {i === scenarioIdx ? "▶ " : ""}{sc}
            </button>
          ))}
        </div>
      </div>

      <AlertBanner envKey={envKey} readings={readings} />

      {/* Sensor grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {cfg.sensors.map(s => (
          <SensorCard key={s.key} sensor={s} value={readings[s.key] ?? s.base} theme={theme} />
        ))}
      </div>

      {/* Charts + ML */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <HistoryChart history={history} sensors={cfg.sensors} theme={theme} />
        <MLPanel envKey={envKey} readings={readings} scenarioIdx={scenarioIdx} theme={theme} />
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────
function OverviewPage({ onNav }) {
  const [scores, setScores] = useState({ mine: 12, hospital: 8, industry: 15, env: 10 });

  useEffect(() => {
    const update = () => {
      const s = {};
      Object.keys(ENV_CONFIG).forEach(k => {
        const cfg = ENV_CONFIG[k];
        const r   = {};
        cfg.sensors.forEach(sen => { r[sen.key] = generateReading(sen, {}, Date.now() / 1000); });
        s[k] = computeRiskScore(k, r, 0);
      });
      setScores(s);
    };
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  }, []);

  const envs = [
    { key: "mine",      label: "Mine / Underground",   desc: "Gas, dust, oxygen & temperature monitoring" },
    { key: "hospital",  label: "Hospital Ward",        desc: "CO₂, VOC, PM2.5, noise & humidity control" },
    { key: "industry",  label: "Industrial Facility",  desc: "Vibration, pressure, temperature & emissions" },
    { key: "env",       label: "Environmental",        desc: "AQI, PM2.5, UV Index & outdoor air quality" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e8e8f8" }}>

      {/* Hero */}
      <div style={{ padding: "60px 32px 40px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 5, textTransform: "uppercase", color: "#4ade80", fontFamily: "monospace", marginBottom: 16 }}>
          Sense Everything. Predict Anything
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.1, marginBottom: 16 }}>
          EnviroSense<br />
          <span style={{ background: "linear-gradient(135deg, #4ade80, #22d3ee, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Universal Monitor Platform
          </span>
        </h1>
        <p style={{ fontSize: 15, color: "#6b7280", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.8 }}>
          Sensor moduleS. Any environment. Real-time AI risk prediction across mines, hospitals, industry, and outdoor spaces.
        </p>

        {/* Architecture */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 48 }}>
          {["Sensor Module", "→", "IoT Gateway", "→", "Python ML API", "→", "React Dashboard"].map((item, i) => (
            <div key={i} style={{
              padding: item === "→" ? "0 6px" : "7px 14px",
              background: item === "→" ? "transparent" : "rgba(255,255,255,0.04)",
              border: item === "→" ? "none" : "1px solid #1e1e3a",
              borderRadius: 8,
              fontSize: item === "→" ? 16 : 11,
              color: item === "→" ? "#374151" : i === 6 ? "#4ade80" : "#9ca3af",
              fontFamily: "monospace",
            }}>{item}</div>
          ))}
        </div>
      </div>

      {/* Environment cards */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 48px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {envs.map(e => {
          const t     = THEMES[e.key];
          const score = scores[e.key];
          const { label, color } = getRiskLabel(score);
          return (
            <button key={e.key} onClick={() => onNav(e.key)} style={{
              background: t.surface, border: `1px solid ${t.border}`, borderRadius: 18,
              padding: 28, cursor: "pointer", textAlign: "left", transition: "transform 0.2s, border-color 0.2s",
              position: "relative", overflow: "hidden", color: t.text,
            }}
              onMouseEnter={e2 => { e2.currentTarget.style.transform = "translateY(-3px)"; e2.currentTarget.style.borderColor = t.accent; }}
              onMouseLeave={e2 => { e2.currentTarget.style.transform = "";                  e2.currentTarget.style.borderColor = t.border;  }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: t.accent }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <span style={{ fontSize: 36 }}>{e.icon}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "monospace" }}>{score}</div>
                  <div style={{ fontSize: 9, color, fontFamily: "monospace", letterSpacing: 1 }}>{label}</div>
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{e.label}</div>
              <div style={{ fontSize: 12, color: t.muted, marginBottom: 16, lineHeight: 1.5 }}>{e.desc}</div>
              <div style={{ fontSize: 11, color: t.accent, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.accent, display: "inline-block", boxShadow: `0 0 6px ${t.accent}` }} />
                OPEN DASHBOARD →
              </div>
            </button>
          );
        })}
      </div>

      {/* Feature strip */}
      <div style={{ background: "#0e0e1a", borderTop: "1px solid #1a1a2e", padding: "32px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, textAlign: "center" }}>
          {[
            {  label: "Live Simulation",   desc: "Sensor data with realistic noise & drift" },
            {  label: "ML Risk Scoring",   desc: "Predictive health & hazard index" },
            {  label: "Scenario Engine",   desc: "5 scenarios per environment" },
            
          ].map((f, i) => (
            <div key={i} style={{ padding: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#e8e8f8" }}>{f.label}</div>
              <div style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 
function NavBar({ active, onNav }) {
  const pages = [
    { key: "overview",   label: "Overview"  },
    { key: "mine",      label: "Mine"      },
    { key: "hospital",  label: "Hospital"  },
    { key: "industry",  label: "Industry"  },
    { key: "env",       label: "Outdoor"   },
  ];
  const t = active !== "overview" ? THEMES[active] : { accent: "#4ade80", border: "#1a1a2e", bg: "#080810", muted: "#4b5563" };
  return (
    <nav style={{ background: t.bg ?? "#080810", borderBottom: `1px solid ${t.border}`, padding: "0 20px", display: "flex", alignItems: "center", gap: 2, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: t.accent, fontFamily: "monospace", letterSpacing: 1, padding: "12px 16px 12px 0", marginRight: 8, borderRight: `1px solid ${t.border}` }}>
        ENVIROSENSE
      </div>
      {pages.map(p => (
        <button key={p.key} onClick={() => onNav(p.key)} style={{
          padding: "12px 14px", border: "none", background: "transparent",
          color: active === p.key ? t.accent : "#6b7280",
          fontSize: 12, cursor: "pointer", fontFamily: "monospace",
          borderBottom: active === p.key ? `2px solid ${t.accent}` : "2px solid transparent",
          transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>{p.icon}</span>{p.label}
        </button>
      ))}
    </nav>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("overview");
  return (
    <div>
      <NavBar active={page} onNav={setPage} />
      {page === "overview" && <OverviewPage onNav={setPage} />}
      {page === "mine"     && <EnvPage key="mine"     envKey="mine"     />}
      {page === "hospital" && <EnvPage key="hospital" envKey="hospital" />}
      {page === "industry" && <EnvPage key="industry" envKey="industry" />}
      {page === "env"      && <EnvPage key="env"      envKey="env"      />}
    </div>
  );
}
