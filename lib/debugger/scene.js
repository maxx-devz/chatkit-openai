import { isError, relationships, statusColor } from "./model.js";

// A visual grouping key, never a replacement request ID. Ignore query values
// and keep browser, proxy and provider hops separate: they are different calls.
export function endpointKey(record) {
  if (!record.url || ["navigation", "performance", "error", "operation"].includes(record.category)) return "";
  try {
    const url = new URL(record.url);
    const layer = ["server", "python"].includes(record.source) ? record.source : "browser";
    return JSON.stringify([record.tabId, record.navigationId, layer, record.category, record.method || "GET", url.origin, url.pathname]);
  } catch { return ""; }
}
function groupKey(record, group) {
  if (group === "endpoint") {
    const endpoint = endpointKey(record);
    if (endpoint) return endpoint;
    // Repeated measured events/handler spans should not create another cloud.
    return ["performance", "operation", "error"].includes(record.category)
      ? JSON.stringify([record.tabId, record.navigationId, record.source, record.category, record.label]) : "";
  }
  if (group === "type") return record.category || "other";
  if (group === "navigation") return record.navigationId || "unassociated";
  if (group === "domain") { try { return new URL(record.url).host; } catch { return record.source || "browser events"; } }
  return "";
}
export function buildGraphScene(records, group, expanded = new Set()) {
  const groups = new Map(), alias = new Map(), owners = new Map(), membershipParents = new Map(), display = [];
  for (const record of records) {
    const key = groupKey(record, group);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const [key, members] of groups) {
    if (key && members.length >= (group === "endpoint" ? 2 : 6)) {
      const latest = members.reduce((a, b) => (b.start || 0) >= (a.start || 0) ? b : a);
      const active = members.filter((r) => ["pending", "receiving"].includes(r.state));
      let label = key;
      if (group === "endpoint") {
        try { const url = new URL(latest.url); label = `${latest.method || "GET"} ${url.pathname}`; }
        catch { label = latest.label || latest.category; }
      }
      const errorMember = members.find((r) => r.status >= 500) || members.find((r) => r.state === "failed") || members.find(isError);
      const cluster = { id: `cluster:${key}`, groupKey: key, label, category: "cluster", members, expanded: expanded.has(key),
        latestId: latest.id, url: latest.url, errors: members.filter(isError).length,
        color: active.length ? statusColor({ state: "pending" }) : statusColor(errorMember || latest),
        state: active.length ? "pending" : members.some(isError) ? "failed" : "complete",
        start: active.length ? Math.min(...active.map((r) => r.start || Date.now())) : undefined,
        duration: active.length ? undefined : latest.duration };
      display.push(cluster);
      for (const member of members) {
        owners.set(member.id, cluster.id);
        alias.set(member.id, cluster.expanded ? member.id : cluster.id);
        if (cluster.expanded) { display.push(member); membershipParents.set(member.id, cluster.id); }
      }
    } else for (const member of members) { display.push(member); alias.set(member.id, member.id); }
  }
  const visibleEdges = [], keys = new Set();
  for (const edge of relationships(records)) {
    // External links remain bundled through the same hub while it is open.
    // Recorded relationships inside an expanded group retain their real IDs.
    const sameGroup = owners.has(edge.from) && owners.get(edge.from) === owners.get(edge.to);
    const from = sameGroup ? alias.get(edge.from) : owners.get(edge.from) || alias.get(edge.from);
    const to = sameGroup ? alias.get(edge.to) : owners.get(edge.to) || alias.get(edge.to);
    const key = JSON.stringify([from, to, edge.kind]);
    if (from && to && from !== to && !keys.has(key)) { keys.add(key); visibleEdges.push({ from, to, kind: edge.kind }); }
  }
  // These are visual membership links, NOT inferred network dependencies.
  for (const [to, from] of membershipParents) visibleEdges.push({ from, to, kind: "group membership" });
  return { display, visibleEdges, membershipParents, alias, byId: new Map(display.map((r) => [r.id, r])), parents: new Map(visibleEdges.map((e) => [e.to, e.from])), active: display.some((r) => ["pending", "receiving"].includes(r.state)) };
}
