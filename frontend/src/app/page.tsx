"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Shield, Clock, TrendingUp, HandHeart, ArrowRight, Zap, CheckCircle2, Brain, Link2, IndianRupee } from "lucide-react";
import { isLoggedIn, getUser } from "@/lib/auth";

const FEATURES = [
  { icon: <Clock className="w-7 h-7 text-blue-400" />, title: "Weekly Protection", desc: "Pay affordable premiums weekly, synced with your earning cycle. No lock-ins or paperwork.", color: "blue" },
  { icon: <HandHeart className="w-7 h-7 text-rose-400" />, title: "Automated Payouts", desc: "When disruptions are verified, payouts are initiated directly to your UPI within minutes.", color: "rose" },
  { icon: <Brain className="w-7 h-7 text-violet-400" />, title: "ML-Powered Claims", desc: "Our gradient boosting model predicts your actual loss — no flat-rate settlements.", color: "violet" },
  { icon: <Link2 className="w-7 h-7 text-emerald-400" />, title: "Blockchain Logged", desc: "Every payout is cryptographically hashed and logged — immutable and auditable forever.", color: "emerald" },
  { icon: <TrendingUp className="w-7 h-7 text-amber-400" />, title: "Dynamic Pricing", desc: "Premiums calculated from your zone risk, work type, income, and hours — not guesswork.", color: "amber" },
  { icon: <IndianRupee className="w-7 h-7 text-cyan-400" />, title: "Razorpay Payments", desc: "Secure UPI and card payments via Razorpay. Your financial data never touches our servers.", color: "cyan" },
];

const STATS = [
  { value: "50,000+", label: "Gig Workers Protected" },
  { value: "₹2.4Cr+", label: "Claims Paid Out" },
  { value: "4.9 mins", label: "Avg. Claim Resolution" },
  { value: "98.6%", label: "Claim Accuracy" },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn() && getUser()) {
      const user = getUser() as Record<string, unknown>;
      if (user.onboardingDone) router.push("/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Subtle background grid for sections below hero */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 w-full bg-slate-950/80 backdrop-blur-xl border-b border-white/5 z-50">
        <div className="container mx-auto px-6 h-18 flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight text-white">ShieldPay</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/get-started" className="text-sm font-semibold text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-white/5">
              Log In
            </Link>
            <Link href="/get-started"
              className="h-10 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-0.5">
              Get Covered <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero — delivery rider background image ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{ backgroundImage: "url('/delivery-bg.png')" }}
        />
        {/* Layered overlays: dark top for header, blue tint center, dark bottom for stats */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-950/60 to-slate-950/90" />
        <div className="absolute inset-0 bg-blue-950/35" />

        {/* Hero content */}
        <div className="relative z-10 max-w-4xl mx-auto pt-24 pb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/15 border border-blue-500/30 backdrop-blur-sm text-blue-300 text-sm font-bold mb-8">
            <Zap className="w-4 h-4" /> India&apos;s First ML-Powered Parametric Insurance
          </div>
          <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white leading-[0.95] tracking-tight mb-8">
            Your income,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400">always protected.</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-12 leading-relaxed">
            ShieldPay uses real-time weather data, AI-powered fraud detection, and blockchain logging to deliver instant parametric payouts when disruptions stop your work.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/get-started"
              className="h-14 px-8 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-base sm:text-lg flex items-center gap-2 w-full sm:w-auto justify-center transition-all shadow-2xl shadow-blue-600/40 hover:-translate-y-0.5">
              Get Covered Now <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/get-started"
              className="h-14 px-8 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/15 text-white font-bold text-base sm:text-lg flex items-center gap-2 w-full sm:w-auto justify-center transition-all hover:border-white/30">
              Already a member? Log in
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/5 bg-white/2 py-16">
        <div className="container mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl md:text-4xl font-black text-white mb-1">{s.value}</div>
              <div className="text-sm text-slate-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-28 container mx-auto px-6">
        <div className="text-center mb-16">
          <h3 className="text-4xl font-black text-white mb-4">Built different. Built better.</h3>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">Every shield in ShieldPay is backed by data science, not guesswork.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="group p-6 rounded-3xl bg-white/3 border border-white/8 hover:border-white/15 hover:bg-white/5 transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-5 border border-white/8 group-hover:border-white/15 transition-all">
                {f.icon}
              </div>
              <h4 className="text-lg font-bold text-white mb-2">{f.title}</h4>
              <p className="text-slate-500 text-sm leading-relaxed font-medium">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-gradient-to-b from-transparent to-slate-900/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-black text-white mb-4">How it works</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Sign Up", desc: "Verify your phone via OTP in 30 seconds" },
              { step: "02", title: "Get Quoted", desc: "ML engine calculates your personalized premium" },
              { step: "03", title: "Pay Weekly", desc: "Secure Razorpay checkout, ₹45–₹180/week" },
              { step: "04", title: "Get Paid", desc: "Auto-payout when triggers fire in your zone" },
            ].map((item, i) => (
              <div key={i} className="relative text-center p-6 rounded-2xl bg-white/3 border border-white/8">
                <div className="text-5xl font-black text-blue-500/20 mb-3">{item.step}</div>
                <h4 className="text-lg font-bold text-white mb-2">{item.title}</h4>
                <p className="text-slate-500 text-sm">{item.desc}</p>
                {i < 3 && <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-white/10" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 container mx-auto px-6 text-center">
        <div className="max-w-2xl mx-auto p-12 rounded-3xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20">
          <Shield className="w-14 h-14 text-blue-400 mx-auto mb-6" />
          <h3 className="text-4xl font-black text-white mb-4">Ready to shield your income?</h3>
          <p className="text-slate-400 mb-8">Join thousands of gig workers who never skip a meal because of bad weather.</p>
          <Link href="/get-started"
            className="inline-flex h-14 px-10 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-lg items-center gap-2 transition-all shadow-2xl shadow-blue-600/40 hover:-translate-y-0.5">
            Start for free · No commitment <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">ShieldPay</span>
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <span>© 2026 ShieldPay. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            Built by <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 font-bold">Team Arcane</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
