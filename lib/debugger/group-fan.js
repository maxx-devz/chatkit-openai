const SPREAD = Math.PI * .4;
const FIRST_RADIUS = 160, RING_GAP = 130, SEPARATION = 88;

function headingFrom(anchor, center) {
  const dx = anchor.x - center.x, dy = anchor.y - center.y;
  const x = Math.abs(dx) < 24 ? 0 : Math.sign(dx), y = Math.abs(dy) < 24 ? 0 : Math.sign(dy);
  return x || y ? Math.atan2(y, x) : -Math.PI / 2;
}
function row(radius, count, heading) {
  return Array.from({ length: count }, (_, i) => {
    const angle = heading + (count === 1 ? 0 : (i / (count - 1) - .5) * SPREAD);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}
function capacity(radius) { return Math.max(3, Math.floor(radius * SPREAD / 96) + 1); }
function collisionIndex(points) {
  const cells = new Map(), cell = SEPARATION;
  const key = (x, y) => `${x}:${y}`;
  const add = (point) => {
    const k = key(Math.floor(point.x / cell), Math.floor(point.y / cell));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(point);
  };
  for (const point of points) add(point);
  return { add, blocked(point) {
    const x = Math.floor(point.x / cell), y = Math.floor(point.y / cell);
    for (let i = x - 1; i <= x + 1; i++) for (let j = y - 1; j <= y + 1; j++) {
      if (cells.get(key(i, j))?.some(other => Math.hypot(point.x - other.x, point.y - other.y) < SEPARATION)) return true;
    }
    return false;
  } };
}

// The plan stores offsets rather than global positions: dragging a hub carries
// its entire fan. Existing members keep their slots when new traffic arrives.
export function layoutGroupFan({ anchor, center = { x: 0, y: 0 }, members, obstacles = [], previous }) {
  const heading = previous?.heading ?? headingFrom(anchor, center);
  const ordered = [...members].sort((a, b) => (a.start || 0) - (b.start || 0) || a.id.localeCompare(b.id));
  const ids = new Set(ordered.map(member => member.id));
  const offsets = new Map([...(previous?.offsets || [])].filter(([id]) => ids.has(id)));
  const absolute = (offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y });
  const occupied = collisionIndex([...obstacles, anchor, ...[...offsets.values()].map(absolute)]);
  const initial = [];
  if (!previous) {
    let remaining = ordered.length;
    for (let radius = FIRST_RADIUS; remaining; radius += RING_GAP) {
      const count = Math.min(remaining, capacity(radius));
      initial.push(...row(radius, count, heading)); remaining -= count;
    }
  }
  let initialIndex = 0, nextRing = 0, candidates = [], candidateIndex = 0;
  for (const member of ordered) {
    if (offsets.has(member.id)) continue;
    let offset = initial[initialIndex++];
    if (!offset || occupied.blocked(absolute(offset))) {
      // Deterministic free slots only in this outward sector, never a random
      // whole-graph spiral. Spatial buckets keep large groups inexpensive.
      do {
        if (candidateIndex >= candidates.length) {
          const radius = FIRST_RADIUS + nextRing++ * RING_GAP;
          candidates = row(radius, capacity(radius), heading); candidateIndex = 0;
        }
        offset = candidates[candidateIndex++];
      } while (occupied.blocked(absolute(offset)));
    }
    offsets.set(member.id, offset); occupied.add(absolute(offset));
  }
  return { heading, offsets, positions: new Map([...offsets].map(([id, offset]) => [id, absolute(offset)])) };
}

export function interpolateFan(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress)), eased = 1 - (1 - t) ** 3;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}
