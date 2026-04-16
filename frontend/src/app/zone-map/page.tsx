"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, User } from "lucide-react";
import { FadeUp } from "@/components/animated/FadeUp";
import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
const earningsChartData = [
  { day: "Mon", earnings: 400 },
  { day: "Tue", earnings: 600 },
  { day: "Wed", earnings: 350 },
  { day: "Thu", earnings: 800 },
  { day: "Fri", earnings: 0 },
  { day: "Sat", earnings: 0 },
  { day: "Sun", earnings: 0 },
];

const weeklyEarnings = earningsChartData.map((item, index) => ({
  day: item.day,
  income: item.earnings,
  protection: index === 4 || index === 5 || index === 6 ? 0 : item.earnings,
}));

export default function ZoneMapPage() {
  const [user, setUser] = useState({ city: "Bengaluru", zone: "Koramangala" });
  const [plan, setPlan] = useState({ price: 85, cap: 4500 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('shieldpay_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
      const storedPlan = localStorage.getItem('shieldpay_plan');
      if (storedPlan) {
        setPlan(JSON.parse(storedPlan));
      }
    } catch(e) {}
    setIsLoading(false);
  }, []);

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-6 pb-20">
      <div className="container mx-auto max-w-3xl">
        <Link href="/dashboard" className="inline-flex items-center text-slate-500 hover:text-blue-600 mb-8 transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>
        
        <FadeUp className="mb-8">
           <h1 className="text-3xl font-extrabold mb-8 text-slate-900">Zone Map & Safety Stats</h1>
        </FadeUp>

        <FadeUp delay={0.1}>
          <div className="rounded-[1.9rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Zone safety</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">{user.zone}, {user.city}</h3>
              </div>
            </div>

            <div className="mt-5 rounded-3xl bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5 ring-1 ring-blue-100/70">
              <div className="flex items-center gap-4">
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-inner shadow-blue-100">
                  <div className="absolute inset-2 rounded-full border-8 border-blue-200/40 border-t-blue-500 border-r-blue-500 rotate-12" />
                  <span className="relative text-2xl font-black text-slate-900">3/5</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-500">Moderate risk today</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Live weather and AQI rules are monitoring this zone continuously.</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={`h-3 rounded-full ${step <= 3 ? "bg-gradient-to-r from-yellow-400 to-amber-300" : "bg-slate-200"}`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Statistics</h4>
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-500">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-white">Weekly</span>
                  <span className="px-3 py-1">Monthly</span>
                </div>
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyEarnings} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <RechartsTooltip
                      cursor={{ fill: '#eff6ff' }}
                      contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 16px 40px -20px rgb(15 23 42 / 0.35)' }}
                    />
                    <Bar dataKey="income" name="Actual earnings" fill="#94a3b8" radius={[8, 8, 0, 0]} barSize={18} />
                    <Bar dataKey="protection" name="ShieldPay coverage" fill="#2563eb" radius={[8, 8, 0, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Income this week</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">₹4,930</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Premium</p>
                  <p className="mt-1 text-2xl font-black text-blue-600">₹{plan.price}</p>
                </div>
              </div>
            </div>
          </div>
        </FadeUp>

      </div>
    </div>
  );
}
