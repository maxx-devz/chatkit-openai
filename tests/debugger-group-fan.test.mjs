import test from "node:test";
import assert from "node:assert/strict";
import { interpolateFan, layoutGroupFan } from "../lib/debugger/group-fan.js";
import { buildGraphScene } from "../lib/debugger/scene.js";

const members = count => Array.from({ length: count }, (_, i) => ({ id: `request:${i}`, start: i + 1 }));
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .001;

test("two, three and larger groups fan out within the hub's own quadrant", () => {
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const count of [2, 3, 12, 100]) {
    const anchor = { x: x * 240, y: y * 180 };
    const plan = layoutGroupFan({ anchor, members: members(count) });
    assert.equal(plan.positions.size, count);
    for (const point of plan.positions.values()) {
      assert.ok((point.x - anchor.x) * x > 0);
      assert.ok((point.y - anchor.y) * y > 0);
    }
    const points = [...plan.positions.values()];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= 87.99);
  }
});
test("layout is deterministic, symmetric for small groups and does not mutate obstacles", () => {
  const anchor = { x: 0, y: -220 }, obstacles = [{ x: 0, y: 0 }];
  const a = layoutGroupFan({ anchor, obstacles, members: members(3) });
  const b = layoutGroupFan({ anchor, obstacles, members: members(3).reverse() });
  assert.deepEqual(a.positions, b.positions);
  const points = [...a.positions.values()];
  assert.ok(Math.abs(points[0].x + points[2].x) < .001);
  assert.ok(Math.abs(points[1].x) < .001);
  assert.deepEqual(obstacles, [{ x: 0, y: 0 }]);
  assert.deepEqual(anchor, { x: 0, y: -220 });
});
test("new live requests get free local slots without shifting existing members", () => {
  const anchor = { x: -240, y: -200 };
  const original = layoutGroupFan({ anchor, members: members(2) });
  const appended = layoutGroupFan({ anchor, members: members(7), previous: original });
  for (const [id, point] of original.positions) assert.deepEqual(appended.positions.get(id), point);
  const moved = layoutGroupFan({ anchor: { x: anchor.x + 55, y: anchor.y - 20 }, members: members(7), previous: appended });
  for (const [id, point] of appended.positions) assert.ok(near(moved.positions.get(id), { x: point.x + 55, y: point.y - 20 }));
});
test("obstacles push only the new fan slots outward, not unrelated nodes", () => {
  const anchor = { x: -240, y: -180 };
  const baseline = layoutGroupFan({ anchor, members: members(3) });
  const obstacles = [...baseline.positions.values()];
  const avoided = layoutGroupFan({ anchor, members: members(3), obstacles });
  for (const point of avoided.positions.values()) for (const obstacle of obstacles) assert.ok(Math.hypot(point.x - obstacle.x, point.y - obstacle.y) >= 87.99);
  assert.deepEqual(obstacles, [...baseline.positions.values()]);
});
test("large groups use bounded rings in one sector rather than a whole-graph scatter", () => {
  const anchor = { x: -200, y: -200 }, plan = layoutGroupFan({ anchor, members: members(1000) });
  assert.equal(plan.positions.size, 1000);
  assert.ok([...plan.positions.values()].every(point => point.x < anchor.x && point.y < anchor.y));
  assert.ok(Math.max(...[...plan.offsets.values()].map(point => Math.hypot(point.x, point.y))) < 6500);
});
test("expanded groups retain their upstream connection and distinct membership edges", () => {
  const base = { tabId: "t", navigationId: "nav", source: "fetch", category: "api", url: "https://app.test/data", method: "GET", state: "complete" };
  const records = [{ id: "nav", navigationId: "nav", tabId: "t", category: "navigation" }, ...members(3).map(member => ({ ...base, ...member }))];
  const closed = buildGraphScene(records, "endpoint"), hub = closed.display.find(record => record.members);
  const opened = buildGraphScene(records, "endpoint", new Set([hub.groupKey]));
  assert.equal(opened.display.find(record => record.members).id, hub.id);
  assert.deepEqual(opened.visibleEdges.filter(edge => edge.kind !== "group membership"), closed.visibleEdges);
  assert.deepEqual(opened.visibleEdges.filter(edge => edge.kind === "group membership"), members(3).map(member => ({ from: hub.id, to: member.id, kind: "group membership" })));
  for (const member of members(3)) assert.equal(opened.alias.get(member.id), member.id);
  const collapsed = buildGraphScene(records, "endpoint");
  assert.equal(collapsed.membershipParents.size, 0);
  assert.equal(collapsed.display.find(record => record.members).id, hub.id);
});
test("opening motion starts at the hub, lands exactly and never overshoots", () => {
  const from = { x: -20, y: -20 }, to = { x: -180, y: -160 };
  assert.deepEqual(interpolateFan(from, to, 0), from);
  assert.deepEqual(interpolateFan(from, to, 1), to);
  assert.deepEqual(interpolateFan(from, to, 9), to);
  const middle = interpolateFan(from, to, .5);
  assert.ok(middle.x < from.x && middle.x > to.x && middle.y < from.y && middle.y > to.y);
});
