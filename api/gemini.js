export const config = { runtime: "edge" };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  try {
    const env = globalThis.process?.env || {};
    const baseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
    const geminiKey = env.GEMINI_API_KEY || env.GEMINI_KEY;
    if (!baseUrl || !anonKey) return json({ error: { message: "Server auth is not configured." } }, 503);
    if (!geminiKey) return json({ error: { message: "Server is missing GEMINI_API_KEY." } }, 503);

    const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: { message: "Sign in to use Manshverse AI." } }, 401);
    const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!authResponse.ok) return json({ error: { message: "Your session is invalid or expired. Sign in again." } }, 401);
    const user = await authResponse.json();
    if (!user.email_confirmed_at && user.app_metadata?.role !== "admin") return json({ error: { message: "Verify your email before using AI features." } }, 403);

    const length = Number(req.headers.get("content-length") || 0);
    if (length > 6 * 1024 * 1024) return json({ error: { message: "Request is too large." } }, 413);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 6 * 1024 * 1024) return json({ error: { message: "Request is too large." } }, 413);
    let body;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: { message: "Request body must be valid JSON." } }, 400); }
    if (!body || typeof body !== "object" || !Array.isArray(body.contents) || body.contents.length < 1 || body.contents.length > 80) {
      return json({ error: { message: "Invalid Gemini request." } }, 400);
    }
    if (typeof body.modelId !== "string" || !/^gemini-[A-Za-z0-9.-]+$/.test(body.modelId)) {
      return json({ error: { message: "This model is not available." } }, 400);
    }

    const { modelId, ...payload } = body;
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await upstream.text();
    if (!text) return json({ error: { message: upstream.ok ? "Gemini returned an empty response." : `Gemini request failed (${upstream.status}).` } }, upstream.ok ? 502 : upstream.status);
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return json({ error: { message: error?.name === "TimeoutError" ? "The AI service timed out. Please retry." : "The AI service is temporarily unavailable." } }, 502);
  }
}
