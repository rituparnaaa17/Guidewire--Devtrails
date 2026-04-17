"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Shield, CheckCircle2, Loader2, AlertCircle, ArrowRight, Zap, ArrowLeft, ShieldCheck } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser } from "@/lib/auth";

declare global {
  interface Window {
    Razorpay: new (options: unknown) => { open(): void };
  }
}

const TIER_INFO: Record<string, { coverage: number; label: string; color: string }> = {
  basic:    { coverage: 50, label: "Basic Plan",    color: "text-slate-300" },
  standard: { coverage: 70, label: "Standard Plan", color: "text-blue-400" },
  premium:  { coverage: 85, label: "Premium Plan",  color: "text-violet-400" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Inner component (uses useSearchParams — must be inside Suspense)
// ─────────────────────────────────────────────────────────────────────────────
function PaymentContent() {
  const router  = useRouter();
  const params  = useSearchParams();

  // URL params set by plans/page.tsx when user clicks "Activate Plan"
  const quoteId    = params.get("quoteId") || params.get("quote_id") || null;
  const planTierParam  = params.get("plan") || "standard"; // e.g. "basic" | "standard" | "premium"
  // price & coverage come from the plans page (already calculated by backend)
  const priceParam     = Number(params.get("price") || "0");   // tier-calculated ₹ premium
  const coverageParam  = Number(params.get("coverage") || "70"); // tier coverage %

  const tierInfo = TIER_INFO[planTierParam] || TIER_INFO["standard"];

  // After /api/policies/create responds, we use its values (authoritative)
  const [policyData, setPolicyData]     = useState<Record<string, unknown> | null>(null);
  const [loading,    setLoading]        = useState(false);
  const [creating,   setCreating]       = useState(false);
  const [success,    setSuccess]        = useState(false);
  const [error,      setError]          = useState<string | null>(null);
  const [razorpayReady, setRazorpayReady] = useState(false);

  // Displayed premium — start with URL param, replaced by backend's authoritative value once policy is created
  const displayedPremium = policyData
    ? Number(policyData.finalPremium)
    : priceParam || 0;
  const displayedCoverage = tierInfo.coverage;
  const displayedTierLabel = policyData
    ? String(policyData.planTier || planTierParam)
    : planTierParam;

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src*="razorpay"]')) { setRazorpayReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayReady(true);
    script.onerror = () => console.warn("Razorpay script failed to load");
    document.body.appendChild(script);
  }, []);

  // ── Shared: save a policy to localStorage after activation ─────────────────
  const persistPlan = (data: Record<string, unknown>) => {
    const tier = String(data.planTier || planTierParam);
    const tInfo = TIER_INFO[tier] || TIER_INFO["standard"];
    localStorage.setItem("shieldpay_plan", JSON.stringify({
      name:         tInfo.label,
      price:        Number(data.finalPremium || displayedPremium),
      cap:          Number(data.coverageAmount || 0),
      coverage:     tInfo.coverage,
      planTier:     tier,
      policyNumber: data.policyNumber || "",
      triggers:     "Heavy Rain, Flood, Severe AQI, Heatwave, Zone Shutdown",
      renewalDate:  data.validUntil ? new Date(String(data.validUntil)).toLocaleDateString("en-IN") : "",
      validFrom:    data.validFrom || "",
      validUntil:   data.validUntil || "",
      paymentStatus: "paid",
    }));
  };

  // ── Create policy on backend (shared by both demo & Razorpay flows) ─────────
  const createPolicyOnBackend = async () => {
    if (!quoteId) throw new Error("No quote ID. Please go back to Plans and select a plan.");

    const createRes = await fetch(apiUrl("/api/policies/create"), {
      method: "POST",
      headers: authHeaders() as HeadersInit,
      body: JSON.stringify({ quote_id: quoteId, plan_tier: planTierParam }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData.message || "Failed to create policy.");

    const { data } = createData;
    setPolicyData(data);
    return data;
  };

  // ── Demo bypass: activate policy without real payment ──────────────────────
  const handleDemoActivate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      if (!quoteId) {
        // No quote — commit plan directly from URL params to localStorage
        const tInfo = TIER_INFO[planTierParam] || TIER_INFO["standard"];
        localStorage.setItem("shieldpay_plan", JSON.stringify({
          name:         tInfo.label,
          price:        priceParam || 85,
          coverage:     tInfo.coverage,
          planTier:     planTierParam,
          triggers:     "Heavy Rain, Flood, Severe AQI, Heatwave, Zone Shutdown",
          renewalDate:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN"),
          paymentStatus: "demo",
        }));
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 1800);
        return;
      }

      const data = await createPolicyOnBackend();

      // Demo: skip Razorpay, activate directly
      const verifyRes = await fetch(apiUrl("/api/policies/demo-activate"), {
        method: "POST",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({ policy_id: data.policyId }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.success || verifyRes.ok) {
        persistPlan(data);
        setSuccess(true);
        setCreating(false);
        setTimeout(() => router.push("/dashboard"), 1800);
      } else {
        setError(verifyData.message || "Activation failed. Try Razorpay instead.");
        setCreating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo activation failed.");
      setCreating(false);
    }
  }, [quoteId, planTierParam, priceParam, router]);

  // ── Real Razorpay payment ──────────────────────────────────────────────────
  const handleRazorpay = useCallback(async () => {
    if (!quoteId) { setError("No quote ID. Please go back to Plans and select a plan."); return; }
    if (!razorpayReady) { setError("Razorpay is still loading. Please wait a moment."); return; }
    setCreating(true);
    setError(null);

    try {
      const data = await createPolicyOnBackend();
      const user = getUser() as Record<string, string> | null;

      const options = {
        key:         data.razorpay.keyId,
        amount:      data.razorpay.amount,          // from backend — matches tier-calculated premium
        currency:    data.razorpay.currency,
        name:        "ShieldPay",
        description: `${TIER_INFO[String(data.planTier)]?.label || "Plan"} — weekly premium`,
        order_id:    data.razorpay.orderId,
        prefill:     { name: user?.name || "", contact: user?.phone || "" },
        theme:       { color: "#3b82f6" },
        handler: async (response: {
          razorpay_order_id:   string;
          razorpay_payment_id: string;
          razorpay_signature:  string;
        }) => {
          setLoading(true);
          const verifyRes = await fetch(apiUrl("/api/policies/verify-payment"), {
            method:  "POST",
            headers: authHeaders() as HeadersInit,
            body: JSON.stringify({
              policy_id:           data.policyId,
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          setLoading(false);
          if (!verifyRes.ok) { setError(verifyData.message || "Payment verification failed."); return; }
          persistPlan(data);
          setSuccess(true);
          setTimeout(() => router.push("/dashboard"), 1800);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Try the demo bypass below.");
      setCreating(false);
    }
  }, [quoteId, razorpayReady, planTierParam, router]);

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="text-center space-y-6 p-8 max-w-sm w-full">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto animate-pulse">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">You&apos;re Protected! 🎉</h1>
          <p className="text-slate-400 mt-2 text-sm">Your ShieldPay policy is now active. Redirecting to dashboard...</p>
        </div>
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin mx-auto" />
      </div>
    </div>
  );

  // ── Main payment screen ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push("/plans")}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-medium transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Plans
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-extrabold text-base">ShieldPay</span>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-2xl space-y-5">
          <div className="text-center">
            <ShieldCheck className="w-9 h-9 text-blue-400 mx-auto mb-3" />
            <h1 className="text-xl md:text-2xl font-extrabold text-white">Activate Your Policy</h1>
            <p className="text-slate-400 text-sm mt-1">Secure payment via Razorpay · Test Mode</p>
          </div>

          {/* Plan summary — always reflects the tier chosen on plans page */}
          <div className="bg-white/5 rounded-2xl p-4 space-y-3 border border-white/10">
            <div className="flex justify-between text-sm items-center">
              <span className="text-slate-400">Plan</span>
              <span className={`font-bold capitalize ${TIER_INFO[displayedTierLabel]?.color || "text-white"}`}>
                {TIER_INFO[displayedTierLabel]?.label || `${displayedTierLabel} Plan`}
              </span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-slate-400">Income Coverage</span>
              <span className="text-white font-bold">{displayedCoverage}%</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-sm">Weekly Premium</span>
              <span className="text-2xl font-black text-blue-400">
                ₹{displayedPremium > 0 ? displayedPremium.toFixed(0) : "—"}
              </span>
            </div>
            {policyData && (
              <p className="text-[11px] text-slate-500 text-right">
                Based on your location risk &amp; coverage level
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 text-blue-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />Verifying payment...
            </div>
          )}

          {/* Primary CTA — Razorpay */}
          <button
            onClick={handleRazorpay}
            disabled={creating || loading}
            className="w-full h-12 md:h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:-translate-y-0.5"
          >
            {creating
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <>
                  <CreditCard className="w-5 h-5" />
                  Pay ₹{displayedPremium > 0 ? displayedPremium.toFixed(0) : "..."} via Razorpay
                  <ArrowRight className="w-4 h-4" />
                </>
            }
          </button>

          <p className="text-center text-xs text-slate-600">
            Test card: <span className="text-slate-400">4111 1111 1111 1111</span> · Any future date · Any CVV
          </p>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-slate-600 text-xs font-medium">or use demo mode</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Demo bypass */}
          <button
            onClick={handleDemoActivate}
            disabled={creating || loading}
            className="w-full h-11 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          >
            {creating
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Zap className="w-4 h-4 text-yellow-400" />Skip Payment — Demo Activate</>
            }
          </button>
          <p className="text-center text-xs text-slate-600">Demo bypass activates your policy instantly without charging.</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page export — wraps in Suspense (required for useSearchParams in Next.js 15)
// ─────────────────────────────────────────────────────────────────────────────
export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
