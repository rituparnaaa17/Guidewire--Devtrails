"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Shield, CheckCircle2, Loader2, AlertCircle, ArrowRight, Zap, ArrowLeft } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser } from "@/lib/auth";

declare global {
  interface Window {
    Razorpay: new (options: unknown) => { open(): void };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner component (uses useSearchParams — must be inside Suspense)
// ─────────────────────────────────────────────────────────────────────────────
function PaymentContent() {
  const router = useRouter();
  const params  = useSearchParams();

  // Support both ?quoteId= and ?quote_id= (plans page sends quote_id)
  const quoteId = params.get("quoteId") || params.get("quote_id") || null;
  const planLabel = params.get("plan") || "standard";
  const priceLabel = params.get("price") || "85";
  const capLabel = params.get("cap") || "4500";

  const [policyData, setPolicyData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [razorpayReady, setRazorpayReady] = useState(false);

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src*="razorpay"]')) {
      setRazorpayReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayReady(true);
    script.onerror = () => console.warn("Razorpay script failed to load");
    document.body.appendChild(script);
  }, []);

  // ── Demo bypass: activate policy without real payment ──────────────────────
  const handleDemoActivate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      if (!quoteId) {
        // No quote — go straight to dashboard with mock plan in localStorage
        localStorage.setItem("shieldpay_plan", JSON.stringify({
          name: "Shield Plus",
          price: Number(priceLabel) || 85,
          cap: Number(capLabel) || 4500,
          planTier: planLabel,
          triggers: "Heavy Rain, Flood, Severe AQI",
          renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN"),
          paymentStatus: "demo",
        }));
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 1800);
        return;
      }

      // Create policy (backend will create it in pending state)
      const createRes = await fetch(apiUrl("/api/policies/create"), {
        method: "POST",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({ quote_id: quoteId }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setError(createData.message || "Failed to create policy."); setCreating(false); return; }

      const { data } = createData;
      setPolicyData(data);

      // Demo: directly verify without real Razorpay payment
      const verifyRes = await fetch(apiUrl("/api/policies/demo-activate"), {
        method: "POST",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({ policy_id: data.policyId }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.success || verifyRes.ok) {
        localStorage.setItem("shieldpay_plan", JSON.stringify({
          name: data.planTier === "basic" ? "Basic Protection" : data.planTier === "premium" ? "Max Pro" : "Shield Plus",
          price: Number(data.finalPremium || priceLabel),
          cap: Number(data.coverageAmount || capLabel),
          planTier: data.planTier || planLabel,
          policyNumber: data.policyNumber,
          triggers: "Heavy Rain, Flood, Severe AQI",
          renewalDate: data.validUntil ? new Date(data.validUntil).toLocaleDateString("en-IN") : "",
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          paymentStatus: "paid",
        }));
        setSuccess(true);
        setCreating(false);
        setTimeout(() => router.push("/dashboard"), 1800);
      } else {
        setError(verifyData.message || "Activation failed. Try Razorpay instead.");
        setCreating(false);
      }
    } catch {
      setError("Demo activation failed. Please try Razorpay below.");
      setCreating(false);
    }
  }, [quoteId, planLabel, priceLabel, capLabel, router]);

  // ── Real Razorpay payment ──────────────────────────────────────────────────
  const handleRazorpay = useCallback(async () => {
    if (!quoteId) { setError("No quote ID. Please go back to Plans and select a plan."); return; }
    if (!razorpayReady) { setError("Razorpay is still loading. Please wait a moment."); return; }
    setCreating(true);
    setError(null);

    try {
      const createRes = await fetch(apiUrl("/api/policies/create"), {
        method: "POST",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({ quote_id: quoteId }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setError(createData.message || "Failed to create order."); setCreating(false); return; }

      const { data } = createData;
      setPolicyData(data);

      const user = getUser();
      const options = {
        key:       data.razorpay.keyId,
        amount:    data.razorpay.amount,
        currency:  data.razorpay.currency,
        name:      "ShieldPay",
        description: `Weekly premium — ${String(data.planTier || "Standard").toUpperCase()} plan`,
        order_id:  data.razorpay.orderId,
        prefill:   { name: String(user?.name || ""), contact: String(user?.phone || "") },
        theme:     { color: "#3b82f6" },
        handler:   async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setLoading(true);
          const verifyRes = await fetch(apiUrl("/api/policies/verify-payment"), {
            method: "POST",
            headers: authHeaders() as HeadersInit,
            body: JSON.stringify({
              policy_id:          data.policyId,
              razorpay_order_id:  response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          setLoading(false);
          if (!verifyRes.ok) { setError(verifyData.message || "Payment verification failed."); return; }
          setSuccess(true);
          setTimeout(() => router.push("/dashboard"), 1800);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      setCreating(false);
    } catch {
      setError("Payment failed. Try the demo bypass below.");
      setCreating(false);
    }
  }, [quoteId, razorpayReady, router]);

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center space-y-6 p-8 max-w-sm w-full">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto animate-pulse">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">You&apos;re Protected! 🎉</h1>
            <p className="text-slate-400 mt-2 text-sm">Your ShieldPay policy is now active. Redirecting to dashboard...</p>
          </div>
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

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
            <CreditCard className="w-9 h-9 text-blue-400 mx-auto mb-3" />
            <h1 className="text-xl md:text-2xl font-extrabold text-white">Activate Your Policy</h1>
            <p className="text-slate-400 text-sm mt-1">Secure payment via Razorpay · Test Mode</p>
          </div>

          {/* Plan summary */}
          <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-white/10">
            {policyData ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Plan</span>
                  <span className="text-white font-bold capitalize">{String(policyData.planTier || planLabel)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Weekly Premium</span>
                  <span className="text-blue-400 font-bold">₹{Number(policyData.finalPremium || priceLabel).toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Coverage</span>
                  <span className="text-white font-bold">₹{Number(policyData.coverageAmount || capLabel).toLocaleString("en-IN")}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Plan</span>
                  <span className="text-white font-bold capitalize">{planLabel}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Weekly Premium</span>
                  <span className="text-blue-400 font-bold">₹{priceLabel}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Max Coverage</span>
                  <span className="text-white font-bold">₹{Number(capLabel).toLocaleString("en-IN")}</span>
                </div>
              </>
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
          <button onClick={handleRazorpay} disabled={creating || loading}
            className="w-full h-12 md:h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:-translate-y-0.5">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CreditCard className="w-5 h-5" />Pay ₹{priceLabel} via Razorpay <ArrowRight className="w-4 h-4" /></>}
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
          <button onClick={handleDemoActivate} disabled={creating || loading}
            className="w-full h-11 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 text-yellow-400" />Skip Payment — Demo Activate</>}
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
