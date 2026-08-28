"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import styles from "./account-controls.module.css";

export default function AccountControls({ client, memberships, user }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const initials = client.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  async function switchClient(event) {
    const slug = event.target.value;
    if (!slug || slug === client.slug) return;
    setBusy("switching");

    const response = await fetch("/api/session/client", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });

    if (response.ok) {
      router.refresh();
      return;
    }

    setBusy("");
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
                  {membership.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <strong>{client.name}</strong>
        )}
        <small>{user.username || user.name}</small>
      </div>
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
