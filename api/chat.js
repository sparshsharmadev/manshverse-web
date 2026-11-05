import { performWebSearch, cleanSearchQuery, shouldPerformWebSearch, isExplicitSearch } from "./search.js";

export const config = { runtime: "edge" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const GROQ_MODELS = new Set([
  "mansh/auto",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
]);
const MODEL_AUTO = "mansh/auto";
const MODEL_ARTIFACT = "qwen/qwen3.8-27b";
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_MESSAGES = 80;
const MAX_TEXT_CHARS = 180_000;

// shouldAutoSearch is handled by shouldPerformWebSearch from ./search.js

function resolveSearchQuery(messages = [], requestedQuery = "") {
  const userMessages = messages.filter(m => m?.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  const lastText = typeof lastUser?.content === "string"
    ? lastUser.content
    : Array.isArray(lastUser?.content) ? lastUser.content.map(p => p?.text || "").join(" ") : "";

  const prevUser = userMessages[userMessages.length - 2];
  const prevText = typeof prevUser?.content === "string"
    ? prevUser.content
    : Array.isArray(prevUser?.content) ? prevUser.content.map(p => p?.text || "").join(" ") : "";

  const clean = cleanSearchQuery(requestedQuery || lastText);
  const isShortFollowUp = clean.length < 35 || /\b(he|she|it|they|this|that|him|her|them|isn't|aren't|did he|was he|when|where|why|sure|really)\b/i.test(clean);
  if (isShortFollowUp && prevText) {
    return cleanSearchQuery(`${prevText} ${clean}`);
  }
  return clean;
}

function selectManshModel(messages = []) {
  if (!Array.isArray(messages)) return "openai/gpt-oss-20b";
  const userMessages = messages.filter(message => message?.role === "user");
  const hasImage = userMessages.some(message => Array.isArray(message.content)
    && message.content.some(part => part?.type === "image_url" || part?.type === "input_image"));
  if (hasImage) return "qwen/qwen3.8-27b";

  const prompt = userMessages.map(message => typeof message.content === "string"
    ? message.content
    : Array.isArray(message.content) ? message.content.map(part => part?.text || "").join(" ") : "").join("\n");
  if (/\b(?:website|web\s?app|landing page|portfolio|prototype|dashboard)\b/i.test(prompt)) return MODEL_ARTIFACT;
  const needsDeeperReasoning = /```|\b(code|debug|architecture|compare|trade.?offs?|analy[sz]e|evaluate|strategy|multi[- ]step|step[- ]by[- ]step|break down|detailed plan)\b/i.test(prompt);
  return needsDeeperReasoning ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b";
}

async function requestGroq(groqKey, model, messages, stream, maxTokens) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({ model, messages, stream, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(120_000),
  });
}

async function reserveUsage(config, token, modelKey) {
  const response = await fetch(`${config.url}/rest/v1/rpc/consume_manshverse_usage`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_model_key: modelKey }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { error: json({ error: { message: "Usage service is unavailable. Apply the latest Supabase migration and retry." } }, 503) };
  const quota = await response.json();
  if (!quota?.allowed) {
    if (quota?.reason === "limit") return { error: json({ error: { message: "Daily limit reached for this model." }, usage: quota }, 429) };
    if (quota?.reason === "banned") return { error: json({ error: { message: "This account is suspended." } }, 403) };
    if (quota?.reason === "maintenance") return { error: json({ error: { message: "Manshverse is under maintenance." } }, 503) };
    return { error: json({ error: { message: "This request is not allowed." } }, 403) };
  }
  return { quota };
}

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
    const groqKey = globalThis.process?.env?.GROQ_API_KEY || globalThis.process?.env?.GROQ_KEY;
    if (!config.url || !config.key) return json({ error: { message: "Server auth is not configured." } }, 503);
    if (!groqKey) return json({ error: { message: "Server is missing GROQ_API_KEY." } }, 503);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: { message: "Request is too large." } }, 413);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: { message: "Request is too large." } }, 413);

    let body;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: { message: "Request body must be valid JSON." } }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: { message: "Invalid request body." } }, 400);
    const modelKey = body.model === MODEL_AUTO
      ? selectManshModel(body.messages)
      : typeof body.model === "string" && GROQ_MODELS.has(body.model) ? body.model : null;
    if (!modelKey) return json({ error: { message: "This Groq model is not available." } }, 400);
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

    const initialQuota = await reserveUsage(config, auth.token, modelKey);
    if (initialQuota.error) return initialQuota.error;
    if (!initialQuota.quota.admin) reservation = { config, token: auth.token, modelKey };

    const maxTokens = Math.max(1, Math.min(Number(body.max_tokens) || 2048, 4096));
    let responseModel = modelKey;

    let searchSources = [];
    let messagesToSend = body.messages.map(m => ({ ...m }));
    const lastUserMsg = [...body.messages].reverse().find(m => m?.role === "user");
    const userText = typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.map(p => p?.text || "").join(" ")
        : "";
    const isExplicit = Boolean(body.explicitSearch || isExplicitSearch(userText) || isExplicitSearch(body.searchQuery));
    const wantWebSearch = shouldPerformWebSearch({
      text: userText,
      isWebSearchEnabled: Boolean(body.webSearch),
      isExplicitSearchCommand: isExplicit,
    });

    let didSearch = false;
    if (wantWebSearch) {
      const queryToSearch = resolveSearchQuery(body.messages, isExplicit ? (body.searchQuery || userText) : userText);
      if (queryToSearch) {
        const searchData = await performWebSearch(queryToSearch, 5);
        if (Array.isArray(searchData.results) && searchData.results.length > 0) {
          didSearch = true;
          searchSources = searchData.results;
          const today = new Date().toISOString().split("T")[0];
          const searchContext = `\n\n--- REAL-TIME WEB SEARCH RESULTS (Current Date: ${today}) ---\n` +
            `Search Query: "${searchData.query}"\n` +
            `Search Provider: ${searchData.provider}\n\n` +
            searchData.results.map((r, i) => `[${i + 1}] "${r.title}"\nURL: ${r.url}\nSummary: ${r.content}`).join("\n\n") +
            `\n\n--- CITATION RULES ---\n` +
            `- Answer accurately using the real-time search results above.\n` +
            `- Cite facts using bracket numbers like [1], [2], etc., immediately following the statements they support.\n` +
            `- Be completely up-to-date with current legal trials, allegations, charges, and verdicts.\n` +
            `- Do not invent sources, citations, or facts outside of these search results.\n---`;

          const sysIndex = messagesToSend.findIndex(m => m.role === "system");
          if (sysIndex >= 0) {
            messagesToSend[sysIndex] = {
              ...messagesToSend[sysIndex],
              content: messagesToSend[sysIndex].content + searchContext,
            };
          } else {
            messagesToSend.unshift({ role: "system", content: searchContext });
          }
        }
      }
    }

    let upstream = await requestGroq(groqKey, responseModel, messagesToSend, body.stream === true, maxTokens);
    let providerErrorText = "";
    if (!upstream.ok) {
      providerErrorText = await upstream.text();
      const isToolMismatch = /tool choice is none, but model called a tool|tool_use_failed/i.test(providerErrorText);
      if (isToolMismatch && modelKey.startsWith("openai/gpt-oss-")) {
        if (reservation) await releaseUsage(config, auth.token, modelKey);
        reservation = null;
        const fallbackQuota = await reserveUsage(config, auth.token, MODEL_ARTIFACT);
        if (fallbackQuota.error) return fallbackQuota.error;
        if (!fallbackQuota.quota.admin) reservation = { config, token: auth.token, modelKey: MODEL_ARTIFACT };
        responseModel = MODEL_ARTIFACT;
        upstream = await requestGroq(groqKey, responseModel, messagesToSend, body.stream === true, maxTokens);
        providerErrorText = upstream.ok ? "" : await upstream.text();
      }
    }
    const contentType = upstream.headers.get("Content-Type") || "application/json";
    if (!upstream.ok) {
      if (reservation) await releaseUsage(config, auth.token, reservation.modelKey);
      reservation = null;
      return new Response(providerErrorText || JSON.stringify({ error: { message: `Model provider request failed (${upstream.status}).` } }), {
        status: upstream.status,
        headers: { "Content-Type": contentType.includes("application/json") ? contentType : "application/json", "Cache-Control": "no-store" },
      });
    }

    const searchHeaders = {
      "X-Manshverse-Web-Search": didSearch ? "executed" : "skipped",
      ...(searchSources.length > 0 ? { "X-Manshverse-Sources": encodeURIComponent(JSON.stringify(searchSources)) } : {}),
      "Access-Control-Expose-Headers": "X-Manshverse-Model, X-Manshverse-Sources, X-Manshverse-Web-Search",
    };

    if (body.stream && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "X-Manshverse-Model": responseModel,
          ...searchHeaders,
        },
      });
    }
    const text = await upstream.text();
    if (!text) {
      if (reservation) await releaseUsage(config, auth.token, reservation.modelKey);
      reservation = null;
      return json({ error: { message: "The model provider returned an empty response." } }, 502);
    }
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType.includes("application/json") ? contentType : "application/json",
        "Cache-Control": "no-store",
        "X-Manshverse-Model": responseModel,
        ...searchHeaders,
      },
    });
  } catch (error) {
    if (reservation) await releaseUsage(reservation.config, reservation.token, reservation.modelKey);
    return json({ error: { message: error?.name === "TimeoutError" ? "The AI service timed out. Please retry." : "The AI service is temporarily unavailable." } }, 502);
  }
}
