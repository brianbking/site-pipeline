import { describe, it, expect } from "vitest";
import worker from "../worker/index.js";

const BASE = "https://site.test";
const HTML = "<!doctype html><title>t</title>";
const MD = "# Home\n\nHello world.\n";

/** Stub of the Workers static-assets binding: pathname -> { body, type }. */
function makeAssets(files, { throwOn } = {}) {
  return {
    async fetch(input) {
      const req = input instanceof Request ? input : new Request(input);
      const { pathname } = new URL(req.url);
      if (throwOn && pathname.endsWith(throwOn)) throw new Error("assets down");
      const key = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = files[key];
      if (!file) return new Response("not found", { status: 404, headers: { "Content-Type": "text/html" } });
      const headers = { "Content-Type": file.type, ...(file.headers || {}) };
      return new Response(req.method === "HEAD" ? null : file.body, { status: 200, headers });
    },
  };
}

const SITE = {
  "/index.html": { body: HTML, type: "text/html; charset=utf-8" },
  "/index.md": { body: MD, type: "text/markdown; charset=utf-8", headers: { ETag: '"abc"' } },
  "/about/index.html": { body: HTML, type: "text/html; charset=utf-8", headers: { Vary: "Accept-Encoding" } },
  "/robots.txt": { body: "User-agent: *\nAllow: /\n", type: "text/plain" },
  "/css/site.css": { body: "body{}", type: "text/css" },
};

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const call = (path, { method = "GET", accept = BROWSER, env = {}, files = SITE, throwOn } = {}) =>
  worker.fetch(new Request(BASE + path, { method, headers: { Accept: accept } }), {
    ASSETS: makeAssets(files, { throwOn }),
    ...env,
  });

describe("markdown negotiation", () => {
  it("serves the markdown sibling when markdown is preferred", async () => {
    const res = await call("/", { accept: "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(MD);
    expect(res.headers.get("X-Markdown-Tokens")).toBe(String(Math.ceil(MD.length / 4)));
    expect(res.headers.get("Content-Signal")).toBe("ai-train=no, search=yes, ai-input=yes");
    expect(res.headers.get("Content-Usage")).toBe("train-ai=n, search=y, ai-input=y");
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(res.headers.get("ETag")).toBe('"abc"');
  });

  it("still negotiates when the URL carries a query string", async () => {
    const res = await call("/?utm_source=feed", { accept: "text/markdown" });
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(MD);
  });

  it("answers HEAD with headers only and the GET Content-Length", async () => {
    const res = await call("/", { method: "HEAD", accept: "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(MD).length));
    expect(res.body).toBeNull();
  });

  it("gives HTML when markdown and HTML have equal q", async () => {
    const res = await call("/", { accept: "text/markdown, text/html" });
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("falls back to HTML when the markdown sibling is missing", async () => {
    const res = await call("/about/", { accept: "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("falls back to HTML when the assets binding throws for the markdown fetch", async () => {
    const res = await call("/", { accept: "text/markdown", throwOn: ".md" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });

  it("does not negotiate for POST", async () => {
    const res = await call("/", { method: "POST", accept: "text/markdown" });
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
  });
});

describe("HTML advertisement", () => {
  it("adds the markdown alternate Link and Vary: Accept to HTML pages", async () => {
    const res = await call("/");
    expect(res.headers.get("Link")).toBe(`<${BASE}/index.md>; rel="alternate"; type="text/markdown"`);
    expect(res.headers.get("Vary")).toBe("Accept");
    expect(await res.text()).toBe(HTML);
  });

  it("keeps an existing Vary value", async () => {
    const res = await call("/about/");
    expect(res.headers.get("Vary")).toBe("Accept-Encoding, Accept");
  });

  it("does not advertise on non-HTML files", async () => {
    const res = await call("/css/site.css");
    expect(res.headers.get("Link")).toBeNull();
  });

  it("does not advertise on 404s", async () => {
    const res = await call("/missing/");
    expect(res.status).toBe(404);
    expect(res.headers.get("Link")).toBeNull();
  });
});

describe("staging", () => {
  const env = { SITE_ENV: "staging" };

  it("marks HTML responses noindex", async () => {
    const res = await call("/", { env });
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Link")).toContain("rel=\"alternate\"");
  });

  it("marks markdown responses noindex", async () => {
    const res = await call("/", { env, accept: "text/markdown" });
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("serves a disallow-all robots.txt", async () => {
    const res = await call("/robots.txt", { env });
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("leaves production robots.txt and headers alone", async () => {
    const res = await call("/robots.txt");
    expect(await res.text()).toBe("User-agent: *\nAllow: /\n");
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });
});

describe("private paths", () => {
  const PREVIEW = "https://pr-7-brianbking.acct.workers.dev";
  const FILES = {
    ...SITE,
    "/resume/index.html": { body: "<!doctype html><title>CV</title>", type: "text/html; charset=utf-8" },
    "/resume/index.md": { body: "# CV\n", type: "text/markdown; charset=utf-8" },
    "/resume/cv.pdf": { body: "%PDF-1.7", type: "application/pdf" },
    "/resumes/index.html": { body: HTML, type: "text/html; charset=utf-8" },
  };
  const at = (url, { method = "GET", accept = BROWSER, env = { PRIVATE_PATHS: ["/resume"] } } = {}) =>
    worker.fetch(new Request(url, { method, headers: { Accept: accept } }), { ASSETS: makeAssets(FILES), ...env });

  it.each(["/resume/", "/resume", "/resume/cv.pdf", "/RESUME/", "/%72esume/", "//resume/", "/x/../resume/"])(
    "hides %s on a preview URL",
    async (path) => {
      const res = await at(PREVIEW + path);
      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Link")).toBeNull();
      expect(await res.text()).toBe("Not found\n");
    },
  );

  it("hides the markdown sibling too", async () => {
    expect((await at(`${PREVIEW}/resume/`, { accept: "text/markdown" })).status).toBe(404);
  });

  it("answers HEAD without a body", async () => {
    const res = await at(`${PREVIEW}/resume/`, { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });

  it("hides them on a trailing-dot preview hostname", async () => {
    expect((await at("https://pr-7-brianbking.acct.workers.dev./resume/")).status).toBe(404);
  });

  it("serves them on the real hostname, where the zone's Access app gates them", async () => {
    expect((await at("https://brianbk.ing/resume/")).status).toBe(200);
  });

  it("still serves other pages on the preview, including a prefix look-alike", async () => {
    expect((await at(`${PREVIEW}/`)).status).toBe(200);
    expect((await at(`${PREVIEW}/resumes/`)).status).toBe(200);
  });

  it("accepts a comma-separated string (a dashboard-set variable)", async () => {
    expect((await at(`${PREVIEW}/resume/`, { env: { PRIVATE_PATHS: "/private, /resume" } })).status).toBe(404);
  });

  it("serves everything when PRIVATE_PATHS is unset (W3BBK, BBKing, KingFamily)", async () => {
    expect((await at(`${PREVIEW}/resume/`, { env: {} })).status).toBe(200);
  });
});