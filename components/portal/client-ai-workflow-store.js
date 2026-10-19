"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

const EMPTY = Object.freeze({ id: 0, active: false, closing: false, mode: "work", outcome: null, steps: [] });
const STAGES = new Set(["sending", "access", "context", "hubstaff", "backend", "ready", "stream"]);
const WorkflowContext = createContext(null);

export function createClientAiWorkflowStore() {
  let current = EMPTY;
  let nextId = 0;
  let closeTimer = null;
  const listeners = new Set();
  const publish = (next) => {
    current = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => current,
    start(mode) {
      if (closeTimer) clearTimeout(closeTimer);
      const id = ++nextId;
      publish({ id, active: true, closing: false, mode, outcome: null, steps: ["sending"] });
      return id;
    },
    advance(id, stage) {
      if (!STAGES.has(stage) || !current.active || current.closing || current.id !== id || current.steps.includes(stage)) return;
      publish({ ...current, steps: [...current.steps, stage] });
    },
    finish(id, outcome = "complete") {
      if (!current.active || current.id !== id || current.closing) return;
      const result = ["complete", "error", "cancelled"].includes(outcome) ? outcome : "error";
      publish({
        ...current,
        closing: true,
        outcome: result,
        steps: result === "complete" ? [...current.steps, "complete"] : current.steps,
      });
      closeTimer = setTimeout(() => {
        if (current.id === id) publish(EMPTY);
        closeTimer = null;
      }, 760);
    },
  };
}

export const ClientAiWorkflowProvider = WorkflowContext.Provider;

export function useClientAiWorkflowActions() {
  return useContext(WorkflowContext);
}

export function useClientAiWorkflowState() {
  const store = useContext(WorkflowContext);
  return useSyncExternalStore(
    store?.subscribe || (() => () => {}),
    store?.getSnapshot || (() => EMPTY),
    () => EMPTY,
  );
}
