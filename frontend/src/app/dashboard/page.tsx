"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  ShieldCheck,
  Search,
  MapPin,
  FileText,
  RefreshCw,
  LifeBuoy,
  Clock,
  CheckCircle2,
  TrendingDown,
  CloudRainWind,
  AlertTriangle,
  History,
  Activity,
  MapPinned,
  MessageCircle,
  Wallet,
  Sparkles,
  Gauge,
  CircleDashed,
  ArrowUpRight,
  Zap,
  ShieldAlert,
  BarChart3,
  SlidersHorizontal,
  ChevronRight,
  Thermometer,
  Wind,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FadeUp, StaggeredFadeUp, HoverLift } from "@/components/animated/FadeUp";
import { HeroBackground } from "@/components/animated/HeroBackground";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
import { useState, useEffect, useCallback } from "react";
const earningsChartData = [
  { day: "Mon", earnings: 400 },
  { day: "Tue", earnings: 600 },
  { day: "Wed", earnings: 350 },
  { day: "Thu", earnings: 800 },
  { day: "Fri", earnings: 0 },
  { day: "Sat", earnings: 0 },
  { day: "Sun", earnings: 0 },
];
import { apiUrl } from "@/lib/api";
import SimulateClaimModal from "@/components/SimulateClaimModal";
import { getUser, authHeaders, isLoggedIn, clearAuth } from "@/lib/auth";
import { useLocationTracker } from "@/hooks/useLocationTracker";

const sidebarLinks = [
  { href: "/dashboard", label: "Home", icon: Activity, active: true },
  { href: "/plans", label: "My Policy", icon: ShieldCheck },
  { href: "/claims", label: "Payouts", icon: Wallet },
  { href: "/zone-map", label: "Zone Map", icon: MapPinned },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

const weeklyEarnings = earningsChartData.map((item, index) => ({
  day: item.day,
  income: item.earnings,
  protection: index === 4 || index === 5 || index === 6 ? 0 : item.earnings,
}));

// All DB plan tier values resolve to the single Dynamic Coverage label
const TIER_TO_NAME: Record<string, string> = {
  basic:    "Basic Plan",
  standard: "Standard Plan",
  premium:  "Premium Plan",
};

const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
};

interface WeatherData {
  rainfall_mm: number;
  temp_c: number;
  description: string;
  city: string;
  source: string;
}
interface AqiData {
  aqi: number;
  category: string;
  source: string;
}

const getAqiColor = (aqi: number) => {
  if (aqi > 300) return { text: "text-red-400", label: "Hazardous" };
  if (aqi > 200) return { text: "text-rose-400", label: "Very Unhealthy" };
  if (aqi > 150) return { text: "text-orange-400", label: "Unhealthy" };
  if (aqi > 100) return { text: "text-amber-400", label: "Sensitive Groups" };
  if (aqi > 50)  return { text: "text-yellow-400", label: "Moderate" };
  return { text: "text-emerald-400", label: "Good" };
};

export default function DashboardPage() {
  const [liveTrigger, setLiveTrigger] = useState<any>(null);
  const [user, setUser] = useState({
    id: "",
    name: "Rahul",
    city: "Bengaluru",
    zone: "Koramangala",
  });
  const [plan, setPlan] = useState({
    name: "Standard Plan",
    price: 85,
    cap: 4500,
    coverage: 70,
    triggers: "Heavy Rain, Flood, Severe AQI, Heatwave",
    renewalDate: "Dec 12, 2026",
    riskScore: null as number | null,
    explanation: "",
  });
  const [isPaused, setIsPaused]       = useState(false);
  const [showSim,  setShowSim]        = useState(false);
  const [weather,  setWeather]        = useState<WeatherData | null>(null);
  const [aqi,      setAqi]            = useState<AqiData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const location = useLocationTracker();

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(apiUrl(`/api/weather/live?lat=${lat}&lon=${lon}`));
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.weather) setWeather(data.data.weather);
        if (data.data.aqi)     setAqi(data.data.aqi);
      }
    } catch (err) {
      console.error("Weather fetch error:", err);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = "/get-started"; return; }

    let userZone = "Koramangala";
    let userId = "";

    try {
      const parsed = getUser() as Record<string, string> | null;
      if (parsed) {
        userId = parsed.id || "";
        userZone = parsed.zone || "Koramangala";
        setUser({
          id: userId,
          name: String(parsed.name || "There").split(" ")[0],
          city: parsed.city || "Bengaluru",
          zone: parsed.zone || "Koramangala",
        });
      }

      const storedPlan = localStorage.getItem("shieldpay_plan");
      if (storedPlan) {
        const parsedPlan = JSON.parse(storedPlan);
        setPlan((current) => ({
          ...current,
          name:        parsedPlan.name || current.name,
          price:       Number(parsedPlan.price ?? current.price),
          cap:         Number(parsedPlan.cap ?? current.cap),
          coverage:    Number(parsedPlan.coverage ?? current.coverage),
          triggers:    parsedPlan.triggers || current.triggers,
          renewalDate: parsedPlan.renewalDate || current.renewalDate,
          riskScore:   parsedPlan.riskScore ?? current.riskScore,
          explanation: parsedPlan.explanation || current.explanation,
        }));
      }
    } catch (e) { /* ignore */ }

    // Fetch live policy (JWT-protected)
    fetch(apiUrl("/api/policies/user"), { headers: authHeaders() as HeadersInit })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data && data.data.length > 0) {
          const p = data.data[0];
          const tier = p.planTier || "standard";
          const triggers = Array.isArray(p.coverageTriggers)
            ? p.coverageTriggers.join(", ")
            : typeof p.coverageTriggers === "string"
            ? p.coverageTriggers
            : "Heavy Rain, Flood";

          const getCoveragePct = (t: string) => {
            if (t === 'basic') return 50;
            if (t === 'premium') return 85;
            return 70;
          };

          const livePolicy = {
            name:        TIER_TO_NAME[tier] || "Standard Plan",
            price:       Number(p.finalPremium ?? 85),
            cap:         Number(p.coverageAmount ?? 4500),
            coverage:    getCoveragePct(tier),
            triggers,
            renewalDate: fmtDate(p.validUntil) || "Dec 12, 2026",
            riskScore:   p.riskScore   ?? null,
            explanation: p.explanation ?? "",
          };
          setPlan(livePolicy);
          localStorage.setItem("shieldpay_plan", JSON.stringify({
            ...livePolicy, planTier: tier,
            policyNumber: p.policyNumber || "",
            validFrom:    p.validFrom    || "",
            validUntil:   p.validUntil   || "",
            city:         p.city         || "",
            zone:         p.zoneName     || "",
          }));
        }
      })
      .catch((err) => console.error("Policy fetch error:", err));

    // Fetch active live trigger for user's zone
    fetch(apiUrl("/api/triggers/active"))
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data && data.data.length > 0) {
          const zoneName = userZone || "Koramangala";
          const active = data.data.find((t: { zone_name?: string; zoneName?: string }) =>
            (t.zone_name || t.zoneName) === zoneName
          );
          if (active) {
            setLiveTrigger({
              id: active.id,
              type: active.triggerType || active.trigger_type,
              city: active.city || zoneName,
              zone: active.zoneName || active.zone_name || zoneName,
              severity: Number(active.severity ?? 50),
              status: active.status,
            });
          } else {
            setLiveTrigger(null);
          }
        }
      })
      .catch((err) => console.error("Trigger fetch error:", err));

    // Fetch recent claims
    fetch(apiUrl("/api/claims/user"), { headers: authHeaders() as HeadersInit })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setRecentClaims(data.data.slice(0, 2)); // Top 2 recent
        }
      })
      .catch((err) => console.error("Claims fetch error:", err));

    // Try geolocation for real weather
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetchWeather(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Fallback: Bengaluru coords
          fetchWeather(12.9352, 77.6245);
        },
        { timeout: 8000 }
      );
    } else {
      fetchWeather(12.9352, 77.6245);
    }
  }, [fetchWeather]);

  const aqiMeta = aqi ? getAqiColor(aqi.aqi) : null;

  return (
    <div 
      className="min-h-screen relative text-white bg-cover bg-center bg-fixed"
      style={{ backgroundImage: 'url("/delivery-bg.png")' }}
    >
      {/* Sleek dark gradient overlay with subtle blur to keep the UI legible while showing the city/rider background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1628]/80 via-[#0c1f4a]/75 to-[#07132e]/95 backdrop-blur-[4px] pointer-events-none z-0" />

      <div className="mx-auto flex min-h-screen max-w-[1720px] gap-5 px-4 py-4 sm:px-6 lg:px-8 relative z-10">
        {/* ── Sidebar ── */}
        <aside className="hidden xl:flex w-[280px] shrink-0 flex-col rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="flex items-center gap-3 pb-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-600/30">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-white">ShieldPay</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-blue-300/70">Income protection</p>
            </div>
          </div>

          <div className="space-y-2">
            {sidebarLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                    item.active
                      ? "bg-blue-600/80 text-white shadow-lg shadow-blue-900/30 border border-blue-400/30"
                      : "text-blue-200/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex min-w-0 flex-1 flex-col gap-5 pb-8">
          {/* Mobile top bar */}
          <div className="xl:hidden flex items-center justify-between rounded-[1.6rem] border border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-600/25">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-black tracking-tight text-white">ShieldPay</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-300/60">Dashboard</p>
              </div>
            </div>
            <Link href="/settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {user.name.charAt(0)}
            </Link>
          </div>

          {/* Header bar */}
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/5 px-5 py-5 shadow-lg backdrop-blur-xl sm:px-6">
            <FadeUp className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">
                <Zap className="h-4 w-4" /> Live coverage
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Hello, {user.name}!
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-blue-200/70 sm:text-base">
                Your policy and payout updates stay in one calm, readable workspace. Coverage is active for {user.city}, {user.zone}.
              </p>

              {/* Live Location Banner */}
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all"
                style={location.isVerified
                  ? { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.4)', color: '#34d399' }
                  : location.error
                  ? { background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.4)', color: '#fbbf24' }
                  : { background: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.4)', color: '#60a5fa' }}>
                <span className={`h-2 w-2 rounded-full ${
                  location.isVerified ? 'bg-emerald-400 animate-pulse'
                  : location.error ? 'bg-amber-400'
                  : 'bg-blue-400 animate-pulse'
                }`} />
                {location.isVerified
                  ? `📍 Location Verified: ${location.locationLabel || user.city}`
                  : location.error
                  ? `⚠️ ${location.error} — using registered zone`
                  : '📍 Detecting your location...'}
              </div>
            </FadeUp>

            <div className="flex w-full max-w-2xl flex-1 flex-col gap-3 sm:flex-row sm:items-center justify-end">
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-blue-200 shadow-sm transition hover:border-blue-400/40 hover:text-blue-400">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-[#0c1f4a] bg-rose-500" />
                </button>
                <Link href="/settings" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-900/30">
                  {user.name.charAt(0)}
                </Link>
              </div>
            </div>
          </div>

          {/* Mobile nav pills */}
          <div className="xl:hidden flex gap-2 overflow-x-auto pb-1">
            {sidebarLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                    item.active
                      ? "border-blue-500/50 bg-blue-600/70 text-white"
                      : "border-white/10 bg-white/5 text-blue-200/70"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-5 min-w-0">
              <FadeUp>
                {/* Hero card */}
                <div className="relative overflow-hidden rounded-[2rem] border border-blue-500/20 bg-gradient-to-br from-blue-900/60 via-indigo-900/50 to-slate-900/60 p-6 shadow-[0_28px_80px_-36px_rgba(37,99,235,0.5)] sm:p-7 backdrop-blur-xl">
                  <div className="pointer-events-none absolute -right-10 -top-12 h-52 w-52 rounded-full bg-blue-500/10 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-16 right-8 h-72 w-72 rounded-full bg-indigo-600/10 blur-3xl" />

                  <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.9fr)]">
                    {/* ── Left: Weather Widget ── */}
                    <div>
                      {liveTrigger ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-200 shadow-sm backdrop-blur mb-5">
                          <CloudRainWind className="h-4 w-4 text-blue-400" /> {liveTrigger.type} detected in {liveTrigger.city} ({liveTrigger.severity}/100)
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-blue-200/70 shadow-sm backdrop-blur mb-5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Normal conditions in {user.zone}
                        </div>
                      )}

                      {/* ── REAL WEATHER WIDGET ── */}
                      <div className="rounded-[1.5rem] border border-blue-400/20 bg-white/6 backdrop-blur-xl p-5 shadow-inner">
                        {/* Title row */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <CloudRainWind className="h-4 w-4 text-blue-400" />
                            <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-300">Real Weather at Your Location</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                            weather?.source === 'openweathermap-live'
                              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                              : 'bg-blue-500/15 border-blue-400/30 text-blue-300'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${weather?.source === 'openweathermap-live' ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
                            {weather?.source === 'openweathermap-live' ? 'Live API' : 'Loading...'}
                          </span>
                        </div>

                        {weatherLoading ? (
                          <div className="grid grid-cols-3 gap-3">
                            {[1,2,3].map(i => (
                              <div key={i} className="rounded-xl bg-white/5 p-4 animate-pulse">
                                <div className="h-2 bg-white/10 rounded mb-2" />
                                <div className="h-4 bg-white/10 rounded" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              {/* Rainfall */}
                              <div className="rounded-xl bg-white/6 border border-white/8 p-3.5 text-center shadow-sm">
                                <div className="flex items-center justify-center gap-1 mb-1.5">
                                  <Droplets className="h-3 w-3 text-blue-400" />
                                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-300/70">Rainfall</p>
                                </div>
                                <p className="text-sm font-black text-white">
                                  {weather ? `${weather.rainfall_mm} Mm/H` : '— Mm/H'}
                                </p>
                              </div>
                              {/* Temperature */}
                              <div className="rounded-xl bg-white/6 border border-white/8 p-3.5 text-center shadow-sm">
                                <div className="flex items-center justify-center gap-1 mb-1.5">
                                  <Thermometer className="h-3 w-3 text-orange-400" />
                                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-300/70">Temperature</p>
                                </div>
                                <p className="text-sm font-black text-white">
                                  {weather ? `${weather.temp_c}°C` : '—°C'}
                                </p>
                              </div>
                              {/* Conditions */}
                              <div className="rounded-xl bg-white/6 border border-white/8 p-3.5 text-center shadow-sm">
                                <div className="flex items-center justify-center gap-1 mb-1.5">
                                  <Wind className="h-3 w-3 text-cyan-400" />
                                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-300/70">Conditions</p>
                                </div>
                                <p className="text-sm font-black text-white capitalize">
                                  {weather ? weather.description : '—'}
                                </p>
                              </div>
                            </div>

                            {/* AQI row */}
                            {aqi && (
                              <div className="rounded-xl bg-white/6 border border-white/8 px-4 py-3 flex items-center justify-center gap-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/60">AQI</p>
                                <p className={`text-base font-black ${aqiMeta?.text ?? 'text-white'}`}>
                                  {aqi.aqi} — {aqi.category}
                                </p>
                              </div>
                            )}
                            {weather?.city && (
                              <p className="mt-2 text-center text-[10px] text-blue-300/40 font-medium">
                                📍 {weather.city}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          onClick={() => setIsPaused(!isPaused)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-blue-100 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"
                        >
                          <CircleDashed className={`h-4 w-4 ${isPaused ? 'text-amber-400' : 'text-blue-400'}`} />
                          {isPaused ? "Resume Plan" : "Pause Plan"}
                        </button>
                        <Link
                          href="/plans"
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-blue-100 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"
                        >
                          <FileText className="h-4 w-4 text-blue-400" />
                          My Policy
                        </Link>
                        <button
                          onClick={() => setShowSim(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-600/80 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-blue-500"
                        >
                          <Zap className="h-4 w-4 text-yellow-300" />
                          Simulate Claim
                        </button>
                      </div>
                    </div>

                    {/* ── Right: Policy Status ── */}
                    <div className="rounded-[1.75rem] border border-white/10 bg-white/6 p-5 shadow-lg backdrop-blur-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-blue-300/60">Policy status</p>
                          <p className={`mt-1 text-2xl font-black tracking-tight ${isPaused ? 'text-amber-400' : 'text-white'}`}>
                            {isPaused ? 'Paused' : 'Active'}
                          </p>
                        </div>
                        <Badge className={`rounded-full px-3 py-1.5 border-0 ${
                          isPaused
                            ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/15'
                            : 'bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/15'
                        }`}>
                          {isPaused ? 'Suspended' : 'Live'}
                        </Badge>
                      </div>

                      <div className="mt-5 rounded-2xl bg-white/5 border border-white/8 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300/50">📦 Current Plan</p>
                            <p className="mt-1 text-2xl font-black text-white">{plan.name}</p>
                          </div>
                          <div className="text-right">
                            <Link href="/plans" className="text-[10px] font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 flex items-center gap-1 justify-end mt-1">
                              Change Plan <ChevronRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-2">
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300/50">Premium</p>
                            <p className="mt-1 text-base font-black text-white shrink-0">₹{plan.price}</p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300/50">Coverage</p>
                            <p className="mt-1 text-base font-black text-white shrink-0">{plan.coverage}%</p>
                          </div>
                          <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300/50">Max Cap</p>
                            <p className="mt-1 text-base font-black text-white shrink-0">₹{plan.cap}</p>
                          </div>
                        </div>

                        {/* Risk score row */}
                        {plan.riskScore != null && (
                          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 border border-white/8 px-4 py-2.5">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-300/60">📊 Risk Score</p>
                            <p className={`text-base font-black ${
                              plan.riskScore >= 0.65 ? 'text-red-400'
                              : plan.riskScore >= 0.50 ? 'text-orange-400'
                              : plan.riskScore >= 0.35 ? 'text-amber-400'
                              : 'text-emerald-400'
                            }`}>{plan.riskScore.toFixed(2)}</p>
                          </div>
                        )}

                        {/* Explanation */}
                        {plan.explanation && (
                          <p className="mt-3 text-[11px] leading-5 text-indigo-300/70 font-medium px-1">
                            {plan.explanation}
                          </p>
                        )}

                        <div className="mt-4 rounded-2xl bg-white/5 border border-white/8 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300/50">Covered triggers</p>
                          <p className="mt-2 text-sm font-semibold leading-6 text-blue-100">{plan.triggers}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-blue-600/20 border border-blue-500/25 p-4 sm:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-400">Renewal</p>
                          <p className="mt-1 text-sm font-bold text-white">{plan.renewalDate}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeUp>

              {/* Live Trigger card */}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                {liveTrigger && (
                  <FadeUp delay={0.08}>
                    <div className="rounded-[1.9rem] border border-rose-500/20 bg-rose-900/20 p-6 shadow-lg backdrop-blur-xl">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-300">Live trigger</p>
                          <h2 className="mt-1 text-xl font-black tracking-tight text-white">{liveTrigger.type} in {user.zone}</h2>
                        </div>
                        <Badge className="rounded-full bg-rose-500/20 border border-rose-400/30 px-3 py-1.5 text-rose-300 hover:bg-rose-500/20">LIVE</Badge>
                      </div>

                      <div className="mt-4 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 border border-rose-400/20 text-rose-400">
                            <AlertTriangle className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white">Disruption score {liveTrigger.severity}/100</p>
                            <p className="mt-1 text-sm leading-6 text-blue-200/60">
                              Payout is being calculated automatically based on work hours and policy coverage.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs font-semibold text-blue-300/50">
                          <span>Eligibility scan</span>
                          <span>Under review</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-rose-500/20">
                          <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-rose-500 to-blue-500" />
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {[
                          { label: "Eligible policies",  value: "18",     accent: "text-blue-400" },
                          { label: "Auto claims created", value: "4",     accent: "text-white" },
                          { label: "Fraud checks passed", value: "94%",   accent: "text-emerald-400" },
                          { label: "Avg. payout delay",   value: "< 2 min", accent: "text-indigo-400" },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl bg-white/5 border border-white/8 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300/50">{item.label}</p>
                            <p className={`mt-2 text-2xl font-black ${item.accent}`}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </FadeUp>
                )}
              </div>

              {/* Weekly earnings chart */}
              <FadeUp delay={0.16}>
                <div className="rounded-[1.9rem] border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-400">Earnings protection</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-white">Weekly income overview</h3>
                    </div>
                    <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 text-blue-300">
                      This week
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                    <div className="rounded-[1.7rem] bg-white/4 border border-white/8 p-4">
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={weeklyEarnings} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#7ba9d4', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7ba9d4', fontSize: 12 }} />
                            <RechartsTooltip
                              cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                              contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: '#0c1f4a', boxShadow: '0 16px 40px -20px rgba(0,0,0,0.6)' }}
                              labelStyle={{ color: '#93c5fd' }}
                              itemStyle={{ color: '#e2e8f0' }}
                            />
                            <Bar dataKey="income"     name="Actual earnings"     fill="rgba(148,163,184,0.4)"  radius={[8,8,0,0]} barSize={20} />
                            <Bar dataKey="protection" name="ShieldPay coverage"  fill="#3b82f6"                radius={[8,8,0,0]} barSize={20} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[1.6rem] border border-blue-500/20 bg-blue-600/15 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300/80">Recent Payouts</p>
                          <Link href="/claims" className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1">View all <ChevronRight className="h-3 w-3" /></Link>
                        </div>
                        {recentClaims.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-4 text-center">
                            <Wallet className="h-6 w-6 text-blue-400/50 mb-2" />
                            <p className="text-sm font-semibold text-blue-200/60">No recent payouts</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {recentClaims.map((c) => (
                              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/20 shrink-0">
                                    <CloudRainWind className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{c.event?.triggerType || "Weather Event"}</p>
                                    <p className="text-[10px] uppercase font-bold text-blue-300/60 tracking-wider">
                                      {new Date(c.createdAt).toLocaleDateString("en-IN", { month:"short", day:"numeric" })} • {c.event?.city || user.city}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right flex items-center justify-between sm:block">
                                  <div className="flex items-center gap-1.5 sm:justify-end shrink-0">
                                    {c.status === "paid" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Clock className="h-3.5 w-3.5 text-amber-400" />}
                                    <p className="text-sm font-black text-white shrink-0">₹{c.payoutAmount || 0}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-[1.6rem] bg-white/5 border border-white/8 p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-blue-300/60">Protection ratio</p>
                          <p className="text-sm font-bold text-blue-400">{Math.round((840 / 4930) * 100)}%</p>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-white/10">
                          <div className="h-2 w-[72%] rounded-full bg-gradient-to-r from-blue-500 to-indigo-400" />
                        </div>
                        <p className="mt-3 text-xs leading-5 text-blue-200/40">Your protected baseline helps keep the payout experience predictable and easy to read.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeUp>
            </div>
          </div>
        </main>
      </div>

      {/* Simulate Claim Modal */}
      {showSim && <SimulateClaimModal onClose={() => setShowSim(false)} />}
    </div>
  );
}
