"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MapPin, Clock, DollarSign } from "lucide-react";
import OnboardingLayout from "@/components/OnboardingLayout";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser, setUser } from "@/lib/auth";

const CITIES = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata"];

const ZONES_BY_CITY: Record<string, string[]> = {
  Mumbai:    ["Andheri", "Bandra", "Dadar", "Kurla", "Thane", "Borivali"],
  Delhi:     ["Connaught Place", "Dwarka", "Noida", "Gurugram", "Lajpat Nagar"],
  Bangalore: ["Koramangala", "Whitefield", "Electronic City", "Indiranagar", "HSR Layout"],
  Chennai:   ["Adyar", "Velachery", "Anna Nagar", "T. Nagar", "Porur"],
  Hyderabad: ["Hitech City", "Banjara Hills", "Secunderabad", "Madhapur"],
  Pune:      ["Kothrud", "Viman Nagar", "Hinjewadi", "Wagholi"],
  Kolkata:   ["Park Street", "Salt Lake", "New Town", "Howrah"],
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORK_TYPES = [
  { value: "delivery", label: "Food/Grocery Delivery" },
  { value: "construction", label: "Construction" },
  { value: "domestic", label: "Domestic Work" },
  { value: "factory", label: "Factory Worker" },
  { value: "agriculture", label: "Agriculture" },
  { value: "retail", label: "Retail" },
  { value: "other", label: "Other" },
];

export default function WorkDetailsPage() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [zone, setZone] = useState("");
  const [weeklyIncome, setWeeklyIncome] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [workType, setWorkType] = useState("delivery");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (d: string) =>
    setWorkingDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const isValid = city && zone && weeklyIncome && workingHours && workingDays.length > 0;

  const handleNext = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/user/onboarding"), {
        method: "PUT",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({
          city, zone, weeklyIncome: Number(weeklyIncome),
          workingHours: Number(workingHours), shiftStart, shiftEnd,
          workingDays, workType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Failed to save."); setLoading(false); return; }

      // Merge ALL fields (city, zone, weeklyIncome, workType, etc.) into stored user
      const existing = getUser() || {};
      const merged = {
        ...existing,
        ...data.user,
        // Keep local state as fallback if backend didn't echo back a field
        city:         data.user?.city         ?? city,
        zone:         data.user?.zone         ?? zone,
        weeklyIncome: data.user?.weeklyIncome ?? weeklyIncome,
        workType:     data.user?.workType     ?? workType,
        workingHours: data.user?.workingHours ?? workingHours,
        shiftStart:   data.user?.shiftStart   ?? shiftStart,
        shiftEnd:     data.user?.shiftEnd     ?? shiftEnd,
        workingDays:  data.user?.workingDays  ?? workingDays,
      };
      setUser(merged);
      router.push("/consent");
    } catch { setError("Server unreachable."); setLoading(false); }
  };

  return (
    <OnboardingLayout currentStep={4} backHref="/profile" title="Your work details" subtitle="Help us calculate your coverage based on your work schedule.">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select value={city} onChange={(e) => { setCity(e.target.value); setZone(""); }}
                className="w-full h-12 pl-9 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white appearance-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm">
                <option value="" className="bg-slate-800">Select City</option>
                {CITIES.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Zone / Area</label>
            <select value={zone} onChange={(e) => setZone(e.target.value)} disabled={!city}
              className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white appearance-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm disabled:opacity-40">
              <option value="" className="bg-slate-800">Select Area</option>
              {(ZONES_BY_CITY[city] || []).map((z) => <option key={z} value={z} className="bg-slate-800">{z}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Work Type</label>
          <select value={workType} onChange={(e) => setWorkType(e.target.value)}
            className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white appearance-none focus:outline-none focus:border-blue-400 transition-all text-sm">
            {WORK_TYPES.map((t) => <option key={t.value} value={t.value} className="bg-slate-800">{t.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <DollarSign className="inline w-3.5 h-3.5 mr-1" />Weekly Income (₹)
            </label>
            <input type="number" value={weeklyIncome} onChange={(e) => setWeeklyIncome(e.target.value)}
              placeholder="e.g. 4500" min="500"
              className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <Clock className="inline w-3.5 h-3.5 mr-1" />Daily Hours
            </label>
            <input type="number" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)}
              placeholder="e.g. 8" min="1" max="16"
              className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Shift Start</label>
            <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)}
              className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm [color-scheme:dark]" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Shift End</label>
            <input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)}
              className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-sm [color-scheme:dark]" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-3">Working Days</label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((d) => {
              const active = workingDays.includes(d);
              return (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-4 h-10 rounded-xl text-sm font-bold border transition-all ${active ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"}`}>
                  {d}
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
