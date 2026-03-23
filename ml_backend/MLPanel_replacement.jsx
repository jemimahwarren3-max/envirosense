// ─── ML PANEL (Real Python Backend) ─────────────────────────────
// Paste this REPLACEMENT for the MLPanel function in App.jsx
// It fetches real predictions from the FastAPI server

function MLPanel({ envKey, readings, scenarioIdx, theme }) {
  const [mlResult, setMlResult] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);

  useEffect(() => {
    // Skip fetch if no readings yet
    if (!readings || Object.keys(readings).length === 0) return;

    const controller = new AbortController();

    fetch("http://localhost:8000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env: envKey, readings, scenario: scenarioIdx }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        setMlResult(data);
        setLoading(false);
        setError(false);
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [readings, envKey, scenarioIdx]);

  // ── while loading first result ──
  if (loading) return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent, animation: "pulse 1s infinite" }} />
      <span style={{ fontSize: 12, color: theme.muted, fontFamily: "monospace" }}>Connecting to ML engine...</span>
    </div>
  );

  // ── if Python server isn't running ──
  if (error) return (
    <div style={{ background: theme.card, border: `1px solid #3d1a1a`, borderRadius: 16, padding: 24 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: theme.muted, fontFamily: "monospace", marginBottom: 12 }}>ML Predictive Engine</div>
      <div style={{ fontSize: 13, color: "#ef4444", fontFamily: "monospace", marginBottom: 8 }}>⚠ Python server not running</div>
      <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.7 }}>
        Start the backend:<br />
        <span style={{ color: theme.accent }}>cd ml_backend</span><br />
        <span style={{ color: theme.accent }}>uvicorn main:app --reload</span>
      </div>
    </div>
  );

  const { risk_score, risk_label, maintenance_risk, anomaly_prob, feature_importance, confidence } = mlResult;

  const riskColor =
    risk_score < 25 ? "#4ade80" :
    risk_score < 50 ? "#fbbf24" :
    risk_score < 75 ? "#f97316" : "#ef4444";

  const recommendation =
    risk_score < 25 ? "✓ Conditions nominal. Continue standard monitoring." :
    risk_score < 50 ? "⚠ Minor deviations detected. Increase check frequency." :
    risk_score < 75 ? "⚡ Elevated risk. Prepare intervention. Alert supervisor." :
                      "🚨 CRITICAL THRESHOLD. Initiate emergency protocol immediately.";

  const featureEntries = Object.entries(feature_importance || {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: theme.muted, fontFamily: "monospace" }}>
          ML Predictive Engine
        </div>
        <div style={{ fontSize: 9, color: "#4ade80", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          LIVE · {Math.round(confidence * 100)}% conf.
        </div>
      </div>

      {/* Gauge + scores */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center", marginBottom: 24 }}>
        <GaugeRing score={risk_score} />
        <div>
          <div style={{ fontSize: 10, color: theme.muted, marginBottom: 4, fontFamily: "monospace", letterSpacing: 2 }}>HEALTH RISK SCORE</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: riskColor, fontFamily: "monospace", marginBottom: 12 }}>{risk_score} / 100</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: theme.surface, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: theme.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 2 }}>MAINT. RISK</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: maintenance_risk > 50 ? "#f97316" : "#4ade80", fontFamily: "monospace" }}>{maintenance_risk}%</div>
            </div>
            <div style={{ background: theme.surface, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, color: theme.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 2 }}>ANOMALY</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: anomaly_prob > 30 ? "#ef4444" : "#4ade80", fontFamily: "monospace" }}>{anomaly_prob}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature importance */}
      {featureEntries.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 2, color: theme.muted, fontFamily: "monospace", marginBottom: 10, textTransform: "uppercase" }}>
            Feature Importance
          </div>
          {featureEntries.map(([fname, imp], i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: theme.text, textTransform: "uppercase" }}>{fname}</span>
                <span style={{ fontSize: 11, color: theme.accent, fontFamily: "monospace" }}>{imp}%</span>
              </div>
              <div style={{ height: 3, background: theme.border, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${imp}%`, background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`, borderRadius: 3, transition: "width 0.8s ease" }} />
              </div>
            </div>
          ))}
        </>
      )}

      {/* Recommendation */}
      <div style={{ marginTop: 16, padding: "10px 14px", background: `${riskColor}18`, border: `1px solid ${riskColor}40`, borderRadius: 8 }}>
        <div style={{ fontSize: 10, color: theme.muted, fontFamily: "monospace", marginBottom: 4, letterSpacing: 1 }}>MODEL RECOMMENDATION</div>
        <div style={{ fontSize: 12, color: riskColor, fontFamily: "monospace", lineHeight: 1.5 }}>{recommendation}</div>
      </div>
    </div>
  );
}
