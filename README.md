# NGN/USD Exchange Rate Predictor

An interactive naira-dollar exchange rate forecasting tool built on EWMA (Exponentially Weighted Moving Average) trend and volatility models, following the JP Morgan RiskMetrics methodology. Trained on 36 months of CBN NAFEM data with macro sentiment adjustment sliders and regime detection.

## What It Does

- Loads 36 months of monthly CBN NAFEM/official NGN/USD closing rates (Jan 2022 – Dec 2024)
- Computes **EWMA log-return trend** (λ trend) and **EWMA variance** (λ volatility / RiskMetrics) on the full series
- Generates 3, 6, and 12-month forecast paths with 95% confidence bands
- Applies macro sentiment adjustments from user-controlled sliders (oil, reserves, global risk)
- Detects current volatility regime: Stable / Moderate / High Volatility
- Maps three historical exchange rate regimes: Managed Float → Float Shock → Consolidation
- Surfaces key macro drivers with correlation coefficients and mechanism descriptions

## Interactive Controls

| Control | Description |
|---|---|
| λ Trend | EWMA smoothing for return trend. Higher = more weight on recent moves. |
| λ Volatility | RiskMetrics standard (0.06 monthly). Widens CI bands when raised. |
| Oil Price Outlook | Bullish oil → NGN strengthens (more FX supply) |
| CBN FX Reserves | Rising reserves → intervention capacity → NGN support |
| Global Risk Appetite | Risk-off → EM capital flight → NGN weakens |

## Regime History

| Regime | Period | Avg Rate |
|---|---|---|
| Managed Float | Jan 2022 – May 2023 | ≈ ₦440/$ |
| Float Shock | Jun 2023 – Feb 2024 | ≈ ₦1,100/$ |
| Consolidation | Mar 2024 – Present | ≈ ₦1,540/$ |

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Recharts** — ComposedChart with Area CI bands
- **Tailwind CSS**
- Pure client-side EWMA computation — no backend

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Data Sources

- CBN Central Bank of Nigeria — NAFEM and official exchange rate data (2022–2024)

---

Built by [Muhammed Adediran](https://adediran.xyz/contact)
