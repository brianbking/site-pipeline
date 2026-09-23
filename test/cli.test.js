// The CLI is the gate's contract with the workflows: a crash must still leave a failing result.
import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "checks", "cli.mjs");
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "sp-cli-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("a command that throws", () => {
  it("still writes a failing --json result and exits 1", () => {
    const out = join(tmp(), "20-negotiate.json");
    const res = run("negotiate", "--base", "http://127.0.0.1:9/", "--json", out);
    expect(res.status).toBe(1);
    const [result] = JSON.parse(readFileSync(out, "utf8"));
    expect(result).toMatchObject({ name: "negotiate", status: "fail" });
    expect(result.failures[0].message).toMatch(/crashed/);
  });
});

describe("preview-urls", () => {
  it("says preview URLs are disabled when the upload printed none", () => {
    const dir = tmp();
    writeFileSync(join(dir, "upload.txt"), "Worker Version ID: ee532a44-3fef-4d44-b48d-ee616698abb5\n");
    writeFileSync(join(dir, "active.txt"), "Version(s):  (100%) da2eaf8e-18ad-4c17-8c60-292e983c3b56\n");
    const res = run("preview-urls", "--file", join(dir, "upload.txt"), "--active-file", join(dir, "active.txt"), "--worker", "w3bbk");
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/no preview URL in the upload output - enable Preview URLs for Worker "w3bbk"/);
  });
});

describe("assert-active", () => {
  const status = (id) => `Version(s):  (100%) ${id}\n`;
  it("passes when the promoted version serves 100%", () => {
    const file = join(tmp(), "after.txt");
    writeFileSync(file, status("a05ffd03-554a-4695-b1b3-2ae17da815d6"));
    expect(run("assert-active", "--file", file, "--version", "a05ffd03-554a-4695-b1b3-2ae17da815d6").status).toBe(0);
  });
  it("fails when another version is serving", () => {
    const file = join(tmp(), "after.txt");
    writeFileSync(file, status("5a9e7d25-4a74-4921-b178-7d3796a8379d"));
    const res = run("assert-active", "--file", file, "--version", "a05ffd03-554a-4695-b1b3-2ae17da815d6");
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/5a9e7d25-4a74-4921-b178-7d3796a8379d is serving, expected a05ffd03-554a-4695-b1b3-2ae17da815d6/);
  });
});

describe("summary --expect", () => {
  it("fails and names each expected result file that is missing", () => {
    const dir = tmp();
    writeFileSync(join(dir, "10-offline.json"), JSON.stringify([{ name: "offline checks", status: "pass", failures: [] }]));
    const res = run("summary", "--results", dir, "--expect", "10-offline,20-negotiate,30-visual");
    expect(res.status).toBe(1);
    const md = readFileSync(join(dir, "summary.md"), "utf8");
    expect(md).toContain("## ❌ site-gate");
    expect(md).toContain("`20-negotiate.json`: no result - the check crashed or never ran");
    expect(md).toContain("`30-visual.json`: no result - the check crashed or never ran");
  });

  it("passes when every expected file is present and green", () => {
    const dir = tmp();
    writeFileSync(join(dir, "10-offline.json"), JSON.stringify([{ name: "offline checks", status: "pass", failures: [] }]));
    expect(run("summary", "--results", dir, "--expect", "10-offline").status).toBe(0);
    expect(existsSync(join(dir, "summary.md"))).toBe(true);
  });
});

describe("security-txt --file", () => {
  const good = "Contact: mailto:security@w3bbk.us\nExpires: 2099-12-31T23:59:00Z\n";
  it("evaluates a local copy fetched by curl", () => {
    const file = join(tmp(), "security.txt");
    writeFileSync(file, good);
    expect(run("security-txt", "--host", "w3bbk.us", "--file", file).status).toBe(0);
  });
  it("fails an expired local copy", () => {
    const file = join(tmp(), "security.txt");
    writeFileSync(file, good.replace("2099", "2001"));
    const res = run("security-txt", "--host", "w3bbk.us", "--file", file);
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/expired on 2001/);
  });
});
