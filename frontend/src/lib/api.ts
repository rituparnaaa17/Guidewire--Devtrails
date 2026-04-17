// API base URL strategy:
//
// LOCAL DEV  → calls backend directly at http://localhost:5000
//              (NEXT_PUBLIC_API_BASE_URL is unset, falls back to localhost)
//
// VERCEL PROD → uses relative path "" so browser requests go to
//               /api/* on shieldpay-tau.vercel.app, which next.config.ts
//               rewrites server-side to https://shieldpay-1.onrender.com/api/*
//               → ZERO CORS because browser never makes a cross-origin request.

const _rawEnv = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const _urlMatch = _rawEnv.match(/https?:\/\/[^\s,;]+/);
const _directUrl = (_urlMatch ? _urlMatch[0] : "").replace(/\/$/, "");

// NEXT_PUBLIC_API_BASE_URL is only set locally (.env.local) for direct dev access.
// On Vercel, .env.production sets it to the Render URL — but we intentionally use
// an empty base so the Next.js rewrite proxy handles the routing instead.
const API_BASE_URL = _directUrl.includes("localhost") ? _directUrl : "";

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
