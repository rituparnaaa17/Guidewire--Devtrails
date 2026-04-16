"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, MapPin, CreditCard, BarChart3, Loader2, CheckCircle2, Circle } from "lucide-react";
import OnboardingLayout from "@/components/OnboardingLayout";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser, setUser } from "@/lib/auth";

interface ConsentItem {
  key: "consentGPS" | "consentPayment" | "consentPlatform";
  icon: React.ReactNode;
  title: string;
  description: string;
}

const CONSENTS: ConsentItem[] = [
  {
    key: "consentGPS",
    icon: <MapPin className="w-5 h-5 text-blue-400" />,
    title: "Location Access",
    description: "Allow ShieldPay to access your GPS location to verify disruption events in your zone and process claims accurately.",
  },
  {
    key: "consentPayment",
    icon: <CreditCard className="w-5 h-5 text-indigo-400" />,
    title: "Payment Authorization",
    description: "Authorize ShieldPay to collect weekly premiums via UPI and disburse claim payouts directly to your account.",
  },
  {
    key: "consentPlatform",
    icon: <BarChart3 className="w-5 h-5 text-violet-400" />,
    title: "Platform Data",
    description: "Allow ShieldPay to read your platform (Zomato/Swiggy/etc.) activity data anonymously to validate work disruption claims.",
  },
];

export default function ConsentPage() {
  const router = useRouter();
  const [consents, setConsents] = useState({ consentGPS: false, consentPayment: false, consentPlatform: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: keyof typeof consents) =>
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));

  const allChecked = Object.values(consents).every(Boolean);

  const handleFinish = async () => {
    if (!allChecked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/user/onboarding"), {
        method: "PUT",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify(consents),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to save."); setLoading(false); return; }
      const user = getUser();
      setUser({ ...user, ...data.user, onboardingDone: true });
      router.push("/plans");
    } catch { setError("Server unreachable."); setLoading(false); }
  };

  return (
    <OnboardingLayout currentStep={5} backHref="/work-details" title="Almost there!" subtitle="Review and accept these permissions to activate your ShieldPay protection.">
      <div className="space-y-4">
        {CONSENTS.map(({ key, icon, title, description }) => {
          const checked = consents[key];
          return (
            <button key={key} type="button" onClick={() => toggle(key)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 ${checked ? "border-blue-500 bg-blue-600/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${checked ? "bg-blue-600/20" : "bg-white/5"}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`font-bold text-sm ${checked ? "text-white" : "text-slate-300"}`}>{title}</h3>
                    {checked
                      ? <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      : <Circle className="w-5 h-5 text-slate-600 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
                </div>
              </div>
            </button>
          );
        })}

        {!allChecked && (
          <p className="text-center text-xs text-amber-400/80 flex items-center justify-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            All three permissions are required to activate coverage
          </p>
        )}

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>}

        <button onClick={handleFinish} disabled={!allChecked || loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 hover:-translate-y-0.5 mt-2">
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <><ShieldCheck className="w-5 h-5" /> Activate My Shield</>}
        </button>

        <p className="text-center text-xs text-slate-600">
          By activating, you agree to ShieldPay's Terms of Service & Privacy Policy.
        </p>
      </div>
    </OnboardingLayout>
  );
}
