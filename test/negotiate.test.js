// Characterization tests: pin the behaviour of the canonical negotiate.js
// exactly as it shipped in functions/lib/negotiate.js (all six repos, md5 E3EFF2C1).
import { describe, it, expect } from "vitest";
import { parseAccept, prefersMarkdown, mdSiblingPath, estimateTokens } from "../worker/negotiate.js";

describe("parseAccept", () => {
  it("returns [] for null, undefined and empty", () => {
    expect(parseAccept(null)).toEqual([]);
    expect(parseAccept(undefined)).toEqual([]);
    expect(parseAccept("")).toEqual([]);
  });
  it("defaults q to 1 and lowercases types", () => {
    expect(parseAccept("Text/HTML")).toEqual([{ type: "text/html", q: 1 }]);
  });
  it("reads q values and ignores other params", () => {
    expect(parseAccept("text/markdown;charset=utf-8;q=0.5")).toEqual([{ type: "text/markdown", q: 0.5 }]);
  });
  it("keeps q=1 when q is not a number", () => {
    expect(parseAccept("text/html;q=abc")).toEqual([{ type: "text/html", q: 1 }]);
  });
  it("drops empty entries", () => {
    expect(parseAccept("text/html,,")).toEqual([{ type: "text/html", q: 1 }]);
  });
});

describe("prefersMarkdown", () => {
  it.each([
    ["text/markdown", true],
    ["text/x-markdown", true],
    ["text/markdown, text/html;q=0.9", true],
    ["text/html, text/markdown;q=0.9", false],
    ["text/markdown, text/html", false], // equal q -> HTML (browser-safe)
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", false],
    ["*/*", false],
    ["text/markdown;q=0", false],
    ["", false],
    [null, false],
  ])("%s -> %s", (header, expected) => {
    expect(prefersMarkdown(header)).toBe(expected);
  });
});

describe("mdSiblingPath", () => {
  it.each([
    ["/", "/index.md"],
    ["/about/", "/about/index.md"],
    ["/about", "/about/index.md"],
    ["about/", "/about/index.md"],
    ["/css/site.css", null],
    ["/index.md", null],
    ["", null],
  ])("%s -> %s", (input, expected) => {
    expect(mdSiblingPath(input)).toBe(expected);
  });
});

describe("estimateTokens", () => {
  it("is ceil(length / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
  it("treats null as empty", () => {
    expect(estimateTokens(null)).toBe(0);
  });
});
