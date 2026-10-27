"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./client-access.module.css";

export default function ClientDocumentsPanel({ clientId, canContribute }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/client-library", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Documents could not be loaded.");
    setItems(data.items || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => reload())
      .catch(failure => { if (active) { setError(failure.message); setLoading(false); } });
    return () => { active = false; };
  }, [clientId, reload]);

  async function addLink(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/client-library", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The reference could not be added.");
      form.reset(); await reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!window.confirm(`Remove "${item.title}" from this client library?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/client-library", { method: "DELETE",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The reference could not be removed.");
      await reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel} id="client-documents">
    <h2>Documents</h2><p>References approved for this client workspace.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {loading ? <p>Loading documents...</p> : items.length ? <ul className={styles.documents}>
      {items.map(item => <li key={item.id}>
        <div><strong>{item.title}</strong><small>{item.description || item.filename || item.url}</small></div>
        <div className={styles.actions}>
          <a href={item.type === "file" ? item.downloadUrl : item.url}
            {...(item.type === "file" ? {} : { target: "_blank", rel: "noreferrer" })}>
            {item.type === "file" ? "Download" : "Open"}</a>
          {item.canRemove ? <button type="button" disabled={busy} onClick={() => remove(item)}>Remove</button> : null}
        </div>
      </li>)}
    </ul> : <p>No documents have been added yet.</p>}
    {canContribute ? <form className={styles.form} onSubmit={addLink}>
      <h3>Add a reference link</h3>
      <div className={styles.fields}>
        <label>Title<input name="title" required maxLength={180} /></label>
        <label>HTTPS URL<input name="url" type="url" required maxLength={1000} /></label>
      </div>
      <label>Description<textarea name="description" maxLength={4000} rows={2} /></label>
      <button type="submit" disabled={busy}>{busy ? "Saving..." : "Add reference"}</button>
    </form> : null}
  </section>;
}
