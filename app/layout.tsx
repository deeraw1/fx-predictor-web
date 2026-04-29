import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NGN/USD Exchange Rate Predictor",
  description: "EWMA trend and volatility models on CBN FX data — naira-dollar forecasts, macro drivers, regime detection",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
