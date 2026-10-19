"use client";
/* eslint-disable @next/next/no-img-element -- Probes intentionally exercise native browser resource loading. */
/* eslint-disable @next/next/no-css-tags -- An external stylesheet is intentionally requested by this capture test. */
import { useState } from "react";
import styles from "./debugger.module.css";
export default function DebuggerProbes() {
  const [result, setResult] = useState("No probes run."), [missing, setMissing] = useState(false), [images, setImages] = useState(0);
  async function run(kind) {
    setResult(`Running ${kind}…`);
    if (kind === "chunk") { const probeChunk = await import("./probe-module"); setResult(probeChunk.probe()); }
    else if (kind === "parallel") { await Promise.all(Array.from({ length: 6 }, (_, i) => fetch(`/debugger-lab/data.json?parallel=${i}`).then((r) => r.json()))); setResult("Six real HTTP requests completed."); }
    else if (kind === "large") { setImages(500); setResult("500 real lazy image resources added. Scroll the page to request them."); }
    else if (kind === "missing") { setMissing(true); setResult("Requested an intentionally missing image; expected HTTP 404."); }
    else if (kind === "error") { setTimeout(() => { throw new Error("Authorized debugger probe: deliberate runtime exception"); }); setResult("Deliberate development exception dispatched."); }
    else { const response = await fetch(`/debugger-lab/${kind}.json`); await response.text(); setResult(`${kind}: HTTP ${response.status}, response fully consumed.`); }
  }
  return <main className={styles.page} style={{ padding: 32 }}>
    <h1>Authorized capture probes</h1><p>These controls produce real development HTTP requests. They do not modify clients, tasks, or billing.</p>
    <link rel="stylesheet" href="/debugger-lab/probe.css" />
    <div className={styles.toolbar}>{[["parallel", "Parallel requests"], ["slow", "Delayed response"], ["stream", "Streaming response"], ["chunk", "Dynamic JavaScript chunk"], ["missing", "Missing image (404)"], ["error", "Runtime error"], ["large", "500 lazy images"]].map(([key, label]) => <button key={key} onClick={() => run(key)}>{label}</button>)}</div>
    <p role="status">{result}</p><p className="debugger-probe-font">This line requests the bundled test font through CSS.</p>
    <img src="/debugger-lab/image.svg" width="320" height="160" alt="Real SVG capture probe" />
    {missing ? <img src="/debugger-lab/missing.png" width="100" height="80" alt="Intentional missing resource probe" /> : null}
    <div style={{ marginTop: 1400, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>{Array.from({ length: images || 12 }, (_, i) => <img key={i} loading="lazy" src={`/debugger-lab/image.svg?image=${i}`} width="160" height="90" alt={`Lazy capture probe ${i + 1}`} />)}</div>
  </main>;
}
