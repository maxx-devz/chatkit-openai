"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./client-portal.module.css";

const DEFAULT_WIDTH = 48;

export default function ResizableDashboardGrid({ clientId, left, right }) {
  const gridRef = useRef(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const [assistantWidth, setAssistantWidth] = useState(DEFAULT_WIDTH);
  const storageKey = `aoc-client-assistant-width:${clientId}`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= 35 && saved <= 70) {
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
    const minRight = Math.max(420, available * 0.35);
    const maxRight = Math.min(available - 340, available * 0.7);
    const next = Math.round((Math.max(minRight, Math.min(maxRight, rightWidth)) / available) * 1000) / 10;
    widthRef.current = next;
    setAssistantWidth(next);
  }

  function saveWidth() {
    window.localStorage.setItem(storageKey, String(widthRef.current));
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
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? DEFAULT_WIDTH : Math.max(35, Math.min(70, widthRef.current + (event.key === "ArrowLeft" ? 2 : -2)));
    widthRef.current = next;
    setAssistantWidth(next);
    window.localStorage.setItem(storageKey, String(next));
  }

  return (
    <div ref={gridRef} className={styles.dashboardGrid} style={{ "--assistant-width": `${assistantWidth}%` }}>
      {left}
      <div
        className={styles.columnDivider}
        role="separator"
        aria-label="Resize AI assistant"
        aria-orientation="vertical"
        aria-valuemin={35}
        aria-valuemax={70}
        aria-valuenow={Math.round(assistantWidth)}
        tabIndex={0}
        title="Drag to resize the AI assistant; double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={saveWidth}
        onPointerCancel={saveWidth}
        onDoubleClick={() => {
          widthRef.current = DEFAULT_WIDTH;
          setAssistantWidth(DEFAULT_WIDTH);
          window.localStorage.setItem(storageKey, String(DEFAULT_WIDTH));
        }}
        onKeyDown={onKeyDown}
      ><span aria-hidden="true" /></div>
      {right}
    </div>
  );
}
