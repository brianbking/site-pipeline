// Offline checks: run against the built public/ directory, no network.
// Each check takes { dir, host } and returns an array of failures (empty = pass).
import { readdirSync } from "node:fs";
import { posix } from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { fail, isOwnHost, readText, resolveUrlPath } from "./lib/build.mjs";

/** _headers: every absolute URL in a Link header points at this site. */
export function checkHeaders({ dir, host }) {
  const text = readText(dir, "_headers");
  if (text === null) return [];
  const failures = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s+Link:\s*(.+)$/i);
    if (!m) return;
    for (const [, url] of m[1].matchAll(/<([^>]+)>/g)) {
      if (/^https?:\/\//i.test(url) && !isOwnHost(url, host)) {
        failures.push(fail("headers", `_headers:${i + 1}`, `Link points at ${new URL(url).hostname}, expected ${host}`));
      }
    }
  });
  return failures;
}

/** llms.txt: exists, opens with an H1, and every same-host link has a built file. */
export function checkLlms({ dir, host }) {
  const text = readText(dir, "llms.txt");
  if (text === null) return [fail("llms", "llms.txt", "missing")];
  const failures = [];
  const first = text.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!first || !/^# \S/.test(first)) {
    failures.push(fail("llms", "llms.txt", "first line must be an H1 (\"# Title\")"));
  }
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");
  for (const [, href] of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const url = new URL(href, `https://${host}/`);
    if (url.hostname !== host) continue; // external links belong to the weekly link check
    if (!resolveUrlPath(dir, url.pathname)) {
      failures.push(fail("llms", "llms.txt", `link ${href} has no file in the build`));
    }
  }
  return failures;
}

/** robots.txt: every line is "Field: value", and Sitemap lines point at this site's built sitemap. */
export function checkRobots({ dir, host }) {
  const text = readText(dir, "robots.txt");
  if (text === null) return [fail("robots", "robots.txt", "missing")];
  const failures = [];
  let sitemaps = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const where = `robots.txt:${i + 1}`;
    const m = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!m) {
      failures.push(fail("robots", where, `not a "Field: value" line: ${raw}`));
      return;
    }
    if (m[1].toLowerCase() !== "sitemap") return;
    sitemaps++;
    if (!isOwnHost(m[2], host)) {
      failures.push(fail("robots", where, `Sitemap ${m[2]} is not on ${host}`));
    } else if (!resolveUrlPath(dir, new URL(m[2]).pathname)) {
      failures.push(fail("robots", where, `Sitemap ${m[2]} has no file in the build`));
    }
  });
  if (sitemaps === 0) failures.push(fail("robots", "robots.txt", "no Sitemap: line"));
  return failures;
}

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const CHANGEFREQ = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
const W3C_DATETIME = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

/**
 * sitemap.xml: well-formed, sitemaps.org 0.9 structure, every <loc> on this host and built.
 * minimal: hand-rolled rules mirroring the sitemaps.org XSD instead of an XSD validator
 * (needs xmllint + a vendored schema); upgrade path is xmllint --schema in CI.
 */
export function checkSitemap({ dir, host }) {
  const text = readText(dir, "sitemap.xml");
  if (text === null) return [fail("sitemap", "sitemap.xml", "missing")];
  const failures = [];
  if (!text.startsWith("<?xml")) {
    failures.push(fail("sitemap", "sitemap.xml", "must begin with the XML declaration \"<?xml\" (no leading whitespace or BOM)"));
  }
  const valid = XMLValidator.validate(text.trimStart());
  if (valid !== true) {
    failures.push(fail("sitemap", "sitemap.xml", `not well-formed XML: ${valid.err.msg} (line ${valid.err.line})`));
    return failures;
  }
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false, isArray: (name) => name === "url" }).parse(text.trimStart());
  const urlset = doc.urlset;
  if (!urlset) return [...failures, fail("sitemap", "sitemap.xml", "root element must be <urlset>")];
  if (urlset["@_xmlns"] !== SITEMAP_NS) {
    failures.push(fail("sitemap", "sitemap.xml", `<urlset> xmlns must be ${SITEMAP_NS}`));
  }
  const urls = urlset.url || [];
  if (urls.length === 0) failures.push(fail("sitemap", "sitemap.xml", "no <url> entries"));
  urls.forEach((u, i) => {
    const where = `sitemap.xml <url> #${i + 1}`;
    if (typeof u.loc !== "string" || u.loc === "") {
      failures.push(fail("sitemap", where, "missing <loc>"));
      return;
    }
    if (u.loc.length > 2048) failures.push(fail("sitemap", where, "<loc> longer than 2048 characters"));
    if (!isOwnHost(u.loc, host)) {
      failures.push(fail("sitemap", where, `<loc> ${u.loc} is not on ${host}`));
    } else if (!resolveUrlPath(dir, new URL(u.loc).pathname)) {
      failures.push(fail("sitemap", where, `<loc> ${u.loc} has no file in the build`));
    }
    if (u.changefreq !== undefined && !CHANGEFREQ.has(u.changefreq)) {
      failures.push(fail("sitemap", where, `invalid <changefreq> ${u.changefreq}`));
    }
    if (u.priority !== undefined) {
      const p = Number(u.priority);
      if (!(u.priority !== "" && p >= 0 && p <= 1)) failures.push(fail("sitemap", where, `<priority> ${u.priority} not in 0.0-1.0`));
    }
    if (u.lastmod !== undefined && !W3C_DATETIME.test(u.lastmod)) {
      failures.push(fail("sitemap", where, `<lastmod> ${u.lastmod} is not a W3C datetime`));
    }
  });
  return failures;
}

/** site.webmanifest: valid JSON with a name, and every icon exists in the build. Optional file. */
export function checkWebmanifest({ dir }) {
  const name = ["site.webmanifest", "manifest.webmanifest"].find((n) => readText(dir, n) !== null);
  if (!name) return [];
  let manifest;
  try {
    manifest = JSON.parse(readText(dir, name));
  } catch (e) {
    return [fail("webmanifest", name, `invalid JSON: ${e.message}`)];
  }
  const failures = [];
  if (!manifest.name && !manifest.short_name) failures.push(fail("webmanifest", name, "needs name or short_name"));
  for (const icon of manifest.icons || []) {
    if (typeof icon.src !== "string" || icon.src === "") {
      failures.push(fail("webmanifest", name, "icon without src"));
      continue;
    }
    const path = new URL(icon.src, "https://manifest.invalid/").pathname;
    if (!resolveUrlPath(dir, path)) failures.push(fail("webmanifest", name, `icon ${icon.src} has no file in the build`));
  }
  return failures;
}

/**
 * .well-known/agent-card.json: A2A AgentCard required fields. Optional file.
 * minimal: required-field rules instead of the full A2A JSON Schema; upgrade path is
 * vendoring the schema and validating with ajv.
 */
export function checkAgentCard({ dir, host }) {
  const rel = ".well-known/agent-card.json";
  const text = readText(dir, rel);
  if (text === null) return [];
  let card;
  try {
    card = JSON.parse(text);
  } catch (e) {
    return [fail("agent-card", rel, `invalid JSON: ${e.message}`)];
  }
  const failures = [];
  for (const key of ["protocolVersion", "name", "description", "url", "version"]) {
    if (typeof card[key] !== "string" || card[key] === "") {
      failures.push(fail("agent-card", rel, `"${key}" must be a non-empty string`));
    }
  }
  if (typeof card.url === "string" && card.url !== "" && !isOwnHost(card.url, host)) {
    failures.push(fail("agent-card", rel, `"url" ${card.url} is not on ${host}`));
  }
  if (!card.capabilities || typeof card.capabilities !== "object" || Array.isArray(card.capabilities)) {
    failures.push(fail("agent-card", rel, "\"capabilities\" must be an object"));
  }
  if (!Array.isArray(card.skills)) failures.push(fail("agent-card", rel, "\"skills\" must be an array"));
  for (const key of ["defaultInputModes", "defaultOutputModes"]) {
    const v = card[key];
    if (!Array.isArray(v) || v.length === 0 || !v.every((s) => typeof s === "string")) {
      failures.push(fail("agent-card", rel, `"${key}" must be a non-empty array of media types`));
    }
  }
  return failures;
}

/** Every built HTML page (…/index.html) has the index.md sibling the Worker will advertise. */
export function checkMdSiblings({ dir }) {
  const failures = [];
  for (const rel of readdirSync(dir, { recursive: true })) {
    const path = String(rel).split("\\").join("/");
    if (path.split("/").pop() !== "index.html") continue;
    const md = posix.join(posix.dirname(path), "index.md");
    if (readText(dir, md) === null) {
      failures.push(fail("md-siblings", path, `no ${md} - the Worker advertises it on this page`));
    }
  }
  return failures;
}

/**
 * Production must stay indexable. Checked on the build, not live: Cloudflare forces
 * x-robots-tag: noindex onto every preview URL, which is why Lighthouse skips is-crawlable.
 */
export function checkIndexable({ dir }) {
  const failures = [];
  for (const rel of readdirSync(dir, { recursive: true })) {
    const path = String(rel).split("\\").join("/");
    if (!path.endsWith(".html")) continue;
    const html = readText(dir, path) ?? "";
    for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
      if (!/name\s*=\s*["']?(robots|googlebot)["'\s>]/i.test(tag)) continue;
      const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
      if (/\bnoindex\b|\bnone\b/i.test(content)) {
        failures.push(fail("indexable", path, `meta robots "${content}" would de-index this page`));
      }
    }
  }
  (readText(dir, "_headers") ?? "").split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s+X-Robots-Tag:\s*(.+)$/i);
    if (m && /\bnoindex\b|\bnone\b/i.test(m[1])) {
      failures.push(fail("indexable", `_headers:${i + 1}`, `X-Robots-Tag "${m[1].trim()}" would de-index production`));
    }
  });
  return failures;
}

const FORMSPREE_ACTION = /^https:\/\/formspree\.io\/f\/([A-Za-z0-9]+)$/;

/** Value of attribute `name` in one start tag (quoted or, as Hugo --minify writes them, bare), or null. */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}
const hasFlag = (tag, name) => new RegExp(`\\s${name}(?=[\\s>=/])`, "i").test(tag);

/**
 * Every built <form> whose action points at Formspree: { file, action, id, open, body }.
 * `id` is null when the action is not exactly https://formspree.io/f/<id> (e.g. an empty param).
 */
export function formspreeForms(dir) {
  const forms = [];
  for (const rel of readdirSync(dir, { recursive: true })) {
    const path = String(rel).split("\\").join("/");
    if (!path.endsWith(".html")) continue;
    for (const [, open, body] of (readText(dir, path) ?? "").matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/gi)) {
      const action = attr(open, "action") ?? "";
      if (!/formspree\.io/i.test(action)) continue;
      forms.push({ file: path, action, id: action.match(FORMSPREE_ACTION)?.[1] ?? null, open, body });
    }
  }
  return forms;
}

/** _headers CSP lines whose form-action would block a POST to Formspree. */
function cspBlocksFormspree(dir) {
  const failures = [];
  (readText(dir, "_headers") ?? "").split(/\r?\n/).forEach((line, i) => {
    const csp = line.match(/^\s+Content-Security-Policy:\s*(.+)$/i)?.[1];
    const directive = csp?.split(";").map((d) => d.trim().split(/\s+/)).find(([n]) => n.toLowerCase() === "form-action");
    if (!directive) return; // form-action does not fall back to default-src
    const ok = directive.slice(1).some((s) => ["*", "https:", "formspree.io", "https://formspree.io", "https://formspree.io/"].includes(s.toLowerCase()));
    if (!ok) failures.push(fail("formspree", `_headers:${i + 1}`, `CSP form-action "${directive.slice(1).join(" ")}" blocks https://formspree.io`));
  });
  return failures;
}

/**
 * Formspree forms post to the site's own ID (params formspreeId, passed in by the workflow),
 * by POST, with the fields Formspree needs, and the CSP lets the POST through.
 * minimal: CSP form-action is read from every _headers rule, not matched per path; upgrade path
 * is matching each form's page against the _headers path patterns.
 */
export function checkFormspree({ dir, formspreeId }) {
  const forms = formspreeForms(dir);
  const failures = [];
  if (forms.length === 0) {
    if (formspreeId) failures.push(fail("formspree", "params.formspreeId", `"${formspreeId}" is set but no built page has a Formspree form`));
    return failures;
  }
  for (const { file, action, id, open, body } of forms) {
    if (!id) failures.push(fail("formspree", file, `form action "${action}" is not https://formspree.io/f/<id>`));
    else if (formspreeId !== undefined && id !== formspreeId) {
      failures.push(fail("formspree", file, `form posts to ${id}, but params formspreeId is "${formspreeId}"`));
    }
    if ((attr(open, "method") ?? "get").toLowerCase() !== "post") failures.push(fail("formspree", file, "form method must be post"));
    const fields = [...body.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map(([tag]) => tag);
    const email = fields.find((t) => attr(t, "name") === "email");
    if (!email || (attr(email, "type") ?? "").toLowerCase() !== "email" || !hasFlag(email, "required")) {
      failures.push(fail("formspree", file, 'needs a required <input type="email" name="email">'));
    }
    const message = fields.find((t) => attr(t, "name") === "message");
    if (!message || !hasFlag(message, "required")) failures.push(fail("formspree", file, 'needs a required field named "message"'));
  }
  return [...failures, ...cspBlocksFormspree(dir)];
}

export const OFFLINE_CHECKS = {
  headers: checkHeaders,
  llms: checkLlms,
  robots: checkRobots,
  sitemap: checkSitemap,
  webmanifest: checkWebmanifest,
  "agent-card": checkAgentCard,
  "md-siblings": checkMdSiblings,
  indexable: checkIndexable,
  formspree: checkFormspree,
};
