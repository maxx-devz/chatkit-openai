"use client";

import { useState } from "react";
import SignOutButton from "@/components/auth/sign-out-button";

export async function switchWorkspace(workspace) {
  const response = await fetch("/api/session/client", {
    method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: workspace.slug, agencySlug: workspace.agencySlug }),
  });
  if (!response.ok) throw Error("Workspace access changed. Reload to see your available workspaces.");
  // Discard the old document, including its workspace-specific client and router caches.
  window.location.replace("/");
}

export default function WorkspaceChooser({ choices, message = "Choose your workspace" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function select(choice) {
    setBusy(true);
    try { await switchWorkspace(choice); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <section aria-label="Workspace selection">
    <h1>{message}</h1>
    <ul>{choices.map(choice => <li key={choice.id}>
      <button type="button" disabled={busy} onClick={() => select(choice)}>{choice.agencyName} / {choice.name}</button>
    </li>)}</ul>
    {error && <p role="alert">{error}</p>}
    <SignOutButton />
  </section>;
}
