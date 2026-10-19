"use client";

import { useEffect, useRef, useState } from "react";
import { ClientAiWorkflowProvider, createClientAiWorkflowStore } from "./client-ai-workflow-store";
import styles from "./client-portal.module.css";

const DEFAULT_WIDTH = 48;
const MIN_WIDTH = 35;
const MAX_SPLIT_WIDTH = 76;
const FULL_WIDTH_THRESHOLD = 78;
const FULL_WIDTH = 100;

export default function ResizableDashboardGrid({ clientId, left, right }) {
  const gridRef = useRef(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const expandOnReleaseRef = useRef(false);
  const [assistantWidth, setAssistantWidth] = useState(DEFAULT_WIDTH);
  const [workflowStore] = useState(createClientAiWorkflowStore);
  const storageKey = `aoc-client-assistant-width:${clientId}`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = Number(window.localStorage.getItem(storageKey));
      if (saved === FULL_WIDTH || (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_SPLIT_WIDTH)) {
        widthRef.current = saved;
        setAssistantWidth(saved);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  function updateWidth(clientX) {
    const bounds = gridRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width < 900) return;
    const available = bounds.width - 14;
    const rightWidth = bounds.right - clientX - 7;
    expandOnReleaseRef.current = rightWidth / available >= FULL_WIDTH_THRESHOLD / 100;
    const minRight = Math.max(420, available * MIN_WIDTH / 100);
    const maxRight = Math.min(available - 220, available * MAX_SPLIT_WIDTH / 100);
    const next = Math.round((Math.max(minRight, Math.min(maxRight, rightWidth)) / available) * 1000) / 10;
    widthRef.current = next;
    setAssistantWidth(next);
  }

  function saveWidth() {
    const next = expandOnReleaseRef.current ? FULL_WIDTH : widthRef.current;
    expandOnReleaseRef.current = false;
    widthRef.current = next;
    setAssistantWidth(next);
    window.localStorage.setItem(storageKey, String(next));
  }

  function resetWidth() {
    expandOnReleaseRef.current = false;
    widthRef.current = DEFAULT_WIDTH;
    setAssistantWidth(DEFAULT_WIDTH);
    window.localStorage.setItem(storageKey, String(DEFAULT_WIDTH));
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateWidth(event.clientX);
  }

  function onPointerMove(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateWidth(event.clientX);
  }

  function onKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? DEFAULT_WIDTH
      : event.key === "End" || (event.key === "ArrowLeft" && widthRef.current >= MAX_SPLIT_WIDTH)
        ? FULL_WIDTH
        : Math.max(MIN_WIDTH, Math.min(MAX_SPLIT_WIDTH, widthRef.current + (event.key === "ArrowLeft" ? 2 : -2)));
    widthRef.current = next;
    setAssistantWidth(next);
    window.localStorage.setItem(storageKey, String(next));
  }

  const expanded = assistantWidth === FULL_WIDTH;

  return (
    <ClientAiWorkflowProvider value={workflowStore}>
      <div ref={gridRef} className={`${styles.dashboardGrid} ${expanded ? styles.assistantExpanded : ""}`} style={{ "--assistant-width": `${assistantWidth}%` }}>
        {expanded ? (
          <div className={styles.expandedToolbar}>
            <span>AOC-GPT expanded</span>
            <button type="button" onClick={resetWidth}>Return to split view</button>
          </div>
        ) : null}
        {left}
        {!expanded ? (
          <div
            className={styles.columnDivider}
            role="separator"
            aria-label="Resize AI assistant"
            aria-orientation="vertical"
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={FULL_WIDTH}
            aria-valuenow={Math.round(assistantWidth)}
            tabIndex={0}
            title="Drag left to expand AOC-GPT; double-click to reset. Press End for full width."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={saveWidth}
            onPointerCancel={() => {
              expandOnReleaseRef.current = false;
              saveWidth();
            }}
            onDoubleClick={resetWidth}
            onKeyDown={onKeyDown}
          ><span aria-hidden="true" /></div>
        ) : null}
        {right}
      </div>
    </ClientAiWorkflowProvider>
  );
}
