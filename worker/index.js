// Canonical Worker for all King-family sites (ported from functions/_middleware.js).
// (a) Strict Accept-based Markdown negotiation, with AI-crawler signal headers
//     and a ~token-count hint.
// (b) Advertise the Markdown alternate via a Link header on HTML documents.
// (c) Staging only (env.SITE_ENV === "staging"): noindex everything, block robots.
import { prefersMarkdown, mdSiblingPath, estimateTokens } from "./negotiate.js";

// AI-crawler signals attached to served markdown (mirrors site _headers intent).
const MD_SIGNALS = {
  "Content-Signal": "ai-train=no, search=yes, ai-input=yes",
  "Content-Usage": "train-ai=n, search=y, ai-input=y",
};

const STAGING_ROBOTS = "User-agent: *\nDisallow: /\n";

/** Absolute URL of the Markdown sibling for a request URL, or null. */
function mdUrlFor(requestUrl) {
  const url = new URL(requestUrl);
  const mdPath = mdSiblingPath(url.pathname);
  if (!mdPath) return null;
  url.pathname = mdPath;
  return url.toString();
}

/** Add "Accept" to Vary without dropping existing values. */
function addVaryAccept(headers) {
  const existing = headers.get("Vary") || "";
  const parts = existing.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === "accept")) parts.push("Accept");
  headers.set("Vary", parts.join(", "));
}

/** Markdown negotiation + HTML advertisement. env.ASSETS is the static-assets binding. */
export async function handle(request, env) {
  const method = request.method;
  const accept = request.headers.get("Accept") || "";
  const mdUrl = mdUrlFor(request.url);

  if (env.SITE_ENV === "staging" && new URL(request.url).pathname === "/robots.txt") {
    return new Response(method === "HEAD" ? null : STAGING_ROBOTS, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // (a) Strict negotiation: only GET/HEAD, only when Markdown is preferred.
  if (mdUrl && (method === "GET" || method === "HEAD") && prefersMarkdown(accept)) {
    try {
      const asset = await env.ASSETS.fetch(new Request(mdUrl, { method: "GET" }));
      if (asset.status === 200) {
        const markdown = await asset.text();
        // Preserve cache-relevant headers (ETag/Cache-Control) from the asset.
        const headers = new Headers(asset.headers);
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        headers.set("Content-Length", String(new TextEncoder().encode(markdown).length));
        headers.set("X-Markdown-Tokens", String(estimateTokens(markdown)));
        for (const [k, v] of Object.entries(MD_SIGNALS)) headers.set(k, v);
        addVaryAccept(headers);
        // HEAD must not carry a body; Content-Length above reflects GET length.
        return new Response(method === "HEAD" ? null : markdown, { status: 200, headers });
      }
    } catch {
      // ASSETS error -> fail open to the HTML response below.
    }
  }

  // (b) Advertise on 200 text/html documents.
  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("Content-Type") || "";
  if (mdUrl && response.status === 200 && contentType.startsWith("text/html")) {
    const headers = new Headers(response.headers);
    headers.append("Link", `<${mdUrl}>; rel="alternate"; type="text/markdown"`);
    addVaryAccept(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}

/** (c) Staging: mark every response noindex so staging.* never enters a search index. */
function applyStaging(response, env) {
  if (env.SITE_ENV !== "staging") return response;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    return applyStaging(await handle(request, env), env);
  },
};
