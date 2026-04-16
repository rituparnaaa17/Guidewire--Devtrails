"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ShieldAlert, Sparkles, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FadeUp, StaggeredFadeUp } from "@/components/animated/FadeUp";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser } from "@/lib/auth";


type ActivePlan = {
  name: string;
  price: number;
  cap: number;
  features: string[];
  triggers: string;
  planTier?: string;
  policyNumber?: string;
  quoteId?: string;
  validFrom?: string;
  validUntil?: string;
  boughtOn?: string;
  renewalDate?: string;
  city?: string;
  zone?: string;
};

const DEFAULT_PLANS = [
  {
    id: "basic",
    tier: "basic",
    name: "Basic Protection",
    price: 45,
    cap: 2000,
    idealFor: "Part-time workers (10-20 hrs/week)",
    features: ["Heavy Rain Coverage", "Zone Shutdowns", "24/7 Support"],
    recommended: false,
    quoteId: "",
  },
  {
    id: "plus",
    tier: "standard",
    name: "Shield Plus",
    price: 85,
    cap: 4500,
    idealFor: "Full-time riders (30-50 hrs/week)",
    features: ["Heavy Rain & Floods", "Severe AQI Drops", "Zone Shutdowns", "Priority Support"],
    recommended: true,
    quoteId: "",
  },
  {
    id: "pro",
    tier: "premium",
    name: "Max Pro",
    price: 150,
    cap: 8000,
    idealFor: "High-earning delivery partners",
    features: ["All Weather Coverage", "Heatwave Protection", "Zone & City Shutdowns", "Instant UPI Payouts"],
    recommended: false,
    quoteId: "",
  },
];

const TIER_TO_PLAN_NAME: Record<string, string> = {
  basic: "Basic Protection",
  standard: "Shield Plus",
  premium: "Max Pro",
};

const PLAN_FEATURES: Record<string, string[]> = {
  basic: ["Heavy Rain Coverage", "Zone Shutdowns", "24/7 Support"],
  standard: ["Heavy Rain & Floods", "Severe AQI Drops", "Zone Shutdowns", "Priority Support"],
  premium: ["All Weather Coverage", "Heatwave Protection", "Zone & City Shutdowns", "Instant UPI Payouts"],
};

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export default function PlansPage() {
  const [user, setUser] = useState({ id: "", city: "Bengaluru", risk: "High", probability: "12%", zone: "" });
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  const [isLoading, setIsLoading] = useState(true);
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        const parsed = getUser() as Record<string, string> | null;
        if (!parsed) { setIsLoading(false); return; }

        const userId = parsed.id || "";

        let risk = "High";
        let probability = "12%";
        if (parsed.city === "Mumbai") { risk = "Extreme"; probability = "18%"; }
        else if (parsed.city === "Delhi NCR") { risk = "Medium"; probability = "8%"; }

        setUser({ id: userId, city: parsed.city || "Bengaluru", risk, probability, zone: parsed.zone || "" });

        // 1. Try fetching real policy (JWT-protected)
        if (userId) {
          try {
            const res = await fetch(apiUrl(`/api/policies/user`), { headers: authHeaders() as HeadersInit });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.data && data.data.length > 0) {
                const p = data.data[0];
                const tier = p.planTier || "standard";
                const planName = TIER_TO_PLAN_NAME[tier] || "Shield Plus";
                const fallback = DEFAULT_PLANS.find((d) => d.tier === tier) || DEFAULT_PLANS[1];

                const builtPlan: ActivePlan = {
                  name: planName,
                  price: p.finalPremium || fallback.price,
                  cap: p.coverageAmount || fallback.cap,
                  features: PLAN_FEATURES[tier] || fallback.features,
                  triggers: parseTriggers(p.coverageTriggers, fallback.features),
                  planTier: tier,
                  policyNumber: p.policyNumber || "",
                  quoteId: "",
                  validFrom: p.validFrom || "",
                  validUntil: p.validUntil || "",
                  boughtOn: p.createdAt || p.validFrom || "",
                  renewalDate: p.validUntil ? fmtDate(p.validUntil) : "",
                  city: p.city || parsed.city || "",
                  zone: p.zoneName || parsed.zone || "",
                };

                setActivePlan(builtPlan);

                // Sync to localStorage so dashboard sees it too
                localStorage.setItem(
                  "shieldpay_plan",
                  JSON.stringify({
                    ...builtPlan,
                    updatedAt: new Date().toISOString(),
                  })
                );

                setIsLoading(false);
                return;
              }
            }
          } catch (err) {
            console.error("Policy fetch error:", err);
            setFetchError("Could not reach server — showing cached data.");
          }
        }

        // 2. Fallback to localStorage plan
        const storedPlan = localStorage.getItem("shieldpay_plan");
        if (storedPlan) {
          const parsedPlan = JSON.parse(storedPlan);
          const fallbackByTier = DEFAULT_PLANS.find((plan) => plan.tier === parsedPlan.planTier);
          const fallbackByName = DEFAULT_PLANS.find((plan) => plan.name === parsedPlan.name);
          const fallback = fallbackByTier || fallbackByName || DEFAULT_PLANS[1];

          setActivePlan({
            name: parsedPlan.name || fallback.name,
            price: Number(parsedPlan.price ?? fallback.price),
            cap: Number(parsedPlan.cap ?? fallback.cap),
            features:
              Array.isArray(parsedPlan.features) && parsedPlan.features.length > 0
                ? parsedPlan.features
                : fallback.features,
            triggers: parsedPlan.triggers || fallback.features.join(", "),
            planTier: parsedPlan.planTier || fallback.tier,
            policyNumber: parsedPlan.policyNumber || "",
            quoteId: parsedPlan.quoteId || "",
            validFrom: parsedPlan.validFrom || parsedPlan.boughtOn || "",
            validUntil: parsedPlan.validUntil || "",
            boughtOn: parsedPlan.boughtOn || parsedPlan.validFrom || "",
            renewalDate:
              parsedPlan.renewalDate ||
              (parsedPlan.validUntil ? fmtDate(parsedPlan.validUntil) : ""),
            city: parsedPlan.city || parsed.city || "",
            zone: parsedPlan.zone || parsed.zone || "",
          });
          setIsLoading(false);
          return;
        }

        // 3. No policy — fetch dynamic pricing for plan cards
        const updatedPlans = await Promise.all(
          DEFAULT_PLANS.map(async (plan) => {
            try {
              const res = await fetch(apiUrl("/api/pricing/quote"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  city: parsed.city,
                  pincode: "400001",
                  work_type: parsed.type === "Food Delivery" || parsed.type === "delivery" ? "delivery" : "other",
                  daily_hours: Math.round(Number(parsed.hours) / 7) || 6,
                  avg_weekly_income: Number(parsed.income) || 4500,
                  plan_tier: plan.tier,
                  years_experience: 1,
                  user_id: userId || crypto.randomUUID(),
                }),
              });
              if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                  const p2 = Number(json.data.result?.finalPremium);
                  const c2 = Number(json.data.result?.coverageAmount);
                  return {
                    ...plan,
                    price: isNaN(p2) || p2 <= 0 ? plan.price : p2,
                    cap: isNaN(c2) || c2 <= 0 ? plan.cap : c2,
                    quoteId: json.data.quoteId || "",
                  };
                }
              }
            } catch {
              /* keep default */
            }
            return plan;
          })
        );
        setPlans(updatedPlans);
      } catch (e) {
        console.error("Plans page init error:", e);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white py-12 px-6">
      {/* Glow orbs */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-96 h-96 bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 container mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors text-sm font-semibold group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Dashboard
        </Link>

        <div className="text-center mb-16">
          <FadeUp>
            <h1 className="text-4xl font-extrabold mb-4 text-white">
              {activePlan ? "My Active Policy" : "Personalized Coverage Plans"}
            </h1>
            <p className="text-lg text-slate-300 max-w-xl mx-auto mb-8">
              {activePlan
                ? "Your current coverage details and renewal information."
                : "Based on your location risk profile and working hours, we've calculated the optimal weekly premium to protect your earnings."}
            </p>

            {!activePlan && (
              <div className="inline-flex items-center gap-6 bg-white border border-slate-200 shadow-sm rounded-2xl px-6 py-4 text-sm text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium">City Risk Level</div>
                    <div className="font-bold text-slate-900">
                      {user.risk} ({user.city})
                    </div>
                  </div>
                </div>
                <div className="w-px h-10 bg-slate-200"></div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium">Weather Disruptions</div>
                    <div className="font-bold text-slate-900">{user.probability} Probability</div>
                  </div>
                </div>
              </div>
            )}

            {fetchError && (
              <p className="text-xs text-amber-600 mt-4 bg-amber-50 inline-block px-3 py-1 rounded-full border border-amber-200">
                ⚠ {fetchError}
              </p>
            )}
          </FadeUp>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64 mt-8 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-sm text-slate-500 font-medium">Fetching your policy from database...</p>
          </div>
        ) : activePlan ? (
          <div className="max-w-2xl mx-auto mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 relative flex flex-col shadow-2xl">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <Badge className="bg-emerald-500 text-white font-bold tracking-wide uppercase px-4 py-1.5 shadow-lg shadow-emerald-500/30 border-0">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" /> Active Policy
              </Badge>
            </div>

            <h3 className="text-2xl font-bold text-white mb-1">{activePlan.name}</h3>
            <p className="text-sm text-slate-400 mb-6 pb-6 border-b border-white/10">
              Your current coverage protects you from major disruptions.
            </p>

            <div className="flex items-end gap-1 mb-2">
              <span className="text-5xl font-extrabold text-blue-600">₹{activePlan.price}</span>
              <span className="text-slate-500 mb-1 font-medium">/ week</span>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-8 mt-4">
              <div className="text-sm text-slate-400 flex justify-between items-center">
                <span>Max Payout Cap</span>
                <span className="text-lg font-bold text-white">₹{activePlan.cap}</span>
              </div>
            </div>

            {/* Policy Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Policy Number</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {activePlan.policyNumber || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Plan Tier</p>
                <p className="mt-1 text-sm font-bold text-slate-900 capitalize">
                  {activePlan.planTier || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Coverage Zone</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {activePlan.city && activePlan.zone
                    ? `${activePlan.city}, ${activePlan.zone}`
                    : activePlan.city || activePlan.zone || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Renews On</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {activePlan.renewalDate || fmtDate(activePlan.validUntil) || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Valid From</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {fmtDate(activePlan.validFrom || activePlan.boughtOn) || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Valid Until</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {fmtDate(activePlan.validUntil) || "—"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Covered Triggers</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{activePlan.triggers}</p>
            </div>

            <div className="flex-1 space-y-4 mb-8">
              {activePlan.features &&
                activePlan.features.map((feature: string, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-600" />
                    <span className="text-sm font-medium text-slate-700">{feature}</span>
                  </div>
                ))}
            </div>

            <div className="flex flex-col gap-3">
              <Link href="/dashboard" className="w-full block">
                <Button
                  size="lg"
                  className="w-full h-14 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20"
                >
                  Go to Dashboard
                </Button>
              </Link>
              <Link href="/settings" className="w-full block">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  Edit Profile &amp; Settings
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl"
                onClick={() => {
                  localStorage.removeItem("shieldpay_plan");
                  setActivePlan(null);
                }}
              >
                Cancel Policy
              </Button>
            </div>
          </div>
        ) : (
          <StaggeredFadeUp staggerDelay={0.1} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mt-8">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`bg-white/5 border border-white/10 rounded-2xl p-8 relative flex flex-col h-full transform transition-all duration-300 ${
                  plan.recommended
                    ? "ring-2 ring-blue-500/50 shadow-2xl md:-translate-y-4"
                    : ""
                }`}
              >
                <div className="w-full h-full flex flex-col">
                  {plan.recommended && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold tracking-wide uppercase px-4 py-1.5 shadow-lg shadow-blue-500/30 border-0">
                        <Sparkles className="w-3.5 h-3.5 mr-1" /> Recommended
                      </Badge>
                    </div>
                  )}

                  <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-sm text-slate-400 mb-6 pb-6 border-b border-white/10">
                    Ideal for: <span className="font-medium text-slate-300">{plan.idealFor}</span>
                  </p>

                  <div className="flex items-end gap-1 mb-2">
                    <span className="text-4xl font-extrabold text-blue-400">₹{plan.price}</span>
                    <span className="text-slate-400 mb-1 font-medium">/ week</span>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6 mt-3">
                    <div className="text-sm text-slate-400 flex justify-between items-center">
                      <span>Max Payout Cap</span>
                      <span className="text-base font-bold text-white">₹{plan.cap}</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 mb-6">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                        <span className="text-sm font-medium text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={`/payment?plan=${plan.id}${plan.quoteId ? `&quote_id=${plan.quoteId}` : ""}&price=${plan.price || ""}&cap=${plan.cap || ""}`}
                    className="block w-full mt-auto"
                  >
                    <Button size="lg"
                      className={`w-full h-12 rounded-xl text-sm font-bold transition-all ${
                        plan.recommended
                          ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30"
                          : "bg-white/10 border border-white/20 text-white hover:bg-white/15"
                      }`}
                    >
                      Select Plan
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </StaggeredFadeUp>
        )}

        {!activePlan && !isLoading && (
          <div className="mt-16 text-center text-sm text-slate-500 flex flex-col items-center">
            <p className="max-w-xl">
              By selecting a plan, you agree to the ShieldPay Terms of Service. Payouts are directly credited to
              your UPI ID based on the automated trigger limits.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function parseTriggers(raw: unknown, fallback: string[]): string {
  if (!raw) return fallback.join(", ");
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join(", ");
  return fallback.join(", ");
}
