"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft, CheckCircle2, ShieldAlert, Loader2, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FadeUp } from "@/components/animated/FadeUp";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser } from "@/lib/auth";

type PlanOption = {
  tier: "basic" | "standard" | "premium";
  name: string;
  premium: number;
  coverage: number;
  multiplier: number;
};

type PricingOptions = {
  base_premium: number;
  quoteId: string;
  plans: PlanOption[];
  risk: { risk_score: number; explanation?: string };
  zone: { name: string; city: string };
};

type ActivePolicy = {
  id: string;
  planTier: string;
};

export default function PlansPage() {
  const router = useRouter();
  const [activePolicy, setActivePolicy] = useState<ActivePolicy | null>(null);
  const [pricing, setPricing] = useState<PricingOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    const FALLBACK_PRICING: PricingOptions = {
      base_premium: 60,
      quoteId: "",
      plans: [
        { tier: "basic",    name: "Basic",    premium: 42,  coverage: 50, multiplier: 0.7 },
        { tier: "standard", name: "Standard", premium: 60,  coverage: 70, multiplier: 1.0 },
        { tier: "premium",  name: "Premium",  premium: 78,  coverage: 85, multiplier: 1.3 },
      ],
      risk: { risk_score: 0.4, explanation: "Standard risk zone" },
      zone: { name: "Default Zone", city: "Bengaluru" },
    };

    const init = async () => {
      try {
        const parsed = getUser() as Record<string, string> | null;

        // If not logged in, still show fallback pricing — don't bail early
        if (!parsed) {
          setPricing(FALLBACK_PRICING);
          setIsLoading(false);
          return;
        }

        const userId = parsed.id || "";
        const city   = parsed.city || "Bengaluru";
        const income = Number(parsed.income) || 4500;
        const experience = Number(parsed.experience) || 1;

        // Normalize work_type to one of the valid backend values
        const rawType = (parsed.type || "").toLowerCase();
        let workType = "other";
        if (rawType.includes("delivery") || rawType.includes("food")) workType = "delivery";
        else if (rawType.includes("construction")) workType = "construction";
        else if (rawType.includes("domestic") || rawType.includes("house")) workType = "domestic";
        else if (rawType.includes("factory") || rawType.includes("manufactur")) workType = "factory";
        else if (rawType.includes("agri") || rawType.includes("farm")) workType = "agriculture";
        else if (rawType.includes("retail") || rawType.includes("shop")) workType = "retail";

        // Update fallback city with actual user city
        FALLBACK_PRICING.zone = { name: "Default Zone", city };

        // 1. Fetch active policy first
        if (userId) {
          try {
            const res = await fetch(apiUrl("/api/policies/user"), { headers: authHeaders() as HeadersInit });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.data && data.data.length > 0) {
                setActivePolicy({
                  id: data.data[0].id,
                  planTier: data.data[0].planTier || "standard",
                });
              }
            }
          } catch {
            // ignore policy fetch errors
          }
        }

        // 2. Fetch dynamic pricing options from backend
        try {
          const params = new URLSearchParams({
            city,
            avg_weekly_income: income.toString(),
            work_type: workType,
            years_experience: experience.toString(),
          });
          if (userId) params.append("user_id", userId);

          const res = await fetch(apiUrl(`/api/pricing/options?${params.toString()}`));
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data && Array.isArray(data.data.plans) && data.data.plans.length > 0) {
              setPricing(data.data as PricingOptions);
            } else {
              console.warn("Pricing API bad response, using fallback", data);
              setPricing(FALLBACK_PRICING);
            }
          } else {
            const errText = await res.text().catch(() => "");
            console.warn(`Pricing API ${res.status}, using fallback:`, errText);
            setPricing(FALLBACK_PRICING);
          }
        } catch (e) {
          console.warn("Pricing API unreachable, using fallback:", e);
          setPricing(FALLBACK_PRICING);
        }
      } catch (e) {
        console.error("Plans init error:", e);
        setPricing(FALLBACK_PRICING);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleSelectPlan = async (tier: string) => {
    if (activePolicy) {
      if (activePolicy.planTier === tier) return; // already active
      
      // Update plan via API
      setIsSwitching(true);
      try {
        const res = await fetch(apiUrl("/api/policies/update-plan"), {
          method: "POST",
          headers: authHeaders() as HeadersInit,
          body: JSON.stringify({ policy_id: activePolicy.id, plan_tier: tier })
        });
        const data = await res.json();
        if (data.success) {
          const lpStr = localStorage.getItem("shieldpay_plan");
          if (lpStr) {
             const lp = JSON.parse(lpStr);
             lp.planTier = tier;
             lp.name = tier === "premium" ? "Premium Plan" : tier === "basic" ? "Basic Plan" : "Standard Plan";
             lp.price = data.data.finalPremium;
             lp.coverage = data.data.coverage;
             localStorage.setItem("shieldpay_plan", JSON.stringify(lp));
          }
          setActivePolicy({ ...activePolicy, planTier: tier });
          alert("Plan successfully updated!");
        } else {
          alert("Could not update plan: " + (data.message || "Unknown error"));
        }
      } catch (e) {
        alert("Network error updating plan.");
      } finally {
        setIsSwitching(false);
      }
    } else {
      // Navigate to payment — pass tier, price, coverage so payment page shows correct info immediately
      if (!pricing) return;
      const selectedPlan = pricing.plans.find((p) => p.tier === tier);
      if (!selectedPlan) return;
      router.push(
        `/payment?quote_id=${pricing.quoteId}&plan=${tier}&price=${selectedPlan.premium}&coverage=${selectedPlan.coverage}`
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Dynamic Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10 flex-1 px-4 py-12 md:py-20 lg:py-24 max-w-7xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors text-sm font-semibold group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Dashboard
        </Link>

        {/* Header */}
        <FadeUp className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
            Select Your Protection
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-lg leading-relaxed">
            Choose a plan that fits your needs. 
            {" "} <span className="text-blue-300">Premium varies based on your location risk and selected coverage level.</span>
          </p>
          {fetchError && (
            <p className="text-xs text-rose-400 mt-4 bg-rose-400/10 inline-block px-3 py-1 rounded-full border border-rose-400/30">
              ⚠ {fetchError}
            </p>
          )}
        </FadeUp>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-sm font-semibold tracking-widest uppercase text-slate-500">Calculating exact quotes...</p>
          </div>
        ) : pricing ? (
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto items-end">
            {pricing.plans.map((plan, i) => {
              const isActive = activePolicy && activePolicy.planTier === plan.tier;
              const isStandard = plan.tier === "standard";
              
              return (
                <FadeUp key={plan.tier} delay={i * 0.1}>
                  <div
                    className={`relative rounded-3xl backdrop-blur-xl p-6 transition-all duration-300 ${
                      isActive
                        ? "bg-emerald-500/10 border-2 border-emerald-500 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)] scale-105 z-20"
                        : isStandard
                        ? "bg-slate-900/60 border border-blue-500/30 shadow-[0_0_30px_-15px_rgba(59,130,246,0.3)] hover:border-blue-500/50"
                        : "bg-slate-900/40 border border-slate-800 hover:bg-slate-900/60"
                    } ${isStandard ? "md:-translate-y-4" : ""}`}
                  >
                    {isActive && (
                      <div className="absolute -top-4 inset-x-0 flex justify-center">
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 py-1 font-bold shadow-lg shadow-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Active Plan
                        </Badge>
                      </div>
                    )}
                    {!isActive && isStandard && (
                      <div className="absolute -top-3.5 inset-x-0 flex justify-center">
                        <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-lg shadow-blue-500/20 uppercase tracking-widest text-[10px]">
                          Recommended
                        </Badge>
                      </div>
                    )}

                    <div className="mb-6 mt-4 text-center">
                      <h3 className="text-xl font-bold uppercase tracking-widest text-white/90">
                        {plan.name}
                      </h3>
                      <div className="mt-4 flex items-baseline justify-center gap-1">
                        <span className="text-5xl font-black tracking-tight text-white">₹{plan.premium}</span>
                        <span className="text-slate-400 font-medium">/week</span>
                      </div>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className="bg-white/5 rounded-2xl p-4 flex gap-4 items-center">
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                          <span className="text-lg font-black text-blue-300">{plan.coverage}%</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Income Coverage</p>
                          <p className="text-xs text-slate-400 leading-snug">
                            Of predicted net loss paid out on disruption.
                          </p>
                        </div>
                      </div>
                      
                      <ul className="text-sm text-slate-300 space-y-3 px-2">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>Heavy Rain, Flood, Severe AQI</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>Geo-verified instant triggers</span>
                        </li>
                      </ul>
                    </div>

                    {isActive ? (
                      <Button
                        disabled
                        className="w-full rounded-2xl bg-slate-800 text-slate-400 h-14 font-bold opacity-80"
                      >
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSelectPlan(plan.tier)}
                        disabled={isSwitching}
                        className={`w-full rounded-2xl h-14 font-extrabold text-sm tracking-wide shadow-xl transition-all ${
                          isStandard
                            ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 border border-blue-400/50"
                            : "bg-white hover:bg-slate-100 text-slate-900"
                        }`}
                      >
                        {isSwitching ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : activePolicy ? (
                          "Switch Plan"
                        ) : (
                          "Activate Plan"
                        )}
                      </Button>
                    )}
                  </div>
                </FadeUp>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-500 py-24">
            <ShieldAlert className="w-16 h-16 mx-auto mb-6 opacity-20" />
            <p className="text-lg">No coverage options available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
