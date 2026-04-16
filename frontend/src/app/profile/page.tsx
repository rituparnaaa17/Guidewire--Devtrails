"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, User, CreditCard, Wallet, CheckSquare, Square } from "lucide-react";
import OnboardingLayout from "@/components/OnboardingLayout";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser, setUser } from "@/lib/auth";

const PLATFORMS = ["Zomato", "Swiggy", "Zepto", "Blinkit", "Uber", "Rapido", "Porter", "Dunzo"];

export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [aadhaarLast4, setAadhaarLast4] = useState("");
  const [upiId, setUpiId] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const isValid = name.trim().length >= 2
    && /^\d{4}$/.test(aadhaarLast4)
    && selectedPlatforms.length > 0;

  const handleNext = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/user/onboarding"), {
        method: "PUT",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({ name, aadhaarLast4, upiId, platforms: selectedPlatforms }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to save."); setLoading(false); return; }

      // Merge ALL fields returned by backend into stored user (includes name, aadhaarLast4, upiId, platforms, etc.)
      const existing = getUser() || {};
      const merged = {
        ...existing,
        ...data.user,
        // Ensure platforms is stored as array
        platforms: data.user?.platforms ?? selectedPlatforms,
      };
      setUser(merged);
      router.push("/work-details");
    } catch { setError("Server unreachable."); setLoading(false); }
  };

  return (
        <OnboardingLayout currentStep={3} backHref="/verify-otp" title="Your profile" subtitle="Tell us about yourself so we can personalize your coverage.">
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Full Name</label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Kumar"
              className="w-full h-12 pl-10 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm font-medium" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Aadhaar (Last 4)</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={aadhaarLast4} onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="XXXX" maxLength={4}
                className="w-full h-12 pl-9 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm font-medium" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">UPI ID (optional)</label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="rahul@upi"
                className="w-full h-12 pl-9 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm font-medium" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-3">Platforms you work on <span className="text-red-400">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((p) => {
              const active = selectedPlatforms.includes(p);
              return (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  className={`flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-semibold border transition-all ${active ? "bg-blue-600/20 border-blue-500 text-blue-300" : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"}`}>
                  {active ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>}

        <button onClick={handleNext} disabled={!isValid || loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:-translate-y-0.5">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-5 h-5" /></>}
        </button>
      </div>
    </OnboardingLayout>
  );
}
