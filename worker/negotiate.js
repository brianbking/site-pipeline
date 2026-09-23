// Pure, dependency-free helpers for Markdown content negotiation.
// Unit-tested in negotiate.test.js — keep all branching logic here.

/**
 * Parse an Accept header into [{ type, q }] entries.
 * @param {string|null} header
 * @returns {{type: string, q: number}[]}
 */
export function parseAccept(header) {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const tokens = part.trim().split(";");
      const type = tokens[0].trim().toLowerCase();
      let q = 1;
      for (const token of tokens.slice(1)) {
        const [key, value] = token.split("=").map((s) => s.trim());
        if (key === "q") {
          const parsed = parseFloat(value);
          if (!Number.isNaN(parsed)) q = parsed;
        }
      }
      return { type, q };
    })
    .filter((media) => media.type.length > 0);
}

/**
 * Strict, browser-safe Markdown preference test.
 * Markdown wins only when explicitly requested AND ranked strictly above HTML.
 * @param {string|null} header
 * @returns {boolean}
 */
export function prefersMarkdown(header) {
  const media = parseAccept(header);
  const qFor = (type) =>
    media
      .filter((m) => m.type === type)
      .reduce((max, m) => Math.max(max, m.q), 0);
  const mdQ = Math.max(qFor("text/markdown"), qFor("text/x-markdown"));
  const htmlQ = qFor("text/html");
  return mdQ > 0 && mdQ > htmlQ;
}

/**
 * Map a request pathname to its static Markdown sibling, or null if the path
 * is already a file (has an extension).
 * @param {string} pathname URL pathname only (caller strips query string)
 * @returns {string|null}
 */
export function mdSiblingPath(pathname) {
  if (!pathname) return null;
  let path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path.endsWith("/")) return `${path}index.md`;
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  if (lastSegment.includes(".")) return null;
  return `${path}/index.md`;
}

/**
 * Rough token estimate (~4 chars/token) for context-budget hints.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}
