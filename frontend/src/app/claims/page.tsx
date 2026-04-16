"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Activity,
  Search,
  Check,
  Wallet,
  RefreshCw,
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FadeUp, StaggeredFadeUp } from "@/components/animated/FadeUp";
import { apiUrl } from "@/lib/api";
import { authHeaders, isLoggedIn } from "@/lib/auth";

const TRACKER_STEPS = [
  { id: "trigger",     title: "Trigger Detected",   desc: "Weather event confirmed",       status: "completed" },
  { id: "eligibility", title: "Eligibility Checked", desc: "Verified active coverage",      status: "completed" },
  { id: "review",      title: "Under Review",        desc: "Calculating payout amount",     status: "current" },
  { id: "payout",      title: "Payout Initiated",    desc: "Pending bank transfer",         status: "upcoming" },
];

const STATUS_MAP: Record<string, string> = {
  paid:              "Paid",
  under_review:      "Under Review",
  pending:           "Pending",
  declined:          "Declined",
  blocked:           "Blocked",
  soft_verification: "Soft Flag",
  rejected:          "Rejected",
};

const FLAG_LABELS: Record<string, string> = {
  ZONE_NOT_VERIFIED:     "Location mismatch",
  DUPLICATE_CLAIM:       "Duplicate claim (6h window)",
  NO_REAL_TRIGGER:       "No verified trigger event",
  POLICY_TOO_NEW:        "Policy too new (< 24h)",
  RETROACTIVE_CLAIM:     "Retroactive claim",
  TIMEZONE_MISMATCH:     "Timezone mismatch",
  NO_SHIFT_OVERLAP:      "No shift overlap",
  LOW_PPCS:              "Low device trust score",
  HIGH_ACTUAL_INCOME:    "Income too high relative to loss",
  VERY_NEW_ACCOUNT:      "Account created < 7 days ago",
  NEW_ACCOUNT:           "Account created < 14 days ago",
  HIGH_CLAIM_FREQUENCY:  "≥ 4 claims this week",
  ELEVATED_CLAIM_FREQUENCY: "3 claims this week",
  VERY_HIGH_VELOCITY:    "Claim velocity > 2.5×",
  HIGH_VELOCITY:         "Claim velocity 2.0–2.5×",
  ELEVATED_VELOCITY:     "Claim velocity 1.7–2.0×",
  UPI_FRAUD_RING:        "UPI cluster > 20 accounts",
  LOW_GPS_JITTER:        "Suspicious GPS (possible spoofing)",
  NO_MOTION_CONTINUITY:  "No device motion detected",
  CELL_TOWER_MISMATCH:   "Cell tower / GPS mismatch",
  APP_INACTIVE:          "App was inactive at claim time",
  HIGH_ACTUAL_INCOME_EARNED: "High income relative to claim",
};

interface Claim {
  id: string;
  claimRef: string;
  trigger: string;
  date: string;
  amount: number | string;
  status: string;
  riskLevel?: string;
  zone?: string;
  flags?: string[];
  fraudScore?: number;
  ppcsScore?: number;
  blockReason?: string;
  explanation?: string;
}

// ── Blocked Panel ─────────────────────────────────────────────────────────────
const BlockedPanel = ({ claim }: { claim: Claim }) => {
  const [expanded, setExpanded] = useState(false);
  const flagList = (claim.flags ?? []).filter(Boolean);

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-5 flex flex-col gap-4 backdrop-blur-xl relative overflow-hidden">
      {/* Glow */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-red-500/10 blur-3xl" />

      <div className="flex gap-4 items-start relative z-10">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-red-500/15 text-red-400 border border-red-500/20">
          <ShieldOff className="w-6 h-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/25 tracking-wide uppercase">
              🚫 Claim Blocked
            </span>
            <span className="text-xs text-red-300/60 font-medium">{claim.claimRef}</span>
          </div>

          <h4 className="font-bold text-white capitalize mb-0.5 truncate">{claim.trigger}</h4>
          <p className="text-xs text-blue-200/50 font-medium">{claim.date}{claim.zone && ` • ${claim.zone}`}</p>

          {/* Primary reason */}
          {claim.explanation && (
            <p className="text-xs text-red-300/80 mt-2 leading-relaxed line-clamp-2">
              {claim.explanation}
            </p>
          )}
        </div>

        {/* Amount + toggle */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-lg font-black text-red-400/60 line-through">₹{claim.amount}</div>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-xs font-semibold text-red-300/60 hover:text-red-300 transition flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="relative z-10 border-t border-red-500/15 pt-4 space-y-3">
          {/* Scores */}
          <div className="grid grid-cols-2 gap-3">
            {claim.fraudScore !== undefined && (
              <div className="rounded-xl bg-red-900/30 border border-red-500/15 p-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-red-300/50 mb-1">Fraud Score</p>
                <p className="text-2xl font-black text-red-400">{claim.fraudScore}<span className="text-sm font-semibold text-red-400/50">/100</span></p>
              </div>
            )}
            {claim.ppcsScore !== undefined && (
              <div className="rounded-xl bg-white/4 border border-white/8 p-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/50 mb-1">PPCS Trust</p>
                <p className={`text-2xl font-black ${claim.ppcsScore >= 80 ? "text-emerald-400" : claim.ppcsScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                  {claim.ppcsScore}<span className="text-sm font-semibold opacity-50">/100</span>
                </p>
              </div>
            )}
          </div>

          {/* Flags */}
          {flagList.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-red-300/50 mb-2">Fraud Signals Triggered</p>
              <div className="flex flex-wrap gap-2">
                {flagList.map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-900/40 border border-red-500/20 text-red-300"
                  >
                    <XCircle className="w-3 h-3 shrink-0" />
                    {FLAG_LABELS[flag] ?? flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Appeal note */}
          <p className="text-xs text-red-300/40 italic">
            If you believe this is an error, contact support with your claim reference <span className="font-mono text-red-300/60">{claim.claimRef}</span>.
          </p>
        </div>
      )}
    </div>
  );
};

// ── Soft-Flag Panel ───────────────────────────────────────────────────────────
const SoftFlagPanel = ({ claim }: { claim: Claim }) => (
  <div className="rounded-2xl border border-amber-400/20 bg-amber-950/20 p-5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between backdrop-blur-xl hover:border-amber-400/30 transition-all">
    <div className="flex gap-4 items-center">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-400/15 text-amber-400">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="font-bold text-white capitalize">{claim.trigger}</h4>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/25">⚠️ Soft Flag</span>
        </div>
        <p className="text-xs text-blue-200/50 font-medium">{claim.claimRef} • {claim.date}</p>
        <p className="text-xs text-amber-300/60 mt-0.5">2-hour verification hold — payout pending</p>
      </div>
    </div>
    <div className="flex flex-col items-end pl-16 sm:pl-0">
      <div className="text-xl font-black text-white">₹{claim.amount}</div>
      <span className="mt-1 text-xs font-bold px-3 py-1 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/25">Soft Flag</span>
    </div>
  </div>
);

// ── Standard Claim Row ────────────────────────────────────────────────────────
const ClaimRow = ({ claim }: { claim: Claim }) => {
  const statusBadge = (status: string) => {
    switch (status) {
      case "Paid":        return "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25";
      case "Under Review":return "bg-amber-400/15   text-amber-300   border border-amber-400/25";
      case "Pending":     return "bg-blue-400/15    text-blue-300    border border-blue-400/25";
      case "Declined":
      case "Rejected":    return "bg-rose-400/15    text-rose-300    border border-rose-400/25";
      default:            return "bg-white/8        text-blue-200    border border-white/10";
    }
  };

  const iconBg = (status: string) => {
    switch (status) {
      case "Paid":        return "bg-emerald-400/15 text-emerald-400";
      case "Under Review":return "bg-amber-400/15   text-amber-400";
      default:            return "bg-blue-400/15    text-blue-400";
    }
  };

  const Icon = (status: string) => {
    switch (status) {
      case "Paid":        return <CheckCircle2 className="w-6 h-6" />;
      case "Under Review":return <Clock className="w-6 h-6" />;
      default:            return <Activity className="w-6 h-6" />;
    }
  };

  const riskColor = (risk?: string) => {
    if (!risk) return "";
    if (risk === "HIGH")   return "text-rose-400";
    if (risk === "MEDIUM") return "text-amber-400";
    return "text-emerald-400";
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between backdrop-blur-xl hover:border-blue-400/25 hover:bg-white/6 transition-all cursor-pointer">
      <div className="flex gap-4 items-center">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg(claim.status)}`}>
          {Icon(claim.status)}
        </div>
        <div>
          <h4 className="font-bold text-white mb-0.5 capitalize">{claim.trigger}</h4>
          <p className="text-xs text-blue-200/50 font-medium tracking-wide">
            {claim.claimRef} • {claim.date}
            {claim.zone && ` • ${claim.zone}`}
          </p>
          {claim.riskLevel && (
            <p className={`text-xs font-semibold mt-0.5 ${riskColor(claim.riskLevel)}`}>
              ML Risk: {claim.riskLevel}
            </p>
          )}
        </div>
      </div>
      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto pl-16 sm:pl-0">
        <div className="text-xl font-black text-white">₹{claim.amount}</div>
        <span className={`mt-0 sm:mt-1 text-xs font-bold px-3 py-1 rounded-full ${statusBadge(claim.status)}`}>
          {claim.status}
        </span>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClaimsPage() {
  const [filter,      setFilter]      = useState("All");
  const [claims,      setClaims]      = useState<Claim[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [liveTrigger, setLiveTrigger] = useState<any>(null);
  const [userZone,    setUserZone]    = useState("Koramangala");
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const loadClaims = () => {
    setIsLoading(true);
    let zone = "Koramangala";
    try {
      const stored = localStorage.getItem("shieldpay_user");
      if (stored) {
        zone = JSON.parse(stored).zone || "Koramangala";
        setUserZone(zone);
      }
    } catch (_) {}

    // Fetch active triggers
    fetch(apiUrl("/api/triggers/active"))
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data && data.data.length > 0) {
          const active = data.data.find(
            (t: any) => (t.zone_name || t.zoneName) === zone
          );
          if (active) {
            setLiveTrigger({
              type:     active.triggerType || active.trigger_type,
              severity: active.severity_score || active.severity || active.severityScore,
              started:  new Date(active.createdAt || active.created_at).toLocaleDateString(),
            });
          }
        }
      })
      .catch(() => {});

    // Fetch user claims
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isLoggedIn()) Object.assign(headers, authHeaders());

    fetch(apiUrl("/api/claims/user"), { headers: headers as HeadersInit })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const mapped: Claim[] = data.data.map((c: any) => ({
            id:         c.id,
            claimRef:   `CLM-${String(c.id).substring(0, 8).toUpperCase()}`,
            trigger:    c.triggerReason
              || (c.triggerEvent?.triggerType ? `${c.triggerEvent.triggerType}` : "Weather Trigger"),
            date:       new Date(c.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit", month: "short", year: "numeric",
            }),
            amount:     Number(c.payoutAmount ?? 0).toFixed(2),
            status:     STATUS_MAP[c.claimStatus] ?? c.claimStatus ?? "Unknown",
            riskLevel:  c.riskLevel ?? c.fraudRiskLevel,
            zone:       c.triggerEvent?.zone?.zoneName || userZone,
            flags:      Array.isArray(c.fraudReasons) ? c.fraudReasons : [],
            fraudScore: c.fraudScore ?? undefined,
            ppcsScore:  undefined, // not stored on claim row — comes from fraudLog
            blockReason: c.reviewReason ?? undefined,
            explanation: c.explanation ?? undefined,
          }));
          setClaims(mapped);
        } else {
          setClaims([]);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  };

  useEffect(() => { loadClaims(); }, [lastRefresh]);

  const FILTERS = ["All", "Paid", "Under Review", "Soft Flag", "Pending", "Blocked", "Declined"];
  const filteredClaims = filter === "All" ? claims : claims.filter((c) => c.status === filter);

  const blockedCount   = claims.filter((c) => c.status === "Blocked").length;
  const paidCount      = claims.filter((c) => c.status === "Paid").length;
  const reviewCount    = claims.filter((c) => c.status === "Under Review").length;
  const totalPaid      = claims.filter((c) => c.status === "Paid").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,_rgba(30,64,175,0.55),_transparent_40%),radial-gradient(ellipse_at_bottom_right,_rgba(15,23,60,0.9),_transparent_60%),linear-gradient(160deg,_#0a1628_0%,_#0c1f4a_40%,_#07132e_100%)] text-white py-10 px-6">
      <div className="container mx-auto max-w-4xl">

        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-blue-300/70 hover:text-blue-300 mb-8 transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>

        {/* Header */}
        <FadeUp>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/30 border border-blue-400/30">
                <Wallet className="w-6 h-6 text-blue-300" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white">Claims &amp; Payouts</h1>
                <p className="text-sm text-blue-300/60 mt-0.5">Payout history, active claims &amp; fraud decisions</p>
              </div>
            </div>
            <button
              onClick={() => { setIsLoading(true); setLastRefresh(Date.now()); }}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-white/10 transition"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </FadeUp>

        {/* Blocked alert banner (if any blocked claims) */}
        {blockedCount > 0 && (
          <FadeUp delay={0.05}>
            <div className="rounded-2xl border border-red-500/25 bg-red-950/25 px-5 py-4 mb-6 flex items-center gap-3 backdrop-blur-xl">
              <ShieldOff className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm font-semibold text-red-300">
                {blockedCount} claim{blockedCount > 1 ? "s were" : " was"} blocked by the fraud enforcement engine.
                {" "}
                <span className="font-normal text-red-300/60">Click "Blocked" filter to review.</span>
              </p>
            </div>
          </FadeUp>
        )}

        {/* Active Trigger tracker */}
        {liveTrigger && (
          <FadeUp delay={0.1}>
            <div className="rounded-[1.9rem] border border-rose-400/20 bg-rose-900/20 p-8 mb-10 relative overflow-hidden backdrop-blur-xl">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />
              <div className="flex flex-col sm:flex-row justify-between items-start mb-10 relative z-10 gap-4">
                <div>
                  <Badge className="bg-rose-400/15 text-rose-300 border border-rose-400/25 mb-3 hover:bg-rose-400/20">
                    ● In Progress
                  </Badge>
                  <h2 className="text-xl font-bold text-white">{liveTrigger.type} — {userZone}</h2>
                  <p className="text-blue-200/60 mt-1 text-sm font-medium">
                    Auto-Trigger Score: {liveTrigger.severity}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-semibold text-white">Started</p>
                  <p className="text-sm text-blue-200/60 font-medium">{liveTrigger.started}</p>
                </div>
              </div>
              {/* Timeline — Desktop */}
              <div className="relative z-10 hidden sm:block">
                <div className="relative flex items-start justify-between">
                  <div className="absolute top-4 left-0 w-full h-1 bg-white/8 rounded-full z-0" />
                  <div className="absolute top-4 left-0 w-[66%] h-1 bg-blue-500 rounded-full z-0" />
                  {TRACKER_STEPS.map((step, idx) => (
                    <div key={step.id} className="relative z-10 flex flex-col items-center flex-1 text-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-4 border-[3px] transition-colors ${
                        step.status === "completed" ? "bg-blue-500 border-[#0a1628] text-white" :
                        step.status === "current"   ? "bg-[#0a1628] border-blue-400" :
                        "bg-[#0a1628] border-white/15 text-blue-300/40"
                      }`}>
                        {step.status === "completed" && <Check className="w-5 h-5 text-white" />}
                        {step.status === "current"   && <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />}
                        {step.status === "upcoming"  && <span className="text-sm font-bold text-blue-300/40">{idx + 1}</span>}
                      </div>
                      <h4 className={`text-sm font-bold mb-1 ${step.status === "upcoming" ? "text-blue-300/30" : "text-white"}`}>{step.title}</h4>
                      <p className={`text-xs max-w-[120px] ${step.status === "upcoming" ? "text-blue-300/20" : "text-blue-200/60"}`}>{step.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Timeline — Mobile */}
              <div className="relative z-10 sm:hidden pl-4 border-l-2 border-white/8 space-y-6">
                {TRACKER_STEPS.map((step) => (
                  <div key={step.id} className="relative">
                    <div className={`absolute -left-[25px] top-0 w-5 h-5 rounded-full border-2 bg-[#0a1628] flex items-center justify-center ${
                      step.status === "completed" ? "border-blue-500 bg-blue-500 text-white" :
                      step.status === "current"   ? "border-blue-400" : "border-white/15 text-blue-300/40"
                    }`}>
                      {step.status === "completed" && <Check className="w-3 h-3" />}
                      {step.status === "current"   && <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />}
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold ${step.status === "upcoming" ? "text-blue-300/30" : "text-white"}`}>{step.title}</h4>
                      <p className={`text-xs mt-0.5 ${step.status === "upcoming" ? "text-blue-300/20" : "text-blue-200/60"}`}>{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        )}

        {/* Filter chips */}
        <FadeUp delay={0.2} className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-white">Payout History</h3>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-9 px-4 rounded-xl text-sm font-semibold transition-all shrink-0 border ${
                  filter === f
                    ? f === "Blocked"
                      ? "bg-red-600/60 text-white border-red-500/40"
                      : "bg-blue-600/70 text-white border-blue-500/40"
                    : f === "Blocked"
                      ? "bg-red-900/20 text-red-300/70 border-red-500/20 hover:bg-red-900/30 hover:text-red-300"
                      : "bg-white/5 text-blue-200/70 border-white/10 hover:bg-white/10 hover:text-white"
                }`}
              >
                {f}{f === "Blocked" && blockedCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/40 text-[10px] font-black">{blockedCount}</span>
                )}
              </button>
            ))}
          </div>
        </FadeUp>

        {/* Claims list */}
        <StaggeredFadeUp delay={0.3} staggerDelay={0.08} className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-white/8 bg-white/4 p-5 animate-pulse">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-xl bg-white/8" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-white/8 rounded w-1/3" />
                      <div className="h-3 bg-white/5 rounded w-1/4" />
                    </div>
                    <div className="h-6 bg-white/8 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="rounded-[1.9rem] border border-white/8 bg-white/4 p-16 text-center backdrop-blur-xl flex flex-col items-center">
              <div className="w-16 h-16 bg-white/6 border border-white/10 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-blue-300/30" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">No claims found</h4>
              <p className="text-sm text-blue-200/50 max-w-sm mx-auto">
                {filter === "All"
                  ? "Weather triggers will auto-process claims when a HEAVY_RAIN, FLOOD, or AQI event occurs in your zone."
                  : `No claims with status "${filter}" found.`}
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600/70 border border-blue-500/30 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            filteredClaims.map((claim) => {
              if (claim.status === "Blocked") return <BlockedPanel key={claim.id} claim={claim} />;
              if (claim.status === "Soft Flag") return <SoftFlagPanel key={claim.id} claim={claim} />;
              return <ClaimRow key={claim.id} claim={claim} />;
            })
          )}
        </StaggeredFadeUp>

        {/* Summary footer */}
        {claims.length > 0 && (
          <div className="mt-8 rounded-2xl border border-white/8 bg-white/4 p-5 backdrop-blur-xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {[
                { label: "Total Claims",   value: claims.length,                   accent: "text-white" },
                { label: "Paid Out",       value: paidCount,                        accent: "text-emerald-400" },
                { label: "Under Review",   value: reviewCount,                      accent: "text-amber-400" },
                { label: "Blocked",        value: blockedCount,                     accent: "text-red-400" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300/50">{item.label}</p>
                  <p className={`mt-1 text-xl font-black ${item.accent}`}>{item.value}</p>
                </div>
              ))}
            </div>
            {paidCount > 0 && (
              <div className="mt-4 pt-4 border-t border-white/6 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300/40 mb-1">Total Paid Out</p>
                <p className="text-2xl font-black text-blue-300">₹{totalPaid.toFixed(0)}</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
