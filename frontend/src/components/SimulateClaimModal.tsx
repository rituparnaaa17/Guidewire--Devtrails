"use client";

import { useState } from "react";
import {
  Zap,
  CloudRainWind,
  Wind,
  Thermometer,
  Waves,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Info,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser } from "@/lib/auth";
import { useLocationTracker } from "@/hooks/useLocationTracker";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimResult {
  status: "APPROVED" | "SUSPICIOUS" | "HOLD";
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  claimId: string | null;
  claim_blocked: boolean;
  trigger: string;
  zone: string;
  location: string;
  live_verified: boolean;
  payout: number;
  fraud_probability: number;
  fraud_score: number;
  top_factors: string[];
  ml_used: boolean;
  real_weather: { rainfall_mm: number; temp_c: number; description: string; city: string; source: string } | null;
  real_aqi: { aqi: number; category: string; source: string } | null;
  breakdown: {
    weekly_income: number;
    hourly_rate: number;
    disruption_hours: number;
    predicted_income: number;
    net_loss: number;
    coverage_pct: number;
    level_multiplier: number;
  };
  explanation: string[];
}

// ── Config ────────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { id: "rain",  label: "Heavy Rain",  icon: CloudRainWind, color: "blue"   },
  { id: "aqi",   label: "Severe AQI",  icon: Wind,          color: "purple" },
  { id: "heat",  label: "Heatwave",    icon: Thermometer,   color: "orange" },
  { id: "flood", label: "Flash Flood", icon: Waves,         color: "cyan"   },
];

const LEVEL_OPTIONS = [
  { level: 1, label: "Level 1", sub: "1 hour disruption",  mult: "×0.60 payout", chip: "bg-emerald-100 text-emerald-700" },
  { level: 2, label: "Level 2", sub: "2 hour disruption",  mult: "×0.85 payout", chip: "bg-amber-100  text-amber-700"   },
  { level: 3, label: "Level 3", sub: "3 hour disruption",  mult: "×1.00 payout", chip: "bg-rose-100   text-rose-700"    },
];

const COLOR_MAPS: Record<string, Record<string, string>> = {
  blue:   { bg: "bg-blue-50",   ring: "ring-blue-400",   icon: "text-blue-600",   sel: "bg-blue-600 text-white" },
  purple: { bg: "bg-purple-50", ring: "ring-purple-400", icon: "text-purple-600", sel: "bg-purple-600 text-white" },
  orange: { bg: "bg-orange-50", ring: "ring-orange-400", icon: "text-orange-600", sel: "bg-orange-600 text-white" },
  cyan:   { bg: "bg-cyan-50",   ring: "ring-cyan-400",   icon: "text-cyan-600",   sel: "bg-cyan-600 text-white"   },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SimulateClaimModal({ onClose }: { onClose: () => void }) {
  const [step,      setStep]      = useState<"select" | "loading" | "result">("select");
  const [trigger,   setTrigger]   = useState(TRIGGER_OPTIONS[0].id);
  const [level,     setLevel]     = useState(1);
  const [result,    setResult]    = useState<SimResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [loadPhase, setLoadPhase] = useState(0);
  const gps = useLocationTracker();

  const selectedTrigger = TRIGGER_OPTIONS.find((t) => t.id === trigger)!;
  const colors          = COLOR_MAPS[selectedTrigger.color];
  const TriggerIcon     = selectedTrigger.icon;

  // Animated loading messages
  const LOADING_PHASES = [
    "Capturing live GPS...",
    "Fetching real-time weather data...",
    "Evaluating trigger thresholds...",
    "Running XGBoost fraud model...",
    "Generating claim decision...",
  ];

  const runSimulation = async () => {
    const user = getUser() as Record<string, string> | null;
    if (!user?.id) {
      setError("Please log in to simulate a claim.");
      return;
    }

    setStep("loading");
    setError(null);

    // Capture GPS first
    let coords: { lat?: number; lon?: number } = {};
    try {
      const pos = await gps.captureLocation();
      coords = { lat: pos.lat, lon: pos.lon };
    } catch {
      // GPS denied or unavailable — continue without coords
    }

    let phase = 0;
    const ticker = setInterval(() => {
      phase = Math.min(phase + 1, LOADING_PHASES.length - 1);
      setLoadPhase(phase);
    }, 700);

    try {
      const res = await fetch(apiUrl("/api/triggers/simulate"), {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() as Record<string,string>) },
        body: JSON.stringify({
          user_id:      user.id,
          trigger_type: trigger,
          level,
          ...coords,           // real GPS if available
        }),
      });

      clearInterval(ticker);
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Simulation failed. Please try again.");
        setStep("select");
        return;
      }

      setResult(data.data as SimResult);
      setStep("result");
    } catch {
      clearInterval(ticker);
      setError("Cannot reach backend. Make sure the server is running.");
      setStep("select");
    }
  };

  return (
    // ── Backdrop ──────────────────────────────────────────────────────────────
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-lg rounded-[2rem] border border-white/70 bg-white shadow-[0_40px_100px_-30px_rgba(15,23,42,0.35)] overflow-hidden">

        {/* ── Close ── */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ══════════════ STEP: SELECT ══════════════ */}
        {step === "select" && (
          <div className="p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/25">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-black tracking-tight text-slate-900">Simulate Claim</p>
                <p className="text-xs font-semibold text-slate-500">Demo mode — no real money moved</p>
              </div>
            </div>

            {/* GPS status badge */}
            <div className={`mb-5 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold border ${
              gps.isVerified
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : gps.error
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                gps.isVerified ? 'bg-emerald-500 animate-pulse' : gps.error ? 'bg-amber-400' : 'bg-blue-400 animate-pulse'
              }`} />
              {gps.isVerified
                ? `📍 GPS captured: ${gps.locationLabel}`
                : gps.error
                ? `⚠️ ${gps.error} — weather will use zone data`
                : '📍 Getting your live location...'}
            </div>

            {/* Trigger type */}
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 mb-3">Trigger Type</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {TRIGGER_OPTIONS.map((opt) => {
                const c   = COLOR_MAPS[opt.color];
                const Icon = opt.icon;
                const sel  = opt.id === trigger;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTrigger(opt.id)}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                      sel
                        ? `${c.sel.replace("bg-", "border-").replace("text-white","border-2")} ${c.bg} border-current ring-2 ${c.ring}/40`
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${sel ? c.icon : "text-slate-400"}`} />
                    <span className={`text-sm font-bold ${sel ? "text-slate-900" : "text-slate-600"}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Level */}
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 mb-3">Severity Level</p>
            <div className="space-y-2 mb-6">
              {LEVEL_OPTIONS.map((opt) => {
                const sel = opt.level === level;
                return (
                  <button
                    key={opt.level}
                    onClick={() => setLevel(opt.level)}
                    className={`w-full flex items-center justify-between rounded-2xl border-2 px-4 py-3 transition-all ${
                      sel
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                        sel ? "bg-white text-slate-900" : "bg-slate-200 text-slate-600"
                      }`}>{opt.level}</span>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${sel ? "text-white" : "text-slate-800"}`}>{opt.label}</p>
                        <p className={`text-xs ${sel ? "text-slate-300" : "text-slate-500"}`}>{opt.sub}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      sel ? "bg-white/20 text-white" : opt.chip
                    }`}>{opt.mult}</span>
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              onClick={runSimulation}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 hover:-translate-y-0.5 hover:shadow-xl transition-all"
            >
              <Zap className="h-5 w-5" />
              Run Simulation
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* ══════════════ STEP: LOADING ══════════════ */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center p-12 gap-6 min-h-[380px]">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-40" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/30">
                <Loader2 className="h-7 w-7 text-white animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-black text-slate-900">Processing claim...</p>
              <p className="text-sm font-medium text-blue-600 animate-pulse">{LOADING_PHASES[loadPhase]}</p>
            </div>
            <div className="w-full max-w-xs space-y-1.5">
              {LOADING_PHASES.map((msg, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs transition-all ${
                  i <= loadPhase ? "text-slate-700" : "text-slate-300"
                }`}>
                  {i < loadPhase ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : i === loadPhase ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-600 shrink-0 animate-spin" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-slate-200 shrink-0" />
                  )}
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ STEP: RESULT ══════════════ */}
        {step === "result" && result && (
          <div className="p-7 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className={`rounded-[1.6rem] p-5 mb-4 ${
              result.risk_level === "LOW"
                ? "bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200"
                : result.risk_level === "MEDIUM"
                ? "bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200"
                : "bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-200"
            }`}>
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  result.risk_level === "LOW"
                    ? "bg-emerald-100 text-emerald-600"
                    : result.risk_level === "MEDIUM"
                    ? "bg-amber-100 text-amber-600"
                    : "bg-rose-100 text-rose-600"
                }`}>
                  {result.risk_level === "LOW"
                    ? <ShieldCheck className="h-7 w-7" />
                    : <AlertTriangle className="h-7 w-7" />}
                </div>
                <div className="flex-1 min-w-0">
                  {result.risk_level === "LOW" ? (
                    <>
                      <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Claim Approved 🎉</p>
                      <p className="text-3xl font-black text-slate-900 mt-0.5">₹{result.payout.toFixed(0)} credited</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {result.live_verified ? '📍' : '🗺'} {result.location || result.zone} · {result.trigger}
                      </p>
                      {result.claimId && (
                        <p className="text-[10px] text-emerald-600 mt-1 font-medium">Payout recorded → visible in Payouts tab</p>
                      )}
                    </>
                  ) : result.risk_level === "MEDIUM" ? (
                    <>
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Held for Review</p>
                      <p className="text-2xl font-black text-slate-900 mt-0.5">₹{result.payout.toFixed(0)} on hold</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {result.live_verified ? '📍' : '🗺'} {result.location || result.zone} · {result.trigger}
                      </p>
                      {result.claimId && (
                        <p className="text-[10px] text-amber-600 mt-1 font-medium">Claim recorded → pending manual review in Payouts tab</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold uppercase tracking-widest text-rose-600">🚨 Fraud Detected — Claim Rejected</p>
                      <p className="text-2xl font-black text-slate-900 mt-0.5">Claim Not Created</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {result.live_verified ? '📍' : '🗺'} {result.location || result.zone} · {result.trigger}
                      </p>
                      <p className="text-[10px] text-rose-600 mt-1 font-medium">HIGH fraud risk — no payout record was created</p>
                    </>
                  )}
                </div>
              </div>

              {/* ML Fraud Meter */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-flex h-2 w-2 rounded-full ${result.ml_used ? "bg-blue-500 animate-pulse" : "bg-slate-400"}`} />
                    {result.ml_used ? "XGBoost ML score" : "Rule-based score (fallback)"}
                  </span>
                  <span className={`font-black ${
                    result.risk_level === "LOW" ? "text-emerald-600"
                    : result.risk_level === "MEDIUM" ? "text-amber-600"
                    : "text-rose-600"
                  }`}>
                    {(result.fraud_probability * 100).toFixed(1)}% fraud probability
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/70 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      result.risk_level === "LOW" ? "bg-emerald-500"
                      : result.risk_level === "MEDIUM" ? "bg-amber-500"
                      : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(result.fraud_probability * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>LOW (0–30%)</span><span>MEDIUM (30–60%)</span><span>HIGH (60%+)</span>
                </div>
              </div>
            </div>

            {/* ML Top Factors */}
            {result.top_factors && result.top_factors.length > 0 && (
              <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4 mb-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Zap className="h-4 w-4 text-purple-500" />
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-purple-600">ML Risk Signals</p>
                </div>
                <ul className="space-y-1.5">
                  {result.top_factors.map((factor, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-600 text-[10px] font-bold shrink-0">{i + 1}</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Real Weather Data */}
            {(result.real_weather || result.real_aqi) && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 mb-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <CloudRainWind className="h-4 w-4 text-sky-500" />
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Real Weather at Your Location</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-600">
                    {result.real_weather?.source === 'openweathermap-live' ? '🛰 Live API' : '📊 Zone data'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {result.real_weather && [
                    { label: "Rainfall",    value: `${result.real_weather.rainfall_mm} mm/h` },
                    { label: "Temperature", value: `${result.real_weather.temp_c}°C`          },
                    { label: "Conditions",  value: result.real_weather.description             },
                  ].map((row) => (
                    <div key={row.label} className="rounded-xl bg-white p-2.5 shadow-sm text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{row.label}</p>
                      <p className="text-xs font-black text-slate-900 mt-0.5 capitalize">{row.value}</p>
                    </div>
                  ))}
                  {result.real_aqi && (
                    <div className="rounded-xl bg-white p-2.5 shadow-sm text-center col-span-3 flex gap-4 items-center justify-center">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">AQI</p>
                      <p className={`text-sm font-black ${result.real_aqi.aqi > 200 ? 'text-rose-600' : result.real_aqi.aqi > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {result.real_aqi.aqi} — {result.real_aqi.category}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payout Breakdown */}
            <div className="rounded-2xl bg-slate-50 p-4 mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400 mb-3">Payout Breakdown</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Weekly Income",  value: `₹${result.breakdown.weekly_income.toFixed(0)}`   },
                  { label: "Hourly Rate",    value: `₹${result.breakdown.hourly_rate.toFixed(2)}`     },
                  { label: "Disruption",     value: `${result.breakdown.disruption_hours}h`            },
                  { label: "Predicted Loss", value: `₹${result.breakdown.predicted_income.toFixed(2)}`},
                  { label: "Coverage",       value: `${result.breakdown.coverage_pct}%`                },
                  { label: "Multiplier",     value: `×${result.breakdown.level_multiplier}`           },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{row.label}</p>
                    <p className="text-sm font-black text-slate-900 mt-0.5">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Explanation */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-blue-500" />
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Decision Reasoning</p>
              </div>
              <ul className="space-y-1.5">
                {result.explanation.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setStep("select"); setResult(null); setLoadPhase(0); }}
                className="flex-1 h-12 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition"
              >
                Simulate Again
              </button>
              {result.claimId && (
                <a
                  href="/claims"
                  className="flex-1 h-12 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition"
                >
                  View in Payouts
                </a>
              )}
              <button
                onClick={onClose}
                className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
