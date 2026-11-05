export const config = { runtime: "edge" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function decodeHtml(html = "") {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSearchQuery(rawQuery = "") {
  if (typeof rawQuery !== "string") return "";
  return rawQuery
    .replace(/^\/search\s*/i, "")
    .replace(/\b(?:please\s+)?(?:search\s+(?:the\s+)?web\s+for|search\s+for|look\s+up|google)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export async function searchTavily(query, apiKey, maxResults = 5) {
  if (!apiKey || !query) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.results) || data.results.length === 0) return null;
    return data.results.slice(0, maxResults).map(item => ({
      title: (item.title || "").trim(),
      url: item.url,
      content: (item.content || "").trim().slice(0, 1000),
      provider: "tavily",
    }));
  } catch {
    return null;
  }
}

export async function searchDuckDuckGo(query, maxResults = 5) {
  if (!query) return [];
  try {
    const form = new URLSearchParams({ q: query });
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const linkRegex = /<a\b(?=[^>]*class=[\x27"]result-link[\x27"])(?=[^>]*href=[\x27"]([^\x27"]+)[\x27"])[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<td\b[^>]*class=[\x27"]result-snippet[\x27"][^>]*>([\s\S]*?)<\/td>/gi;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      let url = match[1];
      if (url.includes("uddg=")) {
        try {
          const parsed = new URL(url, "https://duckduckgo.com");
          url = decodeURIComponent(parsed.searchParams.get("uddg") || url);
        } catch {
          /* ignore malformed url */
        }
      }
      links.push({ url, title: decodeHtml(match[2]) });
    }
    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(decodeHtml(match[1]));
    }
    const results = [];
    for (let i = 0; i < Math.min(links.length, snippets.length, maxResults); i++) {
      if (links[i].url && links[i].title) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          content: snippets[i] || "",
          provider: "duckduckgo",
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function performWebSearch(rawQuery, maxResults = 5) {
  const query = cleanSearchQuery(rawQuery);
  if (!query) return { query: "", results: [], provider: "none" };

  const env = globalThis.process?.env || {};
  const tavilyKey = env.TAVILY_API_KEY || env.TAVILY_KEY || "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";

  if (tavilyKey) {
    const tavilyResults = await searchTavily(query, tavilyKey, maxResults);
    if (tavilyResults && tavilyResults.length > 0) {
      return { query, results: tavilyResults, provider: "tavily" };
    }
  }

  // Fallback to DuckDuckGo lite search
  const ddgResults = await searchDuckDuckGo(query, maxResults);
  return {
    query,
    results: ddgResults,
    provider: ddgResults.length > 0 ? "duckduckgo" : "none",
  };
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  try {
    const rawBody = await req.text();
    let body;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: { message: "Request body must be valid JSON." } }, 400); }

    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return json({ error: { message: "Search query is required." } }, 400);

    const maxResults = Math.max(1, Math.min(Number(body.maxResults) || 5, 10));
    const searchData = await performWebSearch(query, maxResults);

    return json({
      ok: true,
      query: searchData.query,
      provider: searchData.provider,
      results: searchData.results,
    });
  } catch {
    return json({ error: { message: "Search failed. Please try again." } }, 500);
  }
}
