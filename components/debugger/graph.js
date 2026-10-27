"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { statusColor } from "@/lib/debugger/model";
import { buildGraphScene } from "@/lib/debugger/scene";
import { interpolateFan, layoutGroupFan } from "@/lib/debugger/group-fan";
import styles from "./debugger.module.css";

const ICONS = { navigation: "↗", document: "H", image: "▧", css: "#", script: "JS", font: "Aa", api: "↔", websocket: "WS", eventsource: "SSE", media: "▶", error: "!", performance: "◷", other: "·" };
function hash(text) { let value = 0; for (const char of text) value = (value * 31 + char.charCodeAt(0)) | 0; return Math.abs(value); }
export default function NeuralGraph({ records, group, selectedId, onSelect, showSizes, slowMs, maximized, onToggleMaximize }) {
  const canvasRef = useRef(null), hostRef = useRef(null), positions = useRef(new Map());
  const fans = useRef(new Map()), motions = useRef(new Map());
  const camera = useRef({ x: 0, y: 0, zoom: 1 }), pointer = useRef(null), nodesRef = useRef([]);
  const fitRequested = useRef(true), hoverRef = useRef(null);
  const dirty = useRef(true);
  const [layoutVersion, setLayoutVersion] = useState(0), [hover, setHover] = useState(null), [expanded, setExpanded] = useState(() => new Set());
  const scene = useMemo(() => buildGraphScene(records, group, expanded), [records, group, expanded]);
  const hovered = hover && scene.byId.get(hover.id);
  const latest = useRef(null);
  useEffect(() => { latest.current = { scene, selectedId, showSizes, slowMs }; dirty.current = true; }, [scene, selectedId, showSizes, slowMs]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const wheel = (event) => {
      event.preventDefault(); event.stopPropagation(); dirty.current = true;
      camera.current.zoom = Math.max(.08, Math.min(4, camera.current.zoom * (event.deltaY > 0 ? .9 : 1.1)));
    };
    // React wheel listeners are passive; use a local cancellable listener.
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current, host = hostRef.current, ctx = canvas.getContext("2d");
    let width = 1, height = 1, frame, visible = true, lastDraw = 0;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = new ResizeObserver(() => {
      width = host.clientWidth; height = host.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2); canvas.width = width * ratio; canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      dirty.current = true;
    }); resize.observe(host);
    const visibility = () => { visible = !document.hidden; }; document.addEventListener("visibilitychange", visibility);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && !document.hidden; }); intersection.observe(host);
    function draw(timestamp) {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden || width < 2 || height < 2 || timestamp - lastDraw < 33) return;
      lastDraw = timestamp;
      const state = latest.current;
      if (!state || (!dirty.current && !fitRequested.current && !state.scene.active && !motions.current.size)) return;
      dirty.current = false;
      const { display, visibleEdges, parents, membershipParents, alias, byId } = state.scene;
      const topLevel = display.filter(record => !membershipParents.has(record.id));
      for (const [index, record] of topLevel.entries()) if (!positions.current.has(record.id)) {
        const seed = hash(record.id), angle = index * 2.399963;
        const parent = positions.current.get(parents.get(record.id));
        positions.current.set(record.id, parent ? { x: parent.x + Math.cos(angle) * (130 + seed % 130), y: parent.y + Math.sin(angle) * (130 + seed % 130) } : { x: Math.cos(angle) * Math.sqrt(index + 1) * 88, y: Math.sin(angle) * Math.sqrt(index + 1) * 88 });
      }
      const openKeys = new Set();
      for (const hub of topLevel.filter(record => record.expanded && record.members)) {
        openKeys.add(hub.groupKey);
        const previous = fans.current.get(hub.groupKey);
        const signature = hub.members.map(member => member.id).sort().join("\0");
        if (previous?.signature === signature) continue;
        const anchor = positions.current.get(hub.id), ids = new Set(hub.members.map(member => member.id));
        const obstacles = display.filter(record => !ids.has(record.id)).map(record => positions.current.get(record.id)).filter(Boolean);
        const plan = layoutGroupFan({ anchor, center: { x: -camera.current.x, y: -camera.current.y }, members: hub.members, obstacles, previous });
        fans.current.set(hub.groupKey, { ...plan, signature });
        for (const [id, target] of plan.positions) if (!previous?.offsets.has(id)) {
          positions.current.set(id, reducedMotion ? target : { ...anchor });
          if (!reducedMotion) motions.current.set(id, { from: { ...anchor }, to: target, started: timestamp });
        }
      }
      for (const key of fans.current.keys()) if (!openKeys.has(key)) fans.current.delete(key);
      for (const [id, motion] of motions.current) {
        if (!membershipParents.has(id)) { motions.current.delete(id); continue; }
        const progress = (timestamp - motion.started) / 280;
        positions.current.set(id, interpolateFan(motion.from, motion.to, progress));
        if (progress >= 1) motions.current.delete(id);
      }
      host.dataset.graphMotion = motions.current.size ? "opening" : "idle";
      if (positions.current.size > 10_000) for (const key of positions.current.keys()) if (!byId.has(key)) positions.current.delete(key);
      nodesRef.current = display.map((record) => ({ ...positions.current.get(record.id), record }));
      if (fitRequested.current && display.length) {
        fitRequested.current = false;
        const points = nodesRef.current.map(node => motions.current.get(node.record.id)?.to || node), minX = Math.min(...points.map((p) => p.x)) - 80, maxX = Math.max(...points.map((p) => p.x)) + 80;
        const minY = Math.min(...points.map((p) => p.y)) - 70, maxY = Math.max(...points.map((p) => p.y)) + 70;
        camera.current = { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2, zoom: Math.min(1.5, Math.max(.08, Math.min(width / (maxX - minX), height / (maxY - minY)) * .85)) };
      }
      ctx.clearRect(0, 0, width, height);
      const { x, y, zoom } = camera.current;
      ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(x, y);
      // Highlight only the recorded ancestor chain of the selected resource.
      const chain = new Set(); let ancestor = alias.get(state.selectedId), guard = 0;
      while (ancestor && guard++ < 100) { chain.add(ancestor); ancestor = parents.get(ancestor); if (chain.has(ancestor)) break; }
      for (const edge of visibleEdges) {
        const a = positions.current.get(edge.from), b = positions.current.get(edge.to); if (!a || !b) continue;
        const emphasized = chain.has(edge.from) && chain.has(edge.to);
        const membership = edge.kind === "group membership";
        const target = byId.get(edge.to), pending = !membership && ["pending", "receiving"].includes(target?.state);
        ctx.strokeStyle = emphasized ? "#a5b4fc" : membership ? "#4f819b" : pending ? "#28869d" : "#324057";
        ctx.lineWidth = emphasized ? 2.4 : membership ? 1.5 : 1.2;
        ctx.setLineDash(membership ? [7, 4] : edge.kind === "navigation association" ? [3, 6] : []);
        const middle = (a.x + b.x) / 2, lift = Math.min(65, Math.abs(a.x - b.x) * .1 + 12);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(middle, a.y - lift, middle, b.y - lift, b.x, b.y); ctx.stroke();
        if (pending && !reducedMotion) {
          const t = (timestamp / 1600 + hash(edge.to) % 10 / 10) % 1, u = 1 - t;
          const px = u ** 3 * a.x + 3 * u * u * t * middle + 3 * u * t * t * middle + t ** 3 * b.x;
          const py = u ** 3 * a.y + 3 * u * u * t * (a.y - lift) + 3 * u * t * t * (b.y - lift) + t ** 3 * b.y;
          ctx.fillStyle = "#5ee6ff"; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.setLineDash([]);
      for (const { record, x: nx, y: ny } of nodesRef.current) {
        const screenX = (nx + x) * zoom + width / 2, screenY = (ny + y) * zoom + height / 2;
        if (screenX < -100 || screenX > width + 100 || screenY < -70 || screenY > height + 70) continue;
        const active = ["pending", "receiving"].includes(record.state), color = record.color || statusColor(record), radius = record.members ? 24 : 17;
        if (active) { ctx.globalAlpha = reducedMotion ? .14 : .14 + Math.sin(timestamp / 250) * .06; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(nx, ny, radius + 9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = "#101d30"; ctx.strokeStyle = state.selectedId === record.id || chain.has(record.id) ? "#e2e8ff" : color; ctx.lineWidth = state.selectedId === record.id ? 3.5 : 2;
        ctx.beginPath(); ctx.arc(nx, ny, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 10px system-ui";
        ctx.fillText(record.members ? String(record.members.length) : ICONS[record.category] || "·", nx, ny);
        if (record.expanded) { ctx.fillStyle = "#a5b4fc"; ctx.font = "bold 9px system-ui"; ctx.fillText("−", nx, ny - radius - 9); }
        if (zoom > .65 || display.length < 80 || chain.has(record.id)) {
          ctx.font = "10px system-ui"; ctx.fillStyle = "#b8c8df";
          let label = record.label; if (!label) { try { label = new URL(record.url).pathname.split("/").filter(Boolean).at(-1) || "/"; } catch { label = record.category; } }
          ctx.fillText(String(label || "resource").slice(0, 28), nx, ny + radius + 14);
          const elapsed = active ? Math.max(0, Date.now() - record.start) : record.duration;
          if (elapsed != null) { ctx.fillStyle = elapsed > state.slowMs ? "#facc64" : "#7188a5"; ctx.font = "9px system-ui"; ctx.fillText(`${Math.round(elapsed)} ms${state.showSizes && record.transferSize != null ? ` · ${(record.transferSize / 1024).toFixed(1)} KB` : ""}`, nx, ny + radius + 27); }
        }
      }
      ctx.restore();
    }
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [layoutVersion]);
  function point(event) { const r = canvasRef.current.getBoundingClientRect(); const c = camera.current; return { x: (event.clientX - r.left - r.width / 2) / c.zoom - c.x, y: (event.clientY - r.top - r.height / 2) / c.zoom - c.y }; }
  function hit(point) { return [...nodesRef.current].reverse().find((n) => Math.hypot(n.x - point.x, n.y - point.y) < (n.record.members ? 28 : 22)); }
  function down(event) { if (event.button !== 0 && event.button !== 1) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); const p = point(event); pointer.current = { id: hit(p)?.record.id, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event) {
    const dragging = pointer.current;
    if (dragging) {
      dirty.current = true;
      const dx = (event.clientX - dragging.x) / camera.current.zoom, dy = (event.clientY - dragging.y) / camera.current.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragging.moved = true;
      if (dragging.id) {
        const old = positions.current.get(dragging.id), record = scene.byId.get(dragging.id);
        positions.current.set(dragging.id, { x: old.x + dx, y: old.y + dy });
        motions.current.delete(dragging.id);
        if (record?.expanded && record.members) for (const member of record.members) {
          const child = positions.current.get(member.id); if (!child) continue;
          positions.current.set(member.id, { x: child.x + dx, y: child.y + dy });
          const motion = motions.current.get(member.id);
          if (motion) for (const p of [motion.from, motion.to]) { p.x += dx; p.y += dy; }
        }
        const hub = scene.byId.get(scene.membershipParents.get(dragging.id));
        const plan = hub && fans.current.get(hub.groupKey), anchor = hub && positions.current.get(hub.id);
        if (plan && anchor) plan.offsets.set(dragging.id, { x: old.x + dx - anchor.x, y: old.y + dy - anchor.y });
      }
      else { camera.current.x += dx; camera.current.y += dy; }
      dragging.x = event.clientX; dragging.y = event.clientY;
    } else {
      const target = hit(point(event));
      if (hoverRef.current !== target?.record.id) { hoverRef.current = target?.record.id; setHover(target?.record || null); }
    }
  }
  function up() {
    const value = pointer.current; pointer.current = null;
    if (!value?.moved && value?.id) {
      const record = nodesRef.current.find((n) => n.record.id === value.id)?.record;
      if (record?.members) onSelect(record.latestId);
      else if (record) onSelect(record.id);
    }
  }
  return <div className={styles.graphHost} ref={hostRef} data-graph-nodes={scene.display.length} data-expanded-groups={scene.display.filter(record => record.expanded).length} data-group-links={scene.membershipParents.size}>
    <div className={styles.graphTools}>
      <button onClick={() => { fitRequested.current = true; }}>Fit graph</button>
      <button onClick={() => { positions.current.clear(); fans.current.clear(); motions.current.clear(); fitRequested.current = true; setLayoutVersion((v) => v + 1); }}>Reset layout</button>
      <button onClick={() => { camera.current.zoom = Math.min(4, camera.current.zoom * 1.2); dirty.current = true; }} aria-label="Zoom in">+</button>
      <button onClick={() => { camera.current.zoom = Math.max(.08, camera.current.zoom / 1.2); dirty.current = true; }} aria-label="Zoom out">−</button>
      <button onClick={() => { fans.current.clear(); motions.current.clear(); setExpanded(new Set()); }}>Collapse groups</button>
      <button onClick={onToggleMaximize} aria-pressed={maximized} aria-label={maximized ? "Restore graph size" : "Maximize graph workspace"}>{maximized ? "Restore size" : "Maximize"}</button>
    </div>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="Live resource graph. Drag nodes or background; scroll to zoom. Use waterfall view for keyboard resource selection." tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { pointer.current = null; }} onPointerLeave={() => { setHover(null); }}
      onDoubleClick={(event) => { const record = hit(point(event))?.record; if (record?.members) { setHover(null); hoverRef.current = null; fans.current.delete(record.groupKey); setExpanded((old) => { const next = new Set(old); if (next.has(record.groupKey)) next.delete(record.groupKey); else next.add(record.groupKey); return next; }); } }}
      onKeyDown={(event) => { dirty.current = true; if (event.key === "+") camera.current.zoom *= 1.1; if (event.key === "-") camera.current.zoom /= 1.1; if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); camera.current.x += event.key === "ArrowLeft" ? 30 : event.key === "ArrowRight" ? -30 : 0; camera.current.y += event.key === "ArrowUp" ? 30 : event.key === "ArrowDown" ? -30 : 0; } }} />
    {hovered ? <div className={styles.tooltip}><strong>{hovered.label || hovered.category}</strong><span>{hovered.url}</span>{hovered.members ? <span>{hovered.members.length} requests · {hovered.errors} errors · Click to inspect; double-click to {hovered.expanded ? "collapse" : "expand"}</span> : null}<span>{hovered.status ? `HTTP ${hovered.status}` : hovered.state} · {hovered.duration == null ? "Duration unavailable" : `${Math.round(hovered.duration)} ms`} · {hovered.transferSize == null ? "Size unavailable" : `${(hovered.transferSize / 1024).toFixed(1)} KB`}</span></div> : null}
    {!records.length ? <div className={styles.empty}>Waiting for captured activity<span>Open the normal portal in another tab and refresh it.</span></div> : null}
    <div className={styles.graphCaption}>Solid: recorded correlation · Dotted: navigation association · Blue dashed branches: group members · Double-click a count to expand/collapse</div>
  </div>;
}
