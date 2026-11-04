export const artifactFilename = value => (value || "manshverse-artifact")
  .normalize("NFKD").replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-").slice(0, 72) || "manshverse-artifact";

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

export const makeArtifactHtml = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:48px 24px;background:#fff;color:#24202a;font:16px/1.7 Inter,system-ui,sans-serif}main{max-width:820px;margin:0 auto}h1,h2,h3{line-height:1.25;margin:1.5em 0 .55em}h1{margin-top:0}a{color:#536719}pre{overflow:auto;padding:16px;background:#f3f3ed;border-radius:2px}code{font-family:ui-monospace,monospace}blockquote{margin-inline:0;padding-left:16px;border-left:3px solid #d8f05a;color:#62596c}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}img{max-width:100%}@media print{body{padding:0}a{color:inherit;text-decoration:none}}</style></head><body><main>${body}</main></body></html>`;

export const extractArtifactFiles = source => {
  const files = {};
  const fence = /```([\w+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(source))) {
    const before = source.slice(Math.max(0, match.index - 240), match.index);
    const filename = before.match(/(?:^|\n)\s*(?:\d+[.)]?\s*)?([\w.-]+\.(?:html?|css|js))\s*$/i)?.[1];
    const lang = match[1].toLowerCase();
    const code = match[2].replace(/\n$/, "");
    const inferred = filename || (lang === "html" || /<!doctype html|<html[\s>]/i.test(code) ? "index.html" : lang === "css" ? "style.css" : lang === "js" || lang === "javascript" ? "script.js" : null);
    if (inferred && /\.(html?|css|js)$/i.test(inferred)) files[inferred] = code;
  }
  return files;
};

export const buildArtifactWebsite = files => {
  const entries = Object.entries(files || {});
  const htmlEntry = entries.find(([name]) => /\.html?$/i.test(name));
  const css = entries.filter(([name]) => /\.css$/i.test(name)).map(([, code]) => code).join("\n");
  const js = entries.filter(([name]) => /\.js$/i.test(name)).map(([, code]) => code).join("\n");
  let html = htmlEntry?.[1] || "<main><h1>Website preview</h1><p>Add an HTML file to preview this artifact.</p></main>";
  html = html.replace(/<link\b[^>]*href=['"][^'"]+\.css(?:\?[^'"]*)?['"][^>]*>/gi, "");
  html = html.replace(/<script\b[^>]*src=['"][^'"]+\.js(?:\?[^'"]*)?['"][^>]*>\s*<\/script>/gi, "");
  if (css) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `<style>${css.replace(/<\/style/gi, "<\\/style")}</style></head>`) : `<style>${css}</style>${html}`;
  if (js) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body>`) : `${html}<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
  return html;
};

export const downloadArtifact = (name, content, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
