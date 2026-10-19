"use client";
import { useState } from "react";
import ClientAiWorkflowCard from "@/components/portal/client-ai-workflow-card";
import { ClientAiWorkflowProvider, createClientAiWorkflowStore } from "@/components/portal/client-ai-workflow-store";

export default function WorkflowPreview() {
  const [store] = useState(createClientAiWorkflowStore);
  function start(work = false) {
    const id = store.start(work ? "work" : "general");
    for (const stage of ["access", "context", ...(work ? ["hubstaff"] : []), "backend", "ready"]) store.advance(id, stage);
  }
  return <ClientAiWorkflowProvider value={store}>
    <main style={{ minHeight: "100vh", padding: "24px 12px", background: "#eef3f9", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 18 }}>Paper-flight animation test fixture</h1>
      <p>This authorized development preview simulates progress markers only. It sends no AI requests.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 30 }}>
        <button onClick={() => start()}>Rapid general stages</button>
        <button onClick={() => start(true)}>Rapid work stages</button>
        <button onClick={() => store.advance(store.getSnapshot().id, "stream")}>Response streaming</button>
        <button onClick={() => store.finish(store.getSnapshot().id, "complete")}>Complete</button>
        <button onClick={() => store.finish(store.getSnapshot().id, "cancelled")}>Cancel</button>
        <button onClick={() => store.finish(store.getSnapshot().id, "error")}>Error</button>
      </div>
      <div style={{ maxWidth: 720, margin: "auto" }}><ClientAiWorkflowCard /></div>
    </main>
  </ClientAiWorkflowProvider>;
}
