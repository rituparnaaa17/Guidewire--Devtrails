import { NextRequest, NextResponse } from "next/server";

// ── Hardcoded Render backend URL ──────────────────────────────────────────────
// This runs on Vercel's server — the browser never makes a cross-origin request.
// It doesn't matter what CORS the Render backend has configured.
const BACKEND = "https://shieldpay-1.onrender.com";

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Build the target URL, preserving query string
  const { path } = await params;
  const search = req.nextUrl.search ?? "";
  const target = `${BACKEND}/api/${path.join("/")}${search}`;

  // Forward only safe, non-browser headers
  const forwardHeaders: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") ?? "application/json",
  };
  const auth = req.headers.get("authorization");
  if (auth) forwardHeaders["Authorization"] = auth;

  // Read body for mutating methods
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    body = await req.text();
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    console.error("[proxy] upstream fetch failed:", err);
    return NextResponse.json(
      { success: false, message: "Backend unreachable. Please try again." },
      { status: 502 }
    );
  }
}

export const GET    = proxy;
export const POST   = proxy;
export const PUT    = proxy;
export const PATCH  = proxy;
export const DELETE = proxy;
