// Pure helpers for the workflows: wrangler output parsing, pin consistency, issues, PR summary.

/** Parse `wrangler versions upload` output. */
export function parseVersionUpload(output) {
  const versionId = output.match(/Worker Version ID:\s*([0-9a-f-]{36})/i)?.[1];
  const previewUrl = output.match(/Version Preview URL:\s*(https:\/\/\S+)/i)?.[1];
  const aliasUrl = output.match(/Version Preview Alias URL:\s*(https:\/\/\S+)/i)?.[1];
  if (!versionId) throw new Error("no 'Worker Version ID' in wrangler versions upload output");
  return { versionId, previewUrl: previewUrl ?? null, aliasUrl: aliasUrl ?? null };
}

/** Version ID serving 100 % of traffic, from `wrangler deployments status` output. */
export function parseActiveVersion(output) {
  const ids = [...output.matchAll(/\((\d+)%\)\s+([0-9a-f-]{36})/g)];
  const full = ids.find(([, pct]) => pct === "100");
  if (!full) throw new Error(`no single version at 100% (found ${ids.map(([, p, id]) => `${id}@${p}%`).join(", ") || "none"})`);
  return full[2];
}

/** Preview URL of `versionId`, using the account subdomain seen in any preview URL of `worker`. */
export function versionPreviewUrl(anyPreviewUrl, worker, versionId) {
  const escaped = worker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = anyPreviewUrl.match(new RegExp(`^https://[a-z0-9-]+-${escaped}\\.([a-z0-9-]+)\\.workers\\.dev/?$`, "i"));
  if (!m) throw new Error(`cannot read the workers.dev subdomain from ${anyPreviewUrl} for worker ${worker}`);
  return `https://${versionId.slice(0, 8)}-${worker}.${m[1]}.workers.dev`;
}

/** What to do with the one tracking issue for a scheduled check. */
export function issueAction(openIssueNumber, failing) {
  if (failing) return openIssueNumber ? "comment" : "create";
  return openIssueNumber ? "close" : "none";
}

const ICON = { pass: "✅", fail: "❌", approved: "🟡", skip: "⏭️" };
export const SUMMARY_MARKER = "<!-- site-gate -->";

/** Markdown PR comment. sections: [{ name, status, failures: [{ file, message }], notes?: string[] }]. */
export function renderSummary(sections, { title = "site-gate" } = {}) {
  const red = sections.some((s) => s.status === "fail");
  const lines = [SUMMARY_MARKER, `## ${red ? ICON.fail : ICON.pass} ${title}`, "", "| Check | Result |", "|---|---|"];
  for (const s of sections) lines.push(`| ${s.name} | ${ICON[s.status] ?? "?"} ${s.status} |`);
  for (const s of sections) {
    if (!s.failures?.length && !s.notes?.length) continue;
    lines.push("", `### ${s.name}`);
    for (const n of s.notes || []) lines.push(`- ${n}`);
    for (const f of s.failures || []) lines.push(`- \`${f.file}\`: ${f.message}`);
  }
  return `${lines.join("\n")}\n`;
}
