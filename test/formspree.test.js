import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkFormspree, formspreeForms } from "../checks/offline.mjs";
import { checkFormspreeCanary } from "../checks/live.mjs";

// The contact form as Hugo --minify writes it: bare attribute values, boolean `required`.
const form = ({ action = "https://formspree.io/f/abc123", method = "post", email = "<input type=email name=email required>" } = {}) =>
  `<!doctype html><title>Contact</title><form id=fs-frm action=${action} method=${method} class=text-right>` +
  `<input type=text name=name required>${email}<textarea rows=5 name=message placeholder="What's up?" required></textarea>` +
  `<input type=hidden name=subject value="Contact Form submission"><button type=submit>Send</button></form>`;
const CSP = "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'\n";

const dirs = [];
function build(files) {
  const dir = mkdtempSync(join(tmpdir(), "sp-formspree-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries({ "index.html": "<!doctype html><title>Home</title>", _headers: CSP, ...files })) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("checkFormspree", () => {
  it("passes a minified contact form that posts to the site's own ID", () => {
    expect(checkFormspree({ dir: build({ "contact/index.html": form() }), formspreeId: "abc123" })).toEqual([]);
  });

  it("passes a site with no form and no formspreeId (W3BBK, BBKing)", () => {
    expect(checkFormspree({ dir: build({}), formspreeId: "" })).toEqual([]);
  });

  it("flags a form posting to an ID other than the site's params formspreeId", () => {
    expect(checkFormspree({ dir: build({ "contact/index.html": form() }), formspreeId: "zzz999" })).toEqual([
      { check: "formspree", file: "contact/index.html", message: 'form posts to abc123, but params formspreeId is "zzz999"' },
    ]);
  });

  it("flags the empty action Hugo renders when formspreeId is missing", () => {
    const dir = build({ "contact/index.html": form({ action: "https://formspree.io/f/" }) });
    expect(checkFormspree({ dir, formspreeId: "" })).toEqual([
      { check: "formspree", file: "contact/index.html", message: 'form action "https://formspree.io/f/" is not https://formspree.io/f/<id>' },
    ]);
  });

  it("flags a formspreeId that no built page uses", () => {
    expect(checkFormspree({ dir: build({}), formspreeId: "abc123" })).toEqual([
      { check: "formspree", file: "params.formspreeId", message: '"abc123" is set but no built page has a Formspree form' },
    ]);
  });

  it("flags a GET form and an optional email field", () => {
    const dir = build({ "contact/index.html": form({ method: "get", email: "<input type=email name=email>" }) });
    expect(checkFormspree({ dir, formspreeId: "abc123" }).map((f) => f.message)).toEqual([
      "form method must be post",
      'needs a required <input type="email" name="email">',
    ]);
  });

  it("flags a CSP form-action that blocks Formspree, and names the _headers line", () => {
    const dir = build({ "contact/index.html": form(), _headers: "/*\n  Content-Security-Policy: default-src 'self'; form-action 'self'\n" });
    expect(checkFormspree({ dir, formspreeId: "abc123" })).toEqual([
      { check: "formspree", file: "_headers:2", message: `CSP form-action "'self'" blocks https://formspree.io` },
    ]);
  });

  it("allows a CSP form-action that lists Formspree", () => {
    const dir = build({ "contact/index.html": form(), _headers: "/*\n  Content-Security-Policy: default-src 'self'; form-action 'self' https://formspree.io\n" });
    expect(checkFormspree({ dir, formspreeId: "abc123" })).toEqual([]);
  });

  it("ignores forms that do not post to Formspree", () => {
    const dir = build({ "search/index.html": "<form action=/search method=get><input name=q></form>" });
    expect(formspreeForms(dir)).toEqual([]);
  });
});

describe("checkFormspreeCanary", () => {
  const answer = (status, body, seen = []) => async (url, init) => {
    seen.push({ url, init });
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  };

  it("passes when Formspree accepts a JSON submission marked [CI canary]", async () => {
    const seen = [];
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(200, '{"next":"/thanks","ok":true}', seen) });
    expect(found).toEqual([]);
    expect(seen[0].url).toBe("https://formspree.io/f/abc123");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers.Accept).toBe("application/json");
    expect(JSON.parse(seen[0].init.body)._subject).toBe("[CI canary] kingfamily.info");
  });

  it("passes when Formspree refuses only for reCAPTCHA: the form exists and is enabled", async () => {
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(400, '{"error":"Please complete the reCAPTCHA"}') });
    expect(found).toEqual([]);
  });

  it("fails with the status and Formspree's error for an unknown form", async () => {
    const body = '{"error":"Form not found","errors":[{"code":"FORM_NOT_FOUND","message":"Form not found"}]}';
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(404, body) });
    expect(found).toEqual([{ check: "formspree-canary", file: "https://formspree.io/f/abc123", message: `returned 404: ${body}` }]);
  });

  it("fails on a 200 that is not {ok:true} (an HTML captcha page)", async () => {
    const found = await checkFormspreeCanary("abc123", "kingfamily.info", { fetchImpl: answer(200, "<html>Please verify</html>") });
    expect(found[0].message).toBe("returned 200: <html>Please verify</html>");
  });
});
