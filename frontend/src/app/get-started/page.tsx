"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, ArrowRight, Loader2 } from "lucide-react";
import OnboardingLayout from "@/components/OnboardingLayout";
import { apiUrl } from "@/lib/api";

export default function GetStartedPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanPhone = phone.replace(/\s|\+91|-/g, "").slice(-10);
  const isValid = /^\d{10}$/.test(cleanPhone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError(null);

    try {
      const res  = await fetch(apiUrl("/api/auth/send-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to send OTP.");
        setLoading(false);
        return;
      }

      // Store phone in session for next step
      sessionStorage.setItem("sp_phone", cleanPhone);
      router.push("/verify-otp");
    } catch {
      setError("Cannot reach server. Make sure the backend is running.");
      setLoading(false);
    }
  };

  return (
    <OnboardingLayout currentStep={1} title="Let's get you covered" subtitle="Enter your mobile number to receive your one-time verification code.">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Mobile Number</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 pointer-events-none">
              <Phone className="w-4 h-4 mr-2" />
              <span className="text-sm font-semibold">+91</span>
            </div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              maxLength={14}
              className="w-full h-14 pl-20 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-base font-medium"
            />
          </div>
          {phone.length > 0 && !isValid && (
            <p className="text-red-400 text-xs mt-2 font-medium">Please enter a valid 10-digit number</p>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid || loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 hover:-translate-y-0.5"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send OTP <ArrowRight className="w-5 h-5" /></>}
        </button>

        <p className="text-center text-xs text-slate-500">
          Demo OTP: <span className="text-blue-400 font-bold">123456</span> · No SMS sent in demo mode.
        </p>
      </form>
    </OnboardingLayout>
  );
}
