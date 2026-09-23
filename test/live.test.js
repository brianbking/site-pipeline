import { describe, it, expect } from "vitest";
import worker from "../worker/index.js";
import { BROWSER_UA, checkNegotiationLive, checkSmoke, checkSecurityTxt, evaluateSecurityTxt } from "../checks/live.mjs";

// A fake deployed site: the real Worker in front of a stub assets binding.
const FILES = {
  "/index.html": ["<!doctype html>", "text/html; charset=utf-8"],
  "/index.md": ["# Home\n", "text/markdown; charset=utf-8"],
  "/about/index.html": ["<!doctype html>", "text/html; charset=utf-8"],
  "/robots.txt": ["User-agent: *\nAllow: /\n", "text/plain"],
};
const ASSETS = {
  async fetch(input) {
    const req = input instanceof Request ? input : new Request(input);
    const { pathname } = new URL(req.url);
    const file = FILES[pathname.endsWith("/") ? `${pathname}index.html` : pathname];
    if (!file) return new Response("nf", { status: 404, headers: { "Content-Type": "text/html" } });
    return new Response(req.method === "HEAD" ? null : file[0], { headers: { "Content-Type": file[1] } });
  },
};
const deployed = (env = {}, seen = []) => async (url, init) => {
  seen.push(init.headers);
  return worker.fetch(new Request(url, init), { ASSETS, ...env });
};
// A deployment without the Worker in front: plain assets, no negotiation.
const assetsOnly = async (url, init) => ASSETS.fetch(new Request(url, init));

describe("checkNegotiationLive", () => {
  it("passes against the real Worker", async () => {
    expect(await checkNegotiationLive("https://site.test", { fetchImpl: deployed() })).toEqual([]);
  });

  it("fails against an assets-only deployment (today's BBKing/W3BBK)", async () => {
    const messages = (await checkNegotiationLive("https://site.test", { fetchImpl: assetsOnly })).map((f) => f.message);
    expect(messages).toEqual([
      'Accept: text/markdown got Content-Type "text/html; charset=utf-8"',
      "markdown response has no X-Markdown-Tokens",
      "markdown response Vary lacks Accept",
      "HTML response has no markdown alternate Link",
      "HTML response Vary lacks Accept",
      'HEAD with Accept: text/markdown returned 200 "text/html; charset=utf-8"',
    ]);
  });

  it("sends a browser user agent and passes extra headers (Access token)", async () => {
    const seen = [];
    await checkNegotiationLive("https://site.test", { fetchImpl: deployed({}, seen), headers: { "CF-Access-Client-Id": "id" } });
    expect(seen.every((h) => h["User-Agent"] === BROWSER_UA && h["CF-Access-Client-Id"] === "id")).toBe(true);
  });
});

describe("checkSmoke", () => {
  it("passes production and staging against the matching Worker env", async () => {
    expect(await checkSmoke("https://site.test", { pages: ["/", "/about/"], fetchImpl: deployed() })).toEqual([]);
    expect(await checkSmoke("https://site.test", { staging: true, fetchImpl: deployed({ SITE_ENV: "staging" }) })).toEqual([]);
  });

  it("fails production that is noindex (staging config leaked)", async () => {
    const found = await checkSmoke("https://site.test", { fetchImpl: deployed({ SITE_ENV: "staging" }) });
    expect(found[0].message).toBe('production response is noindex ("noindex, nofollow")');
  });

  it("fails staging that is indexable and serves the production robots.txt", async () => {
    const messages = (await checkSmoke("https://site.test", { staging: true, fetchImpl: deployed() })).map((f) => f.message);
    expect(messages).toEqual(["staging response is not X-Robots-Tag noindex", "staging robots.txt is not the disallow-all file"]);
  });

  it("fails a page that does not return 200", async () => {
    const found = await checkSmoke("https://site.test", { pages: ["/gone/"], fetchImpl: deployed() });
    expect(found[0]).toEqual({ check: "smoke", file: "https://site.test/gone/", message: "returned 404" });
  });
});

describe("security.txt", () => {
  const NOW = new Date("2026-09-23T00:00:00Z");
  const good = [
    "Canonical: https://w3bbk.us/.well-known/security.txt",
    "Contact: mailto:security@w3bbk.us",
    "Expires: 2029-12-31T23:59:00Z",
    "Preferred-Languages: en",
  ].join("\n");

  it("passes the file Cloudflare serves today", () => {
    expect(evaluateSecurityTxt(good, "w3bbk.us", { now: NOW })).toEqual([]);
  });
  it("warns 30 days before Expires", () => {
    const found = evaluateSecurityTxt(good, "w3bbk.us", { now: new Date("2029-12-10T00:00:00Z") });
    expect(found[0].message).toMatch(/^expires in 22 days/);
  });
  it("fails an expired file", () => {
    expect(evaluateSecurityTxt(good, "w3bbk.us", { now: new Date("2030-01-01T00:00:00Z") })[0].message).toMatch(/^expired on/);
  });
  it("fails a Contact on another domain and a mismatched Canonical", () => {
    const text = good.replace("security@w3bbk.us", "security@bbking.net").replace("w3bbk.us/.well", "bbking.net/.well");
    expect(evaluateSecurityTxt(text, "w3bbk.us", { now: NOW }).map((f) => f.message)).toEqual([
      "no Contact on w3bbk.us (mailto:security@bbking.net)",
      "Canonical https://bbking.net/.well-known/security.txt does not match https://w3bbk.us/.well-known/security.txt",
    ]);
  });
  it("fails a missing or duplicated Expires", () => {
    expect(evaluateSecurityTxt("Contact: mailto:security@w3bbk.us", "w3bbk.us", { now: NOW })[0].message).toBe("needs exactly one Expires field, found 0");
  });
  it("fails when the file is not served", async () => {
    const fetchImpl = async () => new Response("nf", { status: 404 });
    expect((await checkSecurityTxt("w3bbk.us", { fetchImpl }))[0].message).toBe("returned 404");
  });
});
