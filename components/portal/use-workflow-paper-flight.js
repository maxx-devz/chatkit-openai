"use client";
import { useEffect, useRef, useState } from "react";
import { pendingWorkflowHops, workflowCurve, workflowCurvePath, workflowFlightKeyframes, workflowNodePoint } from "@/lib/workflow-flight";

function halt(runtime) {
  runtime.version++;
  runtime.animation?.cancel(); runtime.animation = null;
  clearTimeout(runtime.timer); runtime.timer = null;
}
export default function useWorkflowPaperFlight(workflow) {
  const graphRef = useRef(null), paperRef = useRef(null), pumpRef = useRef(null), latestRef = useRef(null);
  const runtimeRef = useRef({ id: 0, node: "sending", width: 0, version: 0, animation: null, timer: null });
  const [graphWidth, setGraphWidth] = useState(0);
  const [presentation, setPresentation] = useState({ id: 0, arrived: "sending", path: "", target: null });
  useEffect(() => {
    if (!workflow.active || !graphRef.current) return;
    const graph = graphRef.current, measure = () => setGraphWidth(Math.round(graph.clientWidth));
    measure(); const observer = new ResizeObserver(measure); observer.observe(graph);
    return () => observer.disconnect();
  }, [workflow.active]);
  useEffect(() => {
    latestRef.current = { workflow, graphWidth };
    const runtime = runtimeRef.current, paper = paperRef.current, graph = graphRef.current;
    if (!workflow.active || workflow.closing) {
      halt(runtime); if (paper) paper.dataset.flying = "false";
      if (!workflow.active) runtime.id = 0;
      return;
    }
    if (!paper || !graph || !graphWidth) return;
    const place = (node) => {
      const point = workflowNodePoint(node, graphWidth);
      paper.style.transform = `translate(${point.x - 14}px, ${point.y - 14}px)`;
      paper.dataset.flying = "false";
    };
    if (runtime.id !== workflow.id) {
      halt(runtime);
      Object.assign(runtime, { id: workflow.id, node: "sending", width: graphWidth, resumePoint: null });
      place("sending");
      runtime.timer = setTimeout(() => { runtime.timer = null; pumpRef.current?.(); }, 160);
    } else if (runtime.width !== graphWidth) {
      if (runtime.animation) {
        const a = paper.getBoundingClientRect(), b = graph.getBoundingClientRect();
        runtime.resumePoint = { x: Math.max(14, Math.min(graphWidth - 14, a.left + a.width / 2 - b.left)), y: a.top + a.height / 2 - b.top };
      }
      halt(runtime); runtime.width = graphWidth;
      if (!runtime.resumePoint) place(runtime.node);
    }
    pumpRef.current = () => {
      const latest = latestRef.current;
      if (!latest?.workflow.active || latest.workflow.closing || runtime.id !== latest.workflow.id || runtime.animation || runtime.timer) return;
      const queue = pendingWorkflowHops(latest.workflow.steps, runtime.node), next = queue[0];
      if (!next) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        runtime.node = queue.at(-1); place(runtime.node);
        setPresentation({ id: runtime.id, arrived: runtime.node, path: "", target: null }); return;
      }
      const start = runtime.resumePoint || workflowNodePoint(runtime.node, latest.graphWidth);
      runtime.resumePoint = null;
      const end = workflowNodePoint(next, latest.graphWidth), curve = workflowCurve(start, end, next === "backend" ? 1 : 0);
      const keyframes = workflowFlightKeyframes(curve), version = ++runtime.version;
      setPresentation({ id: runtime.id, arrived: runtime.node, path: workflowCurvePath(curve), target: next }); paper.dataset.flying = "true";
      const animation = paper.animate(keyframes, { duration: Math.min(780, Math.max(540, Math.abs(end.x - start.x) * 2.4)), easing: "linear", fill: "both" });
      runtime.animation = animation;
      animation.onfinish = () => {
        if (runtime.version !== version || latestRef.current.workflow.closing) return;
        paper.style.transform = keyframes.at(-1).transform;
        paper.dataset.flying = "false"; animation.cancel(); runtime.animation = null;
        // Commit only after landing; batched progress events cannot skip a stop.
        runtime.node = next; setPresentation({ id: runtime.id, arrived: next, path: "", target: null });
        runtime.timer = setTimeout(() => { runtime.timer = null; pumpRef.current?.(); }, 150);
      };
    };
    if (!runtime.timer && !runtime.animation) runtime.timer = setTimeout(() => { runtime.timer = null; pumpRef.current?.(); }, 0);
  }, [graphWidth, workflow]);
  useEffect(() => { const runtime = runtimeRef.current; return () => halt(runtime); }, []);
  const current = presentation.id === workflow.id ? presentation : { arrived: "sending", path: "", target: null };
  return { graphRef, paperRef, graphWidth, arrivedNode: current.arrived, flightPath: workflow.closing ? "" : current.path, flightTarget: workflow.closing ? null : current.target };
}
