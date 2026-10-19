// Slots stay fixed when the optional Hubstaff stage appears, so nodes and the
// paper do not jump to new positions halfway through a request.
export const WORKFLOW_NODES = Object.freeze([
  { id: "sending", label: "Your request", slot: 0 },
  { id: "access", label: "AOC portal", slot: 1 },
  { id: "hubstaff", label: "Work data", slot: 2 },
  { id: "backend", label: "AI service", slot: 3 },
  { id: "stream", label: "AI response", slot: 4 },
]);

const STAGE_NODES = Object.freeze({
  sending: "sending",
  access: "access",
  context: "access",
  hubstaff: "hubstaff",
  backend: "backend",
  ready: "backend",
  stream: "stream",
  complete: "stream",
});

export function workflowNodeForStage(stage) {
  return STAGE_NODES[stage] || "sending";
}

export function visibleWorkflowNodes(steps) {
  return WORKFLOW_NODES.filter((node) => node.id !== "hubstaff" || steps.includes("hubstaff"));
}

// Coalesced React/SSE updates still get separate visual hops. This queue only
// contains observed stages; it never requests work data or delays a response.
export function pendingWorkflowHops(steps, arrived = "sending") {
  const confirmed = new Set(steps.map(workflowNodeForStage));
  const from = WORKFLOW_NODES.findIndex((node) => node.id === arrived);
  return WORKFLOW_NODES.slice(from + 1).filter((node) => confirmed.has(node.id)).map((node) => node.id);
}

export function workflowNodePoint(id, width) {
  const slot = WORKFLOW_NODES.find((node) => node.id === id)?.slot ?? 0;
  const inset = Math.min(54, Math.max(29, width * .08));
  return { x: inset + ((width - inset * 2) / 4) * slot, y: 82 };
}

export function workflowCurve(start, end, index = 0) {
  const dx = end.x - start.x;
  const arc = Math.min(62, Math.max(29, Math.abs(dx) * .38));
  const lift = index % 2 ? arc * .9 : arc;
  return {
    start,
    c1: { x: start.x + dx * .2, y: start.y - lift },
    c2: { x: start.x + dx * .78, y: end.y - lift * .94 },
    end,
  };
}

export function workflowCurvePath(curve) {
  const f = (point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  return `M ${f(curve.start)} C ${f(curve.c1)}, ${f(curve.c2)}, ${f(curve.end)}`;
}

export function workflowCurvePoint(curve, t) {
  const u = 1 - t;
  const { start, c1, c2, end } = curve;
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
  };
}

export function workflowFlightKeyframes(curve) {
  const pose = (point, angle, scale) => `translate(${(point.x - 14).toFixed(1)}px, ${(point.y - 14).toFixed(1)}px) rotate(${angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
  const frames = Array.from({ length: 13 }, (_, index) => {
    const t = index / 12;
    const point = workflowCurvePoint(curve, t);
    const u = 1 - t, { start, c1, c2, end } = curve;
    const dx = 3 * u * u * (c1.x - start.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (end.x - c2.x);
    const dy = 3 * u * u * (c1.y - start.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (end.y - c2.y);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const scale = 1 + Math.sin(t * Math.PI) * .12;
    return {
      offset: .16 + t * .78,
      opacity: 1,
      transform: pose(point, angle, scale),
    };
  });
  return [
    { offset: 0, opacity: 0, transform: pose(curve.start, -8, .82) },
    { offset: .1, opacity: 1, transform: pose({ x: curve.start.x - 5, y: curve.start.y + 2 }, -22, .9) },
    ...frames,
    { offset: 1, opacity: 0, transform: pose(curve.end, 0, .8) },
  ];
}
