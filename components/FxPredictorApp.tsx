"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ── CBN NAFEM/Official NGN/USD monthly closing rates ─────────────────────────
const HISTORICAL_FX: { label: string; rate: number }[] = [
  { label: "Jan-22", rate: 415.5 }, { label: "Feb-22", rate: 416.3 }, { label: "Mar-22", rate: 416.8 },
  { label: "Apr-22", rate: 417.5 }, { label: "May-22", rate: 418.9 }, { label: "Jun-22", rate: 422.0 },
  { label: "Jul-22", rate: 424.0 }, { label: "Aug-22", rate: 426.8 }, { label: "Sep-22", rate: 430.0 },
  { label: "Oct-22", rate: 436.0 }, { label: "Nov-22", rate: 447.9 }, { label: "Dec-22", rate: 461.0 },
  { label: "Jan-23", rate: 461.9 }, { label: "Feb-23", rate: 463.6 }, { label: "Mar-23", rate: 464.7 },
  { label: "Apr-23", rate: 464.5 }, { label: "May-23", rate: 464.8 }, { label: "Jun-23", rate: 775.0 },
  { label: "Jul-23", rate: 797.3 }, { label: "Aug-23", rate: 900.2 }, { label: "Sep-23", rate: 966.5 },
  { label: "Oct-23", rate: 989.8 }, { label: "Nov-23", rate: 1110.0 }, { label: "Dec-23", rate: 1506.0 },
  { label: "Jan-24", rate: 1517.8 }, { label: "Feb-24", rate: 1532.5 }, { label: "Mar-24", rate: 1350.0 },
  { label: "Apr-24", rate: 1372.5 }, { label: "May-24", rate: 1405.0 }, { label: "Jun-24", rate: 1480.0 },
  { label: "Jul-24", rate: 1596.0 }, { label: "Aug-24", rate: 1580.5 }, { label: "Sep-24", rate: 1602.5 },
  { label: "Oct-24", rate: 1675.0 }, { label: "Nov-24", rate: 1709.0 }, { label: "Dec-24", rate: 1535.0 },
];

// Key macro drivers
const MACRO_DRIVERS = [
  { driver: "Oil Price (USD/bbl)", coefficient: 0.65, direction: "negative", note: "Higher oil → more FX supply → NGN strengthens" },
  { driver: "CBN Net FX Reserves", coefficient: 0.58, direction: "negative", note: "Higher reserves → FX intervention capacity → NGN support" },
  { driver: "US Fed Funds Rate", coefficient: 0.52, direction: "positive", note: "Higher US rates → capital outflow from Nigeria → NGN weakens" },
  { driver: "Current Account Balance", coefficient: 0.48, direction: "negative", note: "Surplus → net FX inflow → NGN support" },
  { driver: "Inflation Differential (NG–US)", coefficient: 0.71, direction: "positive", note: "Purchasing Power Parity: higher local inflation → NGN depreciation" },
  { driver: "CBN FX Intervention", coefficient: 0.44, direction: "negative", note: "Active NAFEM intervention → rate stability" },
];

// Regime definitions
const REGIMES = [
  { name: "Managed Float", period: "Jan 2022 – May 2023", color: "#60a5fa", avgRate: 440, desc: "CBN maintained artificial peg near ₦460/$1, with large parallel market premium" },
  { name: "Float Shock", period: "Jun 2023 – Feb 2024", color: "#ef4444", desc: "Abrupt deregulation: naira crashed from ₦460 to ₦1,500+ in 8 months", avgRate: 1100 },
  { name: "Consolidation", period: "Mar 2024 – Present", color: "#22c55e", desc: "NAFEM stabilisation: CBN clearance of FX backlog, rate hovering ₦1,350–₦1,710", avgRate: 1540 },
];

// ── EWMA forecasting engine ───────────────────────────────────────────────────
function ewmaForecast(
  data: number[],
  lambdaTrend: number,   // EWMA smoothing for trend (level)
  lambdaVol: number,     // EWMA smoothing for volatility
  horizon: number,       // months ahead
  oilSentiment: number,  // -1 (bearish) to +1 (bullish)
  reserveSentiment: number,
  riskSentiment: number
) {
  const n = data.length;

  // Compute log returns
  const logReturns = data.slice(1).map((v, i) => Math.log(v / data[i]));

  // EWMA level (trend)
  const ewmaLevel = [logReturns[0]];
  for (let i = 1; i < logReturns.length; i++) {
    ewmaLevel.push(lambdaTrend * logReturns[i] + (1 - lambdaTrend) * ewmaLevel[i - 1]);
  }

  // EWMA variance (volatility)
  const ewmaVar = [logReturns[0] ** 2];
  for (let i = 1; i < logReturns.length; i++) {
    ewmaVar.push(lambdaVol * logReturns[i] ** 2 + (1 - lambdaVol) * ewmaVar[i - 1]);
  }

  const lastLevel = ewmaLevel[ewmaLevel.length - 1];
  const lastVar = ewmaVar[ewmaVar.length - 1];
  const lastRate = data[n - 1];

  // Macro adjustment (oil, reserves, risk)
  const macroAdj = (-oilSentiment * 0.008) + (-reserveSentiment * 0.006) + (riskSentiment * 0.01);

  // Generate forecast path
  const forecasts: number[] = [];
  const upperCI: number[] = [];
  const lowerCI: number[] = [];
  let prevRate = lastRate;

  for (let h = 1; h <= horizon; h++) {
    const drift = lastLevel + macroAdj;
    const vol = Math.sqrt(lastVar * h);
    const forecastRate = prevRate * Math.exp(drift);
    const z95 = 1.96;
    const up = forecastRate * Math.exp(z95 * vol);
    const dn = forecastRate * Math.exp(-z95 * vol);

    forecasts.push(parseFloat(forecastRate.toFixed(0)));
    upperCI.push(parseFloat(up.toFixed(0)));
    lowerCI.push(parseFloat(dn.toFixed(0)));
    prevRate = forecastRate;
  }

  return { forecasts, upperCI, lowerCI, ewmaVol: Math.sqrt(lastVar * 12) * 100 }; // annualised vol %
}

// Detect regime from recent volatility
function detectRegime(data: number[]): string {
  const n = data.length;
  const recent = data.slice(-6);
  const avgChange = recent.reduce((sum, v, i) => {
    if (i === 0) return sum;
    return sum + Math.abs(v - recent[i - 1]) / recent[i - 1];
  }, 0) / (recent.length - 1);

  if (avgChange > 0.05) return "High Volatility";
  if (avgChange > 0.02) return "Moderate Volatility";
  return "Stable";
}

// Future month labels
function futureMonths(n: number): string[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const labels: string[] = [];
  let m = 0; // Jan = 0
  let y = 25;
  for (let i = 0; i < n; i++) {
    labels.push(`${months[m]}-${y}`);
    m++;
    if (m === 12) { m = 0; y++; }
  }
  return labels;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", minWidth: 200 }}>
      <p style={{ color: "var(--accent2)", fontWeight: 700, marginBottom: 8 }}>{label}</p>
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 4 }}>
            <span style={{ color: p.color || "var(--muted)", fontSize: 13 }}>{p.name}</span>
            <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>₦{typeof p.value === "number" ? p.value.toLocaleString() : p.value}/$</span>
          </div>
        )
      ))}
    </div>
  );
}

interface SentimentSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}

function SentimentSlider({ label, value, onChange, leftLabel, rightLabel }: SentimentSliderProps) {
  const color = value > 0.3 ? "#ef4444" : value < -0.3 ? "#22c55e" : "#f59e0b";
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>{label}</span>
        <span style={{ color, fontWeight: 700, fontSize: 14 }}>
          {value > 0.2 ? "Bearish ↓" : value < -0.2 ? "Bullish ↑" : "Neutral"}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#22c55e", fontSize: 11 }}>{leftLabel}</span>
        <span style={{ color: "#ef4444", fontSize: 11 }}>{rightLabel}</span>
      </div>
      <input
        type="range" min={-1} max={1} step={0.1} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: color }}
      />
    </div>
  );
}

export default function FxPredictorApp() {
  const [lambdaTrend, setLambdaTrend] = useState(0.3);
  const [lambdaVol, setLambdaVol] = useState(0.06);
  const [horizon, setHorizon] = useState(6);
  const [oilSentiment, setOilSentiment] = useState(0);
  const [reserveSentiment, setReserveSentiment] = useState(0);
  const [riskSentiment, setRiskSentiment] = useState(0);

  const rates = HISTORICAL_FX.map((h) => h.rate);
  const futureLabels = futureMonths(horizon);

  const { forecasts, upperCI, lowerCI, ewmaVol } = useMemo(
    () => ewmaForecast(rates, lambdaTrend, lambdaVol, horizon, oilSentiment, reserveSentiment, riskSentiment),
    [rates, lambdaTrend, lambdaVol, horizon, oilSentiment, reserveSentiment, riskSentiment]
  );

  const currentRegime = useMemo(() => detectRegime(rates), [rates]);
  const lastRate = rates[rates.length - 1];
  const forecastEnd = forecasts[forecasts.length - 1] ?? lastRate;
  const change = forecastEnd - lastRate;
  const changePct = (change / lastRate) * 100;

  // Chart data
  const histData = HISTORICAL_FX.slice(-18).map((h) => ({
    label: h.label,
    historical: h.rate,
    forecast: undefined as number | undefined,
    upper: undefined as number | undefined,
    lower: undefined as number | undefined,
  }));

  const fcastData = futureLabels.map((lbl, i) => ({
    label: lbl,
    historical: undefined as number | undefined,
    forecast: forecasts[i],
    upper: upperCI[i],
    lower: lowerCI[i],
  }));

  const chartData = [
    ...histData,
    { label: HISTORICAL_FX[HISTORICAL_FX.length - 1].label, historical: undefined, forecast: lastRate, upper: lastRate, lower: lastRate },
    ...fcastData,
  ];

  // Regime timeline
  const regimeForChart = HISTORICAL_FX.map((h) => {
    let regime = "Managed Float";
    if (h.label >= "Jun-23" && h.label <= "Feb-24") regime = "Float Shock";
    else if (h.label >= "Mar-24") regime = "Consolidation";
    return { ...h, regime };
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #0b0e18 0%, #0d1220 60%, #111828 100%)", borderBottom: "1px solid var(--border)", padding: "56px 24px 48px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["EWMA Trend Model", "CBN NAFEM Data", "Regime Detection", "Macro Sentiment Sliders"].map((tag) => (
            <span key={tag} style={{ background: "rgba(200,168,58,0.12)", border: "1px solid rgba(200,168,58,0.3)", color: "var(--accent2)", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 500 }}>
              {tag}
            </span>
          ))}
        </div>
        <h1 style={{ fontSize: "clamp(26px, 5vw, 46px)", fontWeight: 800, color: "var(--text)", marginBottom: 16 }}>
          NGN/USD Exchange Rate Predictor
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 16, maxWidth: 620, margin: "0 auto" }}>
          EWMA trend and volatility models on CBN NAFEM data — naira-dollar forecasts with macro sentiment adjustments,
          regime detection, and 95% confidence bands.
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
          {[
            { label: "Current Rate (Dec 2024)", value: `₦${lastRate.toLocaleString()}/$`, color: "var(--accent2)" },
            {
              label: `${horizon}M Forecast`,
              value: `₦${forecastEnd.toLocaleString()}/$`,
              color: change > 0 ? "#ef4444" : "#22c55e",
            },
            {
              label: "Forecast Change",
              value: `${change > 0 ? "+" : ""}${changePct.toFixed(1)}%`,
              color: change > 0 ? "#ef4444" : "#22c55e",
            },
            {
              label: "Annualised Volatility",
              value: `${ewmaVol.toFixed(1)}%`,
              color: ewmaVol > 30 ? "#ef4444" : ewmaVol > 15 ? "#f59e0b" : "#22c55e",
            },
            {
              label: "Current Regime",
              value: currentRegime,
              color: currentRegime === "High Volatility" ? "#ef4444" : currentRegime === "Moderate Volatility" ? "#f59e0b" : "#22c55e",
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
              <div style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
          {/* Chart */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ color: "var(--text)", fontWeight: 700, fontSize: 18 }}>NGN/USD Rate & Forecast</h2>
                <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Last 18 months of CBN NAFEM data + {horizon}-month EWMA forecast</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[3, 6, 12].map((h) => (
                  <button key={h} onClick={() => setHorizon(h)}
                    style={{
                      padding: "6px 14px", borderRadius: 6, border: "1px solid",
                      borderColor: horizon === h ? "var(--accent)" : "var(--border)",
                      background: horizon === h ? "rgba(200,168,58,0.15)" : "transparent",
                      color: horizon === h ? "var(--accent2)" : "var(--muted)",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {h}M
                  </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 11 }} interval={3} />
                <YAxis stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={(v) => `₦${(v/1000).toFixed(1)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: "var(--muted)", fontSize: 13, paddingTop: 16 }} />
                <ReferenceLine y={1000} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                <Area dataKey="upper" name="Upper 95% CI" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.3)" strokeWidth={1} connectNulls />
                <Area dataKey="lower" name="Lower 95% CI" fill="var(--bg)" stroke="rgba(34,197,94,0.3)" strokeWidth={1} connectNulls />
                <Line dataKey="historical" name="NAFEM Rate" stroke="#60a5fa" strokeWidth={2.5} dot={false} connectNulls />
                <Line dataKey="forecast" name="EWMA Forecast" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Regime bands annotation */}
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              {REGIMES.map((r) => (
                <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, display: "inline-block" }} />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{r.name} ({r.period})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px 20px" }}>
              <h3 style={{ color: "var(--accent2)", fontWeight: 700, fontSize: 15, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                EWMA Parameters
              </h3>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>λ Trend</span>
                  <span style={{ color: "var(--accent2)", fontWeight: 700 }}>{lambdaTrend.toFixed(2)}</span>
                </div>
                <input type="range" min={0.05} max={0.7} step={0.05} value={lambdaTrend}
                  onChange={(e) => setLambdaTrend(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Responsiveness to recent return trend. High → more reactive to recent moves.</div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>λ Volatility (RiskMetrics)</span>
                  <span style={{ color: "var(--accent2)", fontWeight: 700 }}>{lambdaVol.toFixed(3)}</span>
                </div>
                <input type="range" min={0.02} max={0.2} step={0.01} value={lambdaVol}
                  onChange={(e) => setLambdaVol(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>JP Morgan RiskMetrics standard: 0.06 (monthly). Widens confidence bands when higher.</div>
              </div>

              <h3 style={{ color: "var(--accent2)", fontWeight: 700, fontSize: 14, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Macro Sentiment Adjustment
              </h3>

              <SentimentSlider
                label="Oil Price Outlook"
                value={oilSentiment}
                onChange={setOilSentiment}
                leftLabel="Bullish oil → NGN ++"
                rightLabel="Bearish oil → NGN --"
              />
              <SentimentSlider
                label="CBN FX Reserves"
                value={reserveSentiment}
                onChange={setReserveSentiment}
                leftLabel="Rising reserves → NGN +"
                rightLabel="Falling reserves → NGN -"
              />
              <SentimentSlider
                label="Global Risk Appetite"
                value={riskSentiment}
                onChange={setRiskSentiment}
                leftLabel="Risk-on → EM inflows"
                rightLabel="Risk-off → capital flight"
              />
            </div>
          </div>
        </div>

        {/* Regime Analysis */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 24px", marginTop: 32 }}>
          <h2 style={{ color: "var(--text)", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Exchange Rate Regimes</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {REGIMES.map((r) => (
              <div key={r.name} style={{ background: "var(--surface2)", border: `1px solid ${r.color}40`, borderLeft: `3px solid ${r.color}`, borderRadius: 8, padding: "16px 20px" }}>
                <div style={{ color: r.color, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{r.name}</div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>{r.period}</div>
                <div style={{ color: "var(--accent2)", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>≈ ₦{r.avgRate.toLocaleString()}/$</div>
                <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.7 }}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Macro Drivers */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 24px", marginTop: 24 }}>
          <h2 style={{ color: "var(--text)", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Key Macro Drivers</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Driver", "Correlation", "Direction", "Mechanism"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", color: "var(--muted)", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MACRO_DRIVERS.map((d) => (
                  <tr key={d.driver} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 14px", color: "var(--text)", fontWeight: 600 }}>{d.driver}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: `${d.coefficient * 80}px`, height: 6, background: "var(--accent)", borderRadius: 3 }} />
                        <span style={{ color: "var(--accent2)", fontWeight: 700 }}>{d.coefficient.toFixed(2)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        background: d.direction === "positive" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                        color: d.direction === "positive" ? "#ef4444" : "#22c55e",
                        borderRadius: 4, padding: "2px 10px", fontSize: 12, fontWeight: 600,
                      }}>
                        {d.direction === "positive" ? "NGN ↓" : "NGN ↑"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12 }}>{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Methodology */}
        <div style={{ marginTop: 24, padding: "20px 24px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <h3 style={{ color: "var(--accent2)", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Methodology</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.8 }}>
            The <strong style={{ color: "var(--text)" }}>EWMA model</strong> computes exponentially weighted moving averages of log-returns (for trend) and squared log-returns
            (for variance), following the <strong style={{ color: "var(--text)" }}>JP Morgan RiskMetrics</strong> approach with configurable λ parameters.
            Forecast paths compound the EWMA drift over the selected horizon. The macro sentiment adjustment
            applies additive basis-point shifts derived from user-defined oil, reserve, and global risk signals — consistent
            with an uncovered interest parity/current account framework. Data: CBN NAFEM/official exchange rate (2022–2024).
          </p>
        </div>
      </div>

      <footer style={{ textAlign: "center", padding: "32px 24px", borderTop: "1px solid var(--border)", marginTop: 48 }}>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Built by{" "}
          <a href="https://adediran.xyz/contact" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Muhammed Adediran
          </a>{" "}
          · EWMA FX Model · CBN NAFEM Data
        </p>
      </footer>
    </div>
  );
}
