"use client";
import { useEffect } from "react";
export default function DebuggerCapture({ config }) {
  useEffect(() => {
    let dispose, cancelled = false;
    import("@/lib/debugger/browser").then(({ startDebuggerCapture }) => { if (!cancelled) dispose = startDebuggerCapture(config); }).catch(() => {});
    return () => { cancelled = true; dispose?.(); };
  }, [config]);
  return null;
}
