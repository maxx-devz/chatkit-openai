"use client";

import { visibleWorkflowNodes, workflowCurve, workflowCurvePath, workflowNodeForStage, workflowNodePoint } from "@/lib/workflow-flight";
import { useClientAiWorkflowState } from "./client-ai-workflow-store";
import useWorkflowPaperFlight from "./use-workflow-paper-flight";
import styles from "./client-ai-workflow-card.module.css";

const DETAILS = {
  sending: "Sending your request", access: "Checking workspace access", context: "Checking conversation context",
  hubstaff: "Reading relevant work data", backend: "Connecting to the AI service", ready: "The AI service is preparing a reply",
  stream: "Your reply is arriving", complete: "Response delivered",
};
function PaperPlane() {
  return <svg viewBox="0 0 42 42" fill="none" aria-hidden="true">
    <path d="M4 5 38 21 4 37l7-16-7-16Z" fill="#f8fcff" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="m11 21 27 0L4 37l7-16Z" fill="#cce5ff" />
    <path d="M11 21h27M4 5l7 16L4 37" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>;
}
function StageGlyph({ id }) {
  const paths = {
    sending: <><path d="M8 4h10l6 6v18H8z" /><path d="M18 4v7h6M12 16h8M12 21h5" /></>,
    access: <><path d="m16 3 11 5v8c0 7-11 13-11 13S5 23 5 16V8z" /><path d="m11 15 4 4 7-8" /></>,
    hubstaff: <><ellipse cx="16" cy="8" rx="10" ry="4" /><path d="M6 8v8c0 5 20 5 20 0V8M6 16v8c0 5 20 5 20 0v-8" /></>,
    backend: <><path d="m16 3 3.8 9.2L29 16l-9.2 3.8L16 29l-3.8-9.2L3 16l9.2-3.8z" /><path d="m26 3 1.3 3.7L31 8l-3.7 1.3L26 13" /></>,
    stream: <><path d="M5 5h22v17H15l-7 6v-6H5z" /><path d="m10 13 4 4 8-8" /></>,
  };
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[id]}</svg>;
}
export default function ClientAiWorkflowCard() {
  const workflow = useClientAiWorkflowState();
  const { graphRef, paperRef, graphWidth, arrivedNode, flightPath, flightTarget } = useWorkflowPaperFlight(workflow);
  if (!workflow.active) return null;
  const currentStage = workflow.steps.at(-1) || "sending", targetNode = workflowNodeForStage(currentStage);
  const nodes = visibleWorkflowNodes(workflow.steps), arrivedIndex = nodes.findIndex(node => node.id === arrivedNode);
  const status = workflow.outcome === "error" ? "The request could not finish" : workflow.outcome === "cancelled" ? "Request stopped" : DETAILS[currentStage] || "Processing your request";
  const classes = [styles.card, workflow.closing && styles.closing, workflow.outcome === "complete" && styles.succeeded, workflow.outcome === "error" && styles.failed].filter(Boolean).join(" ");
  return <section className={classes} role="status" aria-live="polite" aria-label={"AI request progress: " + status} data-arrived-node={arrivedNode} data-flight-target={flightTarget || ""}>
    <div className={styles.heading}>
      <span className={styles.journeyMark} aria-hidden="true"><PaperPlane /></span>
      <div><span className={styles.eyebrow}>Live request journey</span><h3>{status}</h3></div>
      <span className={styles.mode}><i />{workflow.mode === "work" ? "Work question" : "General chat"}</span>
    </div>
    <div className={styles.graph} ref={graphRef} aria-hidden="true">
      {graphWidth > 0 ? <>
        <svg className={styles.paths} viewBox={"0 0 " + graphWidth + " 146"} preserveAspectRatio="none">
          {nodes.slice(1).map((node, index) => {
            const start = workflowNodePoint(nodes[index].id, graphWidth), end = workflowNodePoint(node.id, graphWidth);
            return <path className={index < arrivedIndex ? styles.completedPath : styles.pendingPath} d={workflowCurvePath(workflowCurve(start, end, node.id === "backend" ? 1 : 0))} key={node.id} />;
          })}
          {flightPath ? <path className={styles.currentPath} pathLength="100" d={flightPath} /> : null}
        </svg>
        {nodes.map((node, index) => {
          const point = workflowNodePoint(node.id, graphWidth);
          const stageClasses = [styles.stage, index < arrivedIndex && styles.completedStage, arrivedNode === node.id && styles.arrivedStage, targetNode === node.id && !workflow.closing && styles.processingStage].filter(Boolean).join(" ");
          return <div className={stageClasses} style={{ left: point.x, top: point.y - 17 }} key={node.id} data-workflow-node={node.id}>
            <span className={styles.stageIcon}><StageGlyph id={node.id} />{index < arrivedIndex ? <b className={styles.check}>✓</b> : null}</span>
            <span className={styles.stageLabel}>{node.label}</span>
          </div>;
        })}
        <span className={styles.paper} ref={paperRef} data-flying="false"><PaperPlane /></span>
      </> : null}
    </div>
    <p className={styles.note}><span className={styles.noteDot} />{workflow.outcome === "error" ? "No completion was recorded. You can try again."
      : workflow.outcome === "cancelled" ? "The workflow stopped before completion."
        : workflow.mode === "work" ? "Work data joins the route only when needed." : "General chat · No work-data lookup"}</p>
  </section>;
}
