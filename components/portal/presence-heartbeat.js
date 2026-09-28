"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 20_000;

export default function PresenceHeartbeat() {
  useEffect(() => {
    let active = true;
    let requestInFlight = false;

    async function heartbeat() {
      if (!active || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      try {
        await fetch("/api/presence", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Presence is informational and must never interrupt the client portal.
      } finally {
        requestInFlight = false;
      }
    }

    const refresh = () => { void heartbeat(); };
    refresh();
    const intervalId = window.setInterval(refresh, HEARTBEAT_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return null;
}
