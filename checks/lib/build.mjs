// Helpers shared by every check: failure records and build-output path resolution.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** One check failure. `file` names the offending file (and line/entry when known). */
export function fail(check, file, message) {
  return { check, file, message };
}

/** Read a file under the build dir as UTF-8, or null when it does not exist. */
export function readText(dir, rel) {
  const path = join(dir, rel);
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : null;
}

/** True when `url` is absolute and its hostname is exactly `host`. */
export function isOwnHost(url, host) {
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

/**
 * Map a URL pathname to the built file that would serve it, or null.
 * "/a/" -> a/index.html; "/a" -> a, else a/index.html. Never escapes `dir`.
 */
export function resolveUrlPath(dir, pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const root = resolve(dir);
  const candidates = path.endsWith("/") ? [`${path}index.html`] : [path, `${path}/index.html`];
  for (const candidate of candidates) {
    const abs = resolve(root, `.${candidate}`);
    if (abs !== root && !abs.startsWith(root + sep)) continue;
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}
