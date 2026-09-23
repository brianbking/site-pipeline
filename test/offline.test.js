import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { OFFLINE_CHECKS } from "../checks/offline.mjs";
import { resolveUrlPath } from "../checks/lib/build.mjs";

const HOST = "example.test";

/** A minimal build that passes every offline check (shaped like W3BBK.us). */
const GOOD = {
  "index.html": "<!doctype html><title>Home</title>",
  "index.md": "# Home\n",
  "about/index.html": "<!doctype html><title>About</title>",
  "about/index.md": "# About\n",
  "404.html": "<!doctype html><title>404</title>",
  "_headers": [
    "/*",
    "  X-Content-Type-Options: nosniff",
    `  Link: <https://${HOST}/sitemap.xml>; rel="sitemap", <https://${HOST}/llms.txt>; rel="describedby"`,
    "",
  ].join("\n"),
  "llms.txt": [
    "# Example",
    "",
    "> Summary.",
    "",
    `- [Overview](https://${HOST}/index.md): the home page`,
    "- [About](/about/): relative link",
    "- [Elsewhere](https://other.test/): external, not checked offline",
    "",
    "```",
    `curl -H "Accept: text/markdown" https://${HOST}/nope/`,
    "```",
    "",
  ].join("\n"),
  "robots.txt": `User-agent: *\nAllow: /\n# comment\nContent-Signal: ai-train=no\n\nSitemap: https://${HOST}/sitemap.xml\n`,
  "sitemap.xml": [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    `  <url><loc>https://${HOST}/</loc><lastmod>2026-09-01T10:00:00-04:00</lastmod><changefreq>yearly</changefreq><priority>1</priority></url>`,
    `  <url><loc>https://${HOST}/about/</loc></url>`,
    "</urlset>",
  ].join("\n"),
  "site.webmanifest": JSON.stringify({ name: "Example", icons: [{ src: "/icon-192.png", sizes: "192x192" }] }),
  "icon-192.png": "png",
  ".well-known/agent-card.json": JSON.stringify({
    name: "Example",
    description: "d",
    url: `https://${HOST}`,
    version: "1.0",
    protocolVersion: "0.3",
    capabilities: { streaming: false },
    skills: [],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/markdown"],
  }),
};

const dirs = [];
function site(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sp-offline-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries({ ...GOOD, ...overrides })) {
    if (body === null) continue; // null deletes a GOOD file
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const run = (name, dir) => OFFLINE_CHECKS[name]({ dir, host: HOST });

describe("the GOOD fixture", () => {
  it.each(Object.keys(OFFLINE_CHECKS))("passes %s", async (name) => {
    expect(await run(name, site())).toEqual([]);
  });
});

describe("resolveUrlPath", () => {
  it("maps directory URLs to index.html and refuses to escape the build dir", () => {
    const dir = site();
    expect(resolveUrlPath(dir, "/about/")).toMatch(/index\.html$/);
    expect(resolveUrlPath(dir, "/about")).toMatch(/index\.html$/);
    expect(resolveUrlPath(dir, "/missing/")).toBeNull();
    expect(resolveUrlPath(dir, "/../../etc/passwd")).toBeNull();
    expect(resolveUrlPath(dir, "/%E0%A4%A")).toBeNull();
  });
});

describe("headers", () => {
  it("flags a Link header pointing at another site (the kingfamily.info bug)", async () => {
    const dir = site({ _headers: "/*\n  Link: <https://kingfamily.info/sitemap.xml>; rel=\"sitemap\"\n" });
    expect(await run("headers", dir)).toEqual([
      { check: "headers", file: "_headers:2", message: `Link points at kingfamily.info, expected ${HOST}` },
    ]);
  });
});

describe("llms", () => {
  it("flags a missing file", async () => {
    expect((await run("llms", site({ "llms.txt": null })))[0].message).toBe("missing");
  });
  it("flags a missing H1", async () => {
    expect((await run("llms", site({ "llms.txt": "Example\n" })))[0].message).toMatch(/H1/);
  });
  it("flags a same-host link with no built file", async () => {
    const dir = site({ "llms.txt": `# X\n- [Gone](https://${HOST}/gone/)\n` });
    expect(await run("llms", dir)).toEqual([
      { check: "llms", file: "llms.txt", message: `link https://${HOST}/gone/ has no file in the build` },
    ]);
  });
});

describe("robots", () => {
  it("flags a Sitemap on another host", async () => {
    const dir = site({ "robots.txt": "User-agent: *\nSitemap: https://other.test/sitemap.xml\n" });
    expect(await run("robots", dir)).toEqual([
      { check: "robots", file: "robots.txt:2", message: `Sitemap https://other.test/sitemap.xml is not on ${HOST}` },
    ]);
  });
  it("flags a garbage line and a missing Sitemap", async () => {
    const found = await run("robots", site({ "robots.txt": "User-agent *\n" }));
    expect(found.map((f) => f.file)).toEqual(["robots.txt:1", "robots.txt"]);
  });
});

describe("sitemap", () => {
  it("flags a leading newline before the XML declaration", async () => {
    const found = await run("sitemap", site({ "sitemap.xml": `\n${GOOD["sitemap.xml"]}` }));
    expect(found.map((f) => f.message)).toContainEqual(expect.stringMatching(/must begin with the XML declaration/));
  });
  it("flags malformed XML", async () => {
    const found = await run("sitemap", site({ "sitemap.xml": '<?xml version="1.0"?><urlset><url></urlset>' }));
    expect(found[0].message).toMatch(/not well-formed/);
  });
  it("flags a <loc> on another host, a <loc> with no build file, and bad fields", async () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>https://other.test/</loc></url>",
      `<url><loc>https://${HOST}/gone/</loc><changefreq>sometimes</changefreq><priority>2</priority><lastmod>last week</lastmod></url>`,
      "</urlset>",
    ].join("");
    const found = await run("sitemap", site({ "sitemap.xml": xml }));
    expect(found.map((f) => `${f.file}: ${f.message}`)).toEqual([
      `sitemap.xml <url> #1: <loc> https://other.test/ is not on ${HOST}`,
      `sitemap.xml <url> #2: <loc> https://${HOST}/gone/ has no file in the build`,
      "sitemap.xml <url> #2: invalid <changefreq> sometimes",
      "sitemap.xml <url> #2: <priority> 2 not in 0.0-1.0",
      "sitemap.xml <url> #2: <lastmod> last week is not a W3C datetime",
    ]);
  });
  it("flags the wrong namespace", async () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://example.com/ns"><url><loc>https://${HOST}/</loc></url></urlset>`;
    expect((await run("sitemap", site({ "sitemap.xml": xml })))[0].message).toMatch(/xmlns/);
  });
});

describe("webmanifest", () => {
  it("flags an icon that is not in the build", async () => {
    const dir = site({ "site.webmanifest": JSON.stringify({ name: "X", icons: [{ src: "/missing.png" }] }) });
    expect(await run("webmanifest", dir)).toEqual([
      { check: "webmanifest", file: "site.webmanifest", message: "icon /missing.png has no file in the build" },
    ]);
  });
  it("flags invalid JSON", async () => {
    expect((await run("webmanifest", site({ "site.webmanifest": "{" })))[0].message).toMatch(/invalid JSON/);
  });
});

describe("agent-card", () => {
  it("flags missing required fields and a foreign url", async () => {
    const dir = site({ ".well-known/agent-card.json": JSON.stringify({ name: "X", url: "https://other.test", skills: {} }) });
    const messages = (await run("agent-card", dir)).map((f) => f.message);
    expect(messages).toEqual([
      '"protocolVersion" must be a non-empty string',
      '"description" must be a non-empty string',
      '"version" must be a non-empty string',
      `"url" https://other.test is not on ${HOST}`,
      '"capabilities" must be an object',
      '"skills" must be an array',
      '"defaultInputModes" must be a non-empty array of media types',
      '"defaultOutputModes" must be a non-empty array of media types',
    ]);
  });
  it("is skipped when the site has no agent card", async () => {
    expect(await run("agent-card", site({ ".well-known/agent-card.json": null }))).toEqual([]);
  });
});

describe("md-siblings", () => {
  it("flags an HTML page with no markdown sibling", async () => {
    expect(await run("md-siblings", site({ "about/index.md": null }))).toEqual([
      { check: "md-siblings", file: "about/index.html", message: "no about/index.md - the Worker advertises it on this page" },
    ]);
  });
});
