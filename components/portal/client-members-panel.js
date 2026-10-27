"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./client-access.module.css";

const roleNames = { client_viewer: "Viewer", member: "Member", client_admin: "Client Administrator",
  aoc_admin: "Legacy member" };

async function clientRequest(method, body) {
  const response = await fetch("/api/client/members", { method,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Client access could not be updated.");
  return data;
}

export default function ClientMembersPanel({ clientId, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/client/members", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Members could not be loaded.");
    setMembers(data.members || []);
  }, []);

  async function loadAudit(before = "", append = false) {
    const response = await fetch(`/api/client/members?view=audit${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Access history could not be loaded.");
    setEvents(current => append ? [...current, ...(data.events || [])] : data.events || []);
    setNextCursor(data.nextCursor || null);
  }

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => Promise.all([reload(), loadAudit()]))
      .catch(failure => { if (mounted) setError(failure.message); });
    return () => { mounted = false; };
  }, [clientId, reload]);

  async function createMember(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy("create"); setError(""); setNotice("");
    try {
      const data = await clientRequest("POST", Object.fromEntries(fields));
      form.reset();
      await Promise.all([reload(), loadAudit()]);
      setNotice(`${data.member.name}'s login was created. Share the temporary password securely and ask them to change it under Account security.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(""); }
  }

  async function changeMember(member, action, role) {
    if (busy) return;
    const description = action === "role_change" ? `change ${member.name} to ${roleNames[role]}`
      : `${action === "deactivate" ? "deactivate" : "reactivate"} ${member.name}`;
    if (!window.confirm(`Do you want to ${description} for this client?`)) return;
    setBusy(member.id); setError(""); setNotice("");
    try {
      await clientRequest("PATCH", { id: member.id, action, ...(role ? { role } : {}) });
      await Promise.all([reload(), loadAudit()]);
      setNotice(`Client access updated for ${member.name}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(""); }
  }

  return <section className={styles.panel} id="client-members">
    <h2>Members &amp; Access</h2>
    <p>Manage Viewer and Member accounts for this client only. AOC controls Client Administrator grants.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.success} role="status">{notice}</p> : null}
    <form className={styles.form} onSubmit={createMember}>
      <h3>Create a client login</h3>
      <p>Use a unique username and a temporary password. Existing portal logins cannot be linked here yet.</p>
      <div className={styles.fields}>
        <label>Name<input name="name" required maxLength={120} autoComplete="off" /></label>
        <label>Username<input name="username" required minLength={3} maxLength={50}
          pattern="[a-z0-9][a-z0-9._-]{2,49}" autoCapitalize="none" autoComplete="off" /></label>
        <label>Temporary password<input name="password" type="password" required minLength={12}
          maxLength={128} autoComplete="new-password" /></label>
        <label>Role<select name="role" defaultValue="member">
          <option value="member">Member</option><option value="client_viewer">Viewer</option>
        </select></label>
      </div>
      <button disabled={Boolean(busy)} type="submit">{busy === "create" ? "Creating..." : "Create login"}</button>
    </form>
    <div className={styles.list}>
      <h3>Client members</h3>
      {members.length ? members.map(member => <div className={styles.member} key={member.id}>
        <div><strong>{member.name}</strong><small>@{member.username} · {member.active ? "Active" : "Inactive"}</small></div>
        {member.id === currentUserId || !["member", "client_viewer"].includes(member.role)
          ? <span>{roleNames[member.role] || "Protected role"}</span>
          : <div className={styles.actions}>
            <select aria-label={`Role for ${member.name}`} disabled={Boolean(busy) || !member.active}
              value={member.role} onChange={event => changeMember(member, "role_change", event.target.value)}>
              <option value="member">Member</option><option value="client_viewer">Viewer</option>
            </select>
            <button type="button" disabled={Boolean(busy)}
              onClick={() => changeMember(member, member.active ? "deactivate" : "reactivate")}>
              {member.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>}
      </div>) : <p>No members found.</p>}
    </div>
    <div className={styles.list} id="client-access-audit">
      <h3>Access history</h3>
      {events.length ? events.map(event => <p className={styles.auditItem} key={event.id}>
        <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
        <span>{event.actorName} · {event.action.replaceAll("_", " ")} · {event.targetName}
          {event.previousRole !== event.nextRole && event.nextRole ? ` → ${roleNames[event.nextRole] || event.nextRole}` : ""}</span>
      </p>) : <p>No access changes recorded yet.</p>}
      {nextCursor ? <button type="button" disabled={Boolean(busy)} onClick={async () => {
        setBusy("audit"); setError("");
        try { await loadAudit(nextCursor, true); } catch (failure) { setError(failure.message); }
        finally { setBusy(""); }
      }}>Older events</button> : null}
    </div>
  </section>;
}
