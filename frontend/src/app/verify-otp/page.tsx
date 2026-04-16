"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import OnboardingLayout from "@/components/OnboardingLayout";
import { apiUrl } from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";

export default function VerifyOtpPage() {
  const router = useRouter();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  useEffect(() => {
    const stored = sessionStorage.getItem("sp_phone");
    if (!stored) router.push("/get-started");
    else setPhone(stored);
  }, [router]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  const handleChange = (idx: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[idx] = val.slice(-1);
    setOtp(newOtp);
    if (val && idx < 5) refs[idx + 1].current?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) refs[idx - 1].current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(""));
      refs[5].current?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length < 6) return;
    setLoading(true);
    setError(null);

    try {
      const res  = await fetch(apiUrl("/api/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid OTP. Please try again.");
        setLoading(false);
        return;
      }

      setToken(data.token);
      setUser(data.user);

      if (data.isNewUser || !data.user.onboardingDone) {
        router.push("/profile");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Cannot reach server. Ensure the backend is running.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !phone) return;
    setResending(true);
    await fetch(apiUrl("/api/auth/send-otp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setResending(false);
    setCooldown(30);
    setOtp(["", "", "", "", "", ""]);
    refs[0].current?.focus();
  };

  const code = otp.join("");

  return (
    <OnboardingLayout currentStep={2} backHref="/get-started" title="Verify your number" subtitle={`Enter the 6-digit OTP sent to +91 ${phone}. Demo: use 123456.`}>
      <div className="space-y-6">
        {/* OTP input boxes */}
        <div className="flex gap-2 justify-between w-full" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-full max-w-[48px] sm:max-w-[56px] h-12 sm:h-14 text-center text-lg sm:text-xl font-bold bg-white/5 border-2 border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all caret-blue-400"
            />
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={code.length < 6 || loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:-translate-y-0.5"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify & Continue <ArrowRight className="w-5 h-5" /></>}
        </button>

        <div className="text-center">
          <button
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="text-sm text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed flex items-center gap-2 mx-auto transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
