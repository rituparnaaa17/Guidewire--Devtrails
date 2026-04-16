"use client";

import { ReactNode } from "react";
import { Shield, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number;
  totalSteps?: number;
  title: string;
  subtitle: string;
  backHref?: string;
}

const STEPS = [
  { label: "Phone" },
  { label: "Verify" },
  { label: "Profile" },
  { label: "Work" },
  { label: "Consent" },
];

export default function OnboardingLayout({
  children,
  currentStep,
  totalSteps = 5,
  title,
  subtitle,
  backHref,
}: OnboardingLayoutProps) {
  const router = useRouter();
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-10 overflow-hidden">

      {/* ── Background image with dark overlay ── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/delivery-bg.png')" }}
      />
      {/* Dark gradient overlay so text is always readable */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-950/80 to-slate-900/90" />
      {/* Subtle glow spots */}
      <div className="absolute top-0 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Everything above background ── */}
      <div className="relative z-10 w-full flex flex-col items-center">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-6 md:mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-extrabold text-lg tracking-tight">ShieldPay</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-md">

          {/* Step tracker */}
          <div className="mb-5">
            <div className="flex justify-between items-start mb-3">
              {STEPS.map((step, i) => {
                const stepNum  = i + 1;
                const isDone    = stepNum < currentStep;
                const isCurrent = stepNum === currentStep;
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all duration-300 ${
                        isDone
                          ? "bg-blue-500 border-blue-500 text-white"
                          : isCurrent
                          ? "bg-white/10 border-blue-400 text-blue-300"
                          : "bg-white/5 border-slate-700 text-slate-600"
                      }`}
                    >
                      {isDone ? "✓" : stepNum}
                    </div>
                    <span
                      className={`text-[9px] font-semibold hidden sm:block ${
                        isCurrent ? "text-blue-300" : isDone ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="relative h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Content card */}
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 sm:p-7 shadow-2xl">

            {/* Back button — always rendered when backHref provided */}
            {backHref && (
              <button
                type="button"
                onClick={() => router.push(backHref)}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm font-semibold mb-5 transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                Back
              </button>
            )}

            <h1 className="text-xl sm:text-2xl font-extrabold text-white mb-1">{title}</h1>
            <p className="text-slate-400 text-sm mb-5 sm:mb-7 leading-relaxed">{subtitle}</p>
            {children}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-600 text-xs mt-4">
            Step {currentStep} of {totalSteps} · ShieldPay © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
