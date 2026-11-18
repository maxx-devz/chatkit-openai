"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { switchWorkspace } from "./workspace-chooser";
import styles from "./account-controls.module.css";

export default function AccountControls({ client, memberships, user }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const initials = client.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const roleLabel = { client_viewer: "Viewer", member: "Member",
    client_admin: "Client Administrator", aoc_admin: "Member" }[client.role] || "Client user";

  async function switchClient(event) {
    const slug = event.target.value;
    if (!slug || slug === client.slug) return;
    setBusy("switching");

    try { await switchWorkspace(memberships.find(item => item.slug === slug)); }
    catch (failure) { setError(failure.message); setBusy(""); }
  }

  async function signOut() {
    setBusy("signout");
    await authClient.signOut().catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.controls}>
      <span className={styles.avatar}>{initials || "AOC"}</span>
      <div className={styles.identity}>
        {memberships.length > 1 ? (
          <label>
            <span className="sr-only">Active client account</span>
            <select
              aria-label="Active client account"
              disabled={Boolean(busy)}
              onChange={switchClient}
              value={client.slug || ""}
            >
              {memberships.map((membership) => (
                <option key={membership.slug} value={membership.slug}>
                  {membership.agencyName} / {membership.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <strong>{client.name}</strong>
        )}
        <small>{user.username || user.name} · {roleLabel}</small>
      </div>
      {error && <small role="alert">{error}</small>}
      <button
        aria-label="Sign out"
        disabled={Boolean(busy)}
        onClick={signOut}
        title="Sign out"
        type="button"
      >
        {busy === "signout" ? "..." : "Sign out"}
      </button>
    </div>
  );
}
