// Live checks: run against a deployed URL (PR preview, staging, or production).
// Every function takes an injectable fetchImpl so tests never touch the network.
import { fail } from "./lib/build.mjs";

// The sites challenge curl's default user agent (403); identify as a browser plus the pipeline.
export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 site-pipeline";
export const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const STAGING_ROBOTS = "User-agent: *\nDisallow: /\n"; // what worker/index.js serves when SITE_ENV=staging

const varyHasAccept = (res) =>
  (res.headers.get("vary") || "").split(",").some((v) => v.trim().toLowerCase() === "accept");

function request(fetchImpl, url, { method = "GET", accept = BROWSER_ACCEPT, headers = {} } = {}) {
  return fetchImpl(url, {
    method,
    redirect: "manual",
    headers: { "User-Agent": BROWSER_UA, Accept: accept, ...headers },
  });
}

/** Markdown negotiation on "/": markdown for Accept: text/markdown, HTML + Link for browsers, HEAD. */
export async function checkNegotiationLive(base, { fetchImpl = fetch, headers = {} } = {}) {
  const url = new URL("/", base).toString();
  const failures = [];
  const md = await request(fetchImpl, url, { accept: "text/markdown", headers });
  if (md.status !== 200) {
    failures.push(fail("negotiate-live", url, `Accept: text/markdown returned ${md.status}`));
  } else {
    const type = md.headers.get("content-type") || "";
    if (!type.startsWith("text/markdown")) failures.push(fail("negotiate-live", url, `Accept: text/markdown got Content-Type "${type}"`));
    if (!/^\d+$/.test(md.headers.get("x-markdown-tokens") || "")) failures.push(fail("negotiate-live", url, "markdown response has no X-Markdown-Tokens"));
    if (!varyHasAccept(md)) failures.push(fail("negotiate-live", url, "markdown response Vary lacks Accept"));
  }
  const html = await request(fetchImpl, url, { headers });
  const htmlType = html.headers.get("content-type") || "";
  if (html.status !== 200 || !htmlType.startsWith("text/html")) {
    failures.push(fail("negotiate-live", url, `browser request returned ${html.status} "${htmlType}"`));
  } else {
    const link = html.headers.get("link") || "";
    if (!/rel="alternate";\s*type="text\/markdown"/.test(link)) failures.push(fail("negotiate-live", url, "HTML response has no markdown alternate Link"));
    if (!varyHasAccept(html)) failures.push(fail("negotiate-live", url, "HTML response Vary lacks Accept"));
  }
  const head = await request(fetchImpl, url, { method: "HEAD", accept: "text/markdown", headers });
  if (head.status !== 200 || !(head.headers.get("content-type") || "").startsWith("text/markdown")) {
    failures.push(fail("negotiate-live", url, `HEAD with Accept: text/markdown returned ${head.status} "${head.headers.get("content-type")}"`));
  } else if ((await head.text()) !== "") {
    failures.push(fail("negotiate-live", url, "HEAD response carried a body"));
  }
  return failures;
}

/**
 * Post-deploy smoke: pages return 200, robots behaviour matches the environment, negotiation works.
 * Production must NOT serve the staging disallow-all robots.txt - that guards against staging config leaking.
 */
export async function checkSmoke(base, { pages = ["/"], staging = false, fetchImpl = fetch, headers = {} } = {}) {
  const failures = [];
  for (const page of pages) {
    const url = new URL(page, base).toString();
    const res = await request(fetchImpl, url, { headers });
    if (res.status !== 200) {
      failures.push(fail("smoke", url, `returned ${res.status}`));
    }
  }
  // The environment is judged by robots.txt, which the Worker writes, not by X-Robots-Tag:
  // Cloudflare forces x-robots-tag: noindex onto every workers.dev preview URL (W3BBK pilot).
  const robotsUrl = new URL("/robots.txt", base).toString();
  const robots = await request(fetchImpl, robotsUrl, { accept: "text/plain", headers });
  if (robots.status !== 200) {
    failures.push(fail("smoke", robotsUrl, `returned ${robots.status}`));
  } else {
    const disallowAll = (await robots.text()) === STAGING_ROBOTS;
    if (staging && !disallowAll) failures.push(fail("smoke", robotsUrl, "staging robots.txt is not the disallow-all file"));
    if (!staging && disallowAll) failures.push(fail("smoke", robotsUrl, "production robots.txt is the staging disallow-all file"));
  }
  failures.push(...(await checkNegotiationLive(base, { fetchImpl, headers })));
  return failures;
}

/** Parse security.txt into lowercase field -> [values]. Comments and blank lines are ignored. */
export function parseSecurityTxt(text) {
  const fields = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    fields.set(key, [...(fields.get(key) || []), m[2].trim()]);
  }
  return fields;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** RFC 9116 essentials: a Contact on this domain, exactly one future Expires, Canonical if present. */
export function evaluateSecurityTxt(text, host, { now = new Date(), warnDays = 30 } = {}) {
  const where = `https://${host}/.well-known/security.txt`;
  const fields = parseSecurityTxt(text);
  const failures = [];
  const contacts = fields.get("contact") || [];
  const own = contacts.some((c) => {
    if (c.toLowerCase().startsWith("mailto:")) return c.slice(7).split("@").pop().toLowerCase() === host;
    try {
      return new URL(c).hostname === host;
    } catch {
      return false;
    }
  });
  if (contacts.length === 0) failures.push(fail("security-txt", where, "no Contact field"));
  else if (!own) failures.push(fail("security-txt", where, `no Contact on ${host} (${contacts.join(", ")})`));
  const expires = fields.get("expires") || [];
  if (expires.length !== 1) {
    failures.push(fail("security-txt", where, `needs exactly one Expires field, found ${expires.length}`));
  } else {
    const at = new Date(expires[0]);
    if (Number.isNaN(at.getTime())) failures.push(fail("security-txt", where, `Expires "${expires[0]}" is not a date`));
    else if (at <= now) failures.push(fail("security-txt", where, `expired on ${expires[0]}`));
    else if (at - now < warnDays * DAY_MS) {
      failures.push(fail("security-txt", where, `expires in ${Math.ceil((at - now) / DAY_MS)} days (${expires[0]}) - update it in Cloudflare Security Center`));
    }
  }
  for (const c of fields.get("canonical") || []) {
    if (c !== where) failures.push(fail("security-txt", where, `Canonical ${c} does not match ${where}`));
  }
  return failures;
}

/** Fetch and evaluate the served security.txt. */
export async function checkSecurityTxt(host, { fetchImpl = fetch, now = new Date() } = {}) {
  const url = `https://${host}/.well-known/security.txt`;
  const res = await request(fetchImpl, url, { accept: "text/plain" });
  if (res.status !== 200) return [fail("security-txt", url, `returned ${res.status}`)];
  return evaluateSecurityTxt(await res.text(), host, { now });
}
