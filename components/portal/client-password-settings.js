"use client";

import { useState } from "react";
import { passwordValidationMessage } from "@/lib/input-validation";
import styles from "./client-access.module.css";

export default function ClientPasswordSettings({ username }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = String(fields.get("currentPassword") || "");
    const newPassword = String(fields.get("newPassword") || "");
    const confirmation = String(fields.get("confirmation") || "");
    setMessage("");
    const validation = passwordValidationMessage(newPassword, username);
    if (validation || newPassword !== confirmation) {
      setError(validation || "The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/client/password", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Password update failed.");
      form.reset();
      setMessage("Password updated. Your other sessions were signed out.");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel} id="account-security">
    <h2>Account security</h2>
    <p>Change your password using your current password. If you received a temporary password, change it now.</p>
    <form className={styles.form} onSubmit={changePassword}>
      <label>Current password<input type="password" name="currentPassword" autoComplete="current-password" required maxLength={128} /></label>
      <label>New password<input type="password" name="newPassword" autoComplete="new-password" required maxLength={128} /></label>
      <label>Confirm new password<input type="password" name="confirmation" autoComplete="new-password" required maxLength={128} /></label>
      <small>Use 12–128 characters and at least three character types. Do not include your username.</small>
      <button disabled={busy} type="submit">{busy ? "Updating..." : "Update password"}</button>
    </form>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {message ? <p className={styles.success} role="status">{message}</p> : null}
  </section>;
}
