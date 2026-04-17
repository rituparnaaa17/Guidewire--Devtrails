import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No rewrites needed — /api/* is handled by src/app/api/[...path]/route.ts
  // which proxies server-side to the Render backend (zero CORS)
};

export default nextConfig;
