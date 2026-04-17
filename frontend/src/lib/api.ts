// ─────────────────────────────────────────────────────────────────────────────
// API URL strategy
//
// LOCAL DEV  → NEXT_PUBLIC_API_BASE_URL=http://localhost:5000  (from .env.local)
//              Calls backend directly on localhost:5000
//
// VERCEL PROD → uses empty base "" so every apiUrl("/api/x") becomes "/api/x"
//               which hits src/app/api/[...path]/route.ts (server-side proxy)
//               → that proxy fetches from https://shieldpay-1.onrender.com
//               → Browser NEVER makes a cross-origin request → ZERO CORS issue
// ─────────────────────────────────────────────────────────────────────────────

const _raw = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();

// Extract a valid URL if present (guards against accidental extra text)
const _match = _raw.match(/https?:\/\/[^\s,;]+/);
const _extracted = _match ? _match[0].replace(/\/$/, "") : "";

// Only use a direct URL for localhost — everything else goes through the proxy
const API_BASE_URL = _extracted.includes("localhost") ? _extracted : "";

export const apiUrl = (path: string): string => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
};
