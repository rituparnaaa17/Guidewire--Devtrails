// Extract a valid URL from the env var — guards against accidental extra text
// e.g. "this is our url : https://shieldpay-1.onrender.com" → "https://shieldpay-1.onrender.com"
const _rawEnv = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const _urlMatch = _rawEnv.match(/https?:\/\/[^\s,;]+/);
const API_BASE_URL = (_urlMatch ? _urlMatch[0] : "http://localhost:5000").replace(/\/$/, "");

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
