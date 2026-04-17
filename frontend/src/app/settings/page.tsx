"use client";

import Link from "next/link";
import {
  ArrowLeft, User, ShieldCheck, Wallet, Bell, LifeBuoy,
  LogOut, Pencil, Check, X, Loader2, Phone, MapPin, Briefcase,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import { authHeaders, getUser, getToken, clearAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────
type UserState = {
  name: string;          phone: string;    email: string;
  aadhaarLast4: string;  upiId: string;    platform: string;
  city: string;          zone: string;     weeklyIncome: string;
  workType: string;      workHours: string;
  // preferences
  autoRenewal: string;   payoutFreq: string;
  weatherAlerts: string; claimAlerts: string; weeklySummary: string;
  activePlan: string;
};

const DEFAULT_USER: UserState = {
  name: "", phone: "", email: "", aadhaarLast4: "", upiId: "",
  platform: "", city: "", zone: "", weeklyIncome: "", workType: "", workHours: "",
  autoRenewal: "Enabled", payoutFreq: "Instant via UPI",
  weatherAlerts: "SMS Only", claimAlerts: "SMS Only", weeklySummary: "Email Only",
  activePlan: "—",
};

const DROPDOWN_OPTS: Partial<Record<keyof UserState, string[]>> = {
  platform:      ["Zomato", "Swiggy", "Zepto", "Blinkit", "Uber", "Rapido", "Other"],
  autoRenewal:   ["Enabled", "Disabled"],
  payoutFreq:    ["Instant via UPI", "Daily", "Weekly"],
  weatherAlerts: ["SMS Only", "Email Only", "SMS & WhatsApp", "All Channels"],
  claimAlerts:   ["SMS Only", "Email Only", "SMS & WhatsApp", "All Channels"],
  weeklySummary: ["SMS Only", "Email Only", "All Channels", "Disabled"],
  activePlan:    ["Dynamic Coverage"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function inputClass(focus = false) {
  return `w-full h-10 px-3 rounded-xl text-sm font-medium bg-white/5 border ${
    focus ? "border-blue-400 ring-2 ring-blue-400/20" : "border-white/10"
  } text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser]               = useState<UserState>(DEFAULT_USER);
  const [editingField, setEditingField] = useState<keyof UserState | null>(null);
  const [fieldDraft, setFieldDraft]   = useState("");
  const [isSavingField, setIsSavingField] = useState<keyof UserState | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: "", city: "" });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ── Bootstrap: pull data from localStorage (JWT-stored user) ──
  useEffect(() => {
    const jwtUser = getUser() as Record<string, unknown> | null;
    if (!jwtUser) { router.push("/get-started"); return; }

    const storedPlan = localStorage.getItem("shieldpay_plan");
    const planName   = storedPlan ? JSON.parse(storedPlan).name || "—" : "—";

    setUser((prev) => ({
      ...prev,
      name:         String(jwtUser.name          || ""),
      phone:        String(jwtUser.phone         || ""),
      aadhaarLast4: String(jwtUser.aadhaarLast4  || ""),
      upiId:        String(jwtUser.upiId         || ""),
      platform:     Array.isArray(jwtUser.platforms)
                      ? (jwtUser.platforms as string[]).join(", ")
                      : String(jwtUser.platforms || jwtUser.platform || ""),
      city:         String(jwtUser.city          || ""),
      zone:         String(jwtUser.zone          || ""),
      weeklyIncome: String(jwtUser.weeklyIncome  || ""),
      workType:     String(jwtUser.workType      || ""),
      workHours:    String(jwtUser.workHours     || ""),
      activePlan:   planName,
    }));

    // Also try fresh data from backend
    const token = getToken();
    if (!token) return;
    fetch(apiUrl("/api/user/profile"), { headers: authHeaders() as HeadersInit })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.success || !data?.data) return;
        const u = data.data;
        setUser((prev) => ({
          ...prev,
          name:         u.name         || prev.name,
          phone:        u.phone        || prev.phone,
          aadhaarLast4: u.aadhaarLast4 || prev.aadhaarLast4,
          upiId:        u.upiId        || prev.upiId,
          platform:     Array.isArray(u.platforms)
                          ? u.platforms.join(", ")
                          : u.platforms || prev.platform,
          city:         u.city         || prev.city,
          zone:         u.zone         || prev.zone,
          weeklyIncome: u.weeklyIncome || prev.weeklyIncome,
          workType:     u.workType     || prev.workType,
          workHours:    u.workHours    || prev.workHours,
        }));
      })
      .catch(() => {/* keep localStorage data */});
  }, [router]);

  // ── Persist a single field ─────────────────────────────────────────────────
  const applyField = useCallback(async (key: keyof UserState, value: string) => {
    const updated = { ...user, [key]: value };
    setUser(updated);
    // Merge into localStorage user object
    const existing = getUser() || {};
    const merged = { ...existing, [key]: value };
    localStorage.setItem("shieldpay_user", JSON.stringify(merged));

    setIsSavingField(key);
    try {
      await fetch(apiUrl("/api/user/profile"), {
        method: "PATCH",
        headers: authHeaders() as HeadersInit,
        body: JSON.stringify({ [key]: value }),
      });
    } catch { /* silent */ }
    setIsSavingField(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [user]);

  const commitField = async () => {
    if (!editingField) return;
    await applyField(editingField, fieldDraft);
    setEditingField(null);
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    await applyField("name", profileDraft.name);
    await applyField("city", profileDraft.city);
    setIsSavingProfile(false);
    setIsEditingProfile(false);
  };

  // ── Render a settings row value ────────────────────────────────────────────
  const renderValue = (key: keyof UserState) => {
    const opts     = DROPDOWN_OPTS[key];
    const isSaving = isSavingField === key;
    const isEditing = editingField === key;
    const display  = user[key] || "—";

    if (opts) return (
      <div className="flex items-center gap-2">
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
        <select
          value={user[key]}
          onChange={(e) => applyField(key, e.target.value)}
          disabled={!!isSaving}
          className="bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 font-semibold px-2 py-1 focus:outline-none focus:border-blue-400 transition cursor-pointer"
        >
          {opts.map((o) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
        </select>
      </div>
    );

    if (isEditing) return (
      <div className="flex items-center gap-2">
        <input
          autoFocus type="text" value={fieldDraft}
          onChange={(e) => setFieldDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitField(); if (e.key === "Escape") setEditingField(null); }}
          className="bg-white/5 border border-blue-400 rounded-lg text-sm text-white font-semibold px-2 py-1 w-40 focus:outline-none"
        />
        <button onClick={commitField} className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-500"><Check className="w-3.5 h-3.5 text-white" /></button>
        <button onClick={() => setEditingField(null)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><X className="w-3.5 h-3.5 text-slate-300" /></button>
      </div>
    );

    return (
      <div className="flex items-center gap-2 group/row">
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
        <span className="text-slate-300 text-sm font-semibold">{display}</span>
        <button
          onClick={() => { setEditingField(key); setFieldDraft(user[key]); }}
          className="opacity-0 group-hover/row:opacity-100 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center transition-opacity hover:bg-white/20"
        >
          <Pencil className="w-3 h-3 text-slate-400" />
        </button>
      </div>
    );
  };

  const GROUPS = [
    {
      title: "Personal Info", icon: <User className="w-4 h-4 text-blue-400" />, items: [
        { label: "Full Name",      key: "name"         as keyof UserState },
        { label: "Phone Number",   key: "phone"        as keyof UserState },
        { label: "Aadhaar Last 4", key: "aadhaarLast4" as keyof UserState },
        { label: "UPI ID",         key: "upiId"        as keyof UserState },
      ],
    },
    {
      title: "Work Details", icon: <Briefcase className="w-4 h-4 text-indigo-400" />, items: [
        { label: "Platform(s)",    key: "platform"    as keyof UserState },
        { label: "City",           key: "city"        as keyof UserState },
        { label: "Zone",           key: "zone"        as keyof UserState },
        { label: "Weekly Income",  key: "weeklyIncome" as keyof UserState },
        { label: "Work Type",      key: "workType"    as keyof UserState },
        { label: "Work Hours/week",key: "workHours"   as keyof UserState },
      ],
    },
    {
      title: "Coverage", icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />, items: [
        { label: "Active Plan",  key: "activePlan"  as keyof UserState },
        { label: "Auto-Renewal", key: "autoRenewal" as keyof UserState },
      ],
    },
    {
      title: "Payout Preferences", icon: <Wallet className="w-4 h-4 text-amber-400" />, items: [
        { label: "Payout Frequency", key: "payoutFreq" as keyof UserState },
      ],
    },
    {
      title: "Alerts & Notifications", icon: <Bell className="w-4 h-4 text-rose-400" />, items: [
        { label: "Weather Warnings", key: "weatherAlerts" as keyof UserState },
        { label: "Claim Updates",    key: "claimAlerts"   as keyof UserState },
        { label: "Weekly Summary",   key: "weeklySummary" as keyof UserState },
      ],
    },
  ];

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      {/* Glow orbs */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-96 h-96 bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 container mx-auto max-w-3xl px-4 sm:px-6 py-8 pb-20">

        {/* Back nav */}
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm font-semibold mb-8 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Dashboard
        </Link>

        {/* Save success toast */}
        {saveSuccess && (
          <div className="mb-6 px-4 py-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Saved successfully!
          </div>
        )}

        {/* Profile header card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 text-white font-black text-xl sm:text-2xl">
            {initials}
          </div>

          <div className="flex-1 text-center sm:text-left">
            {isEditingProfile ? (
              <div className="space-y-2 mb-3">
                <input type="text" value={profileDraft.name}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))}
                  className={inputClass()} placeholder="Full Name" />
                <input type="text" value={profileDraft.city}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, city: e.target.value }))}
                  className={inputClass()} placeholder="City" />
                <div className="flex gap-2 pt-1">
                  <button onClick={saveProfile} disabled={isSavingProfile}
                    className="h-8 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors">
                    {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                  </button>
                  <button onClick={() => setIsEditingProfile(false)}
                    className="h-8 px-4 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white">{user.name || "Your Name"}</h1>
                <div className="flex flex-wrap justify-center sm:justify-start items-center gap-3 mt-1.5">
                  {user.phone && <span className="flex items-center gap-1 text-slate-400 text-sm"><Phone className="w-3.5 h-3.5" />{user.phone}</span>}
                  {user.city  && <span className="flex items-center gap-1 text-slate-400 text-sm"><MapPin className="w-3.5 h-3.5" />{user.city}{user.zone ? `, ${user.zone}` : ""}</span>}
                  {user.platform && <span className="text-blue-400 text-xs font-bold bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">{user.platform}</span>}
                </div>
                {user.activePlan && user.activePlan !== "—" && (
                  <span className="inline-block mt-2 text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
                    Active: {user.activePlan}
                  </span>
                )}
              </>
            )}

            {!isEditingProfile && (
              <button
                onClick={() => { setProfileDraft({ name: user.name, city: user.city }); setIsEditingProfile(true); }}
                className="mt-3 h-8 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Settings groups */}
        <div className="space-y-4 mb-8">
          {GROUPS.map((group, gi) => (
            <div key={gi} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  {group.icon}
                </div>
                <h2 className="text-sm font-bold text-slate-200">{group.title}</h2>
              </div>
              <div className="divide-y divide-white/5">
                {group.items.map((item, ii) => (
                  <div key={ii} className="flex justify-between items-center px-5 py-3.5 hover:bg-white/3 transition-colors group">
                    <span className="text-slate-400 text-sm font-medium">{item.label}</span>
                    {renderValue(item.key)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Support & Logout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center hover:bg-white/8 transition-colors cursor-pointer">
            <div className="w-11 h-11 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
              <LifeBuoy className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-bold text-white mb-1 text-sm">Help & Support</h3>
            <p className="text-xs text-slate-500 mb-3">Contact our team for claim assistance</p>
            <button className="w-full h-9 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/10 transition-colors">
              Contact Us
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center hover:bg-rose-500/5 transition-colors cursor-pointer">
            <div className="w-11 h-11 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
              <LogOut className="w-5 h-5 text-rose-400" />
            </div>
            <h3 className="font-bold text-white mb-1 text-sm">Sign Out</h3>
            <p className="text-xs text-slate-500 mb-3">Securely log out of ShieldPay</p>
            <button
              onClick={() => { clearAuth(); localStorage.removeItem("shieldpay_plan"); router.push("/"); }}
              className="w-full h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>

        <p className="text-center text-slate-700 text-xs mt-8">ShieldPay v2.0 · © 2026</p>
      </div>
    </div>
  );
}
