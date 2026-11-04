export const config = { runtime: "edge" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const MODEL_USAGE_KEYS = new Set([
  "openrouter/free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
  "cohere/north-mini-code:free",
]);
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_MESSAGES = 80;
const MAX_TEXT_CHARS = 180_000;

const messageTextSize = (content) => {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return Infinity;
  return content.reduce((total, part) => total + (part?.type === "text" && typeof part.text === "string" ? part.text.length : 0), 0);
};

function supabaseConfig() {
  return {
    url: (globalThis.process?.env?.SUPABASE_URL || globalThis.process?.env?.VITE_SUPABASE_URL || "").replace(/\/$/, ""),
    key: globalThis.process?.env?.SUPABASE_ANON_KEY || globalThis.process?.env?.VITE_SUPABASE_ANON_KEY || "",
  };
}

async function authenticate(req, config) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: json({ error: { message: "Sign in to use Manshverse AI." } }, 401) };

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { response: json({ error: { message: "Your session is invalid or expired. Sign in again." } }, 401) };
  const user = await response.json();
  if (!user.email_confirmed_at && user.app_metadata?.role !== "admin") {
    return { response: json({ error: { message: "Verify your email before using AI features." } }, 403) };
  }
  return { token, user };
}

async function releaseUsage(config, token, modelKey) {
  try {
    await fetch(`${config.url}/rest/v1/rpc/release_manshverse_usage`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_model_key: modelKey }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* A failed rollback must not hide the provider error. */ }
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  let reservation = null;
  try {
    const config = supabaseConfig();
    const openRouterKey = globalThis.process?.env?.OPENROUTER_API_KEY;
    if (!config.url || !config.key) return json({ error: { message: "Server auth is not configured." } }, 503);
    if (!openRouterKey) return json({ error: { message: "Server is missing OPENROUTER_API_KEY." } }, 503);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: { message: "Request is too large." } }, 413);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: { message: "Request is too large." } }, 413);

    let body;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: { message: "Request body must be valid JSON." } }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: { message: "Invalid request body." } }, 400);
    const modelKey = MODEL_USAGE_KEYS.has(body.model) ? body.model : null;
    if (!modelKey) return json({ error: { message: "This model is not available." } }, 400);
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
      return json({ error: { message: `Send between 1 and ${MAX_MESSAGES} messages.` } }, 400);
    }
    const textSize = body.messages.reduce((total, message) => {
      if (!message || !["system", "user", "assistant"].includes(message.role)) return Infinity;
      return total + messageTextSize(message.content);
    }, 0);
    if (!Number.isFinite(textSize) || textSize > MAX_TEXT_CHARS) return json({ error: { message: "Conversation is too large." } }, 413);

    const auth = await authenticate(req, config);
    if (auth.response) return auth.response;

    const quotaResponse = await fetch(`${config.url}/rest/v1/rpc/consume_manshverse_usage`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_model_key: modelKey }),
      signal: AbortSignal.timeout(8000),
    });
    if (!quotaResponse.ok) return json({ error: { message: "Usage service is unavailable. Apply the latest Supabase migration and retry." } }, 503);
    const quota = await quotaResponse.json();
    if (!quota?.allowed) {
      if (quota?.reason === "limit") return json({ error: { message: "Daily limit reached for this model." }, usage: quota }, 429);
      if (quota?.reason === "banned") return json({ error: { message: "This account is suspended." } }, 403);
      if (quota?.reason === "maintenance") return json({ error: { message: "Manshverse is under maintenance." } }, 503);
      return json({ error: { message: "This request is not allowed." } }, 403);
    }
    if (!quota.admin) reservation = { config, token: auth.token, modelKey };

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterKey}`,
        "HTTP-Referer": "https://manshverse.site",
        "X-Title": "Manshverse",
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        stream: body.stream === true,
        max_tokens: Math.max(1, Math.min(Number(body.max_tokens) || 2048, 4096)),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const contentType = upstream.headers.get("Content-Type") || "application/json";
    if (!upstream.ok) {
      await releaseUsage(config, auth.token, modelKey);
      reservation = null;
      const text = await upstream.text();
      return new Response(text || JSON.stringify({ error: { message: `OpenRouter request failed (${upstream.status}).` } }), {
        status: upstream.status,
        headers: { "Content-Type": contentType.includes("application/json") ? contentType : "application/json", "Cache-Control": "no-store" },
      });
    }
    if (body.stream && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    }
    const text = await upstream.text();
    if (!text) {
      await releaseUsage(config, auth.token, modelKey);
      reservation = null;
      return json({ error: { message: "OpenRouter returned an empty response." } }, 502);
    }
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": contentType.includes("application/json") ? contentType : "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (reservation) await releaseUsage(reservation.config, reservation.token, reservation.modelKey);
    return json({ error: { message: error?.name === "TimeoutError" ? "The AI service timed out. Please retry." : "The AI service is temporarily unavailable." } }, 502);
  }
}
