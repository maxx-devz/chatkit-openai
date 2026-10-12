"use client";

import { useMemo, useRef, useState } from "react";

import {
  INTERNAL_USER_PANELS,
  INTERNAL_USER_POSITIONS,
  INTERNAL_USER_WORKSPACES,
  internalUserPosition,
} from "@/lib/internal-user-positions";
import styles from "./admin-dashboard.module.css";

const ICONS = {
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 5 5",
  user: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 9a8 8 0 0 1 16 0",
  shield: "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM8.5 12l2.2 2.2 4.8-5",
  connection: "M9 15l6-6M7.5 12.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 11.5l2-2a3.5 3.5 0 0 0-5-5l-2 2",
};

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

function initials(value) {
  return String(value || "AOC").split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]).join("").toUpperCase();
}

function dateLabel(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function settingsFromInternalUser(internalUser) {
  return internalUser ? {
    id: internalUser.id,
    name: internalUser.name,
    position: internalUser.position,
    panelAccess: [...internalUser.panelAccess],
    active: internalUser.active,
    hubstaffUserId: internalUser.hubstaffUserId,
  } : null;
}

export default function InternalUserControls({ initialInternalUsers = [], schemaReady = false }) {
  const [internalUsers, setInternalUsers] = useState(initialInternalUsers);
  const [selectedId, setSelectedId] = useState(initialInternalUsers[0]?.id || "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(settingsFromInternalUser(initialInternalUsers[0]));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [createError, setCreateError] = useState("");
  const createDialogRef = useRef(null);

  const selectedInternalUser = internalUsers.find((internalUser) => internalUser.id === selectedId)
    || internalUsers[0]
    || null;
  const filteredInternalUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return internalUsers.filter((internalUser) => !needle
      || internalUser.name.toLowerCase().includes(needle)
      || internalUser.username.toLowerCase().includes(needle)
      || internalUser.positionLabel.toLowerCase().includes(needle));
  }, [internalUsers, query]);

  function selectInternalUser(internalUser) {
    setSelectedId(internalUser.id);
    setDraft(settingsFromInternalUser(internalUser));
    setStatus("");
    setError("");
  }

  function replaceInternalUser(internalUser) {
    setInternalUsers((current) => current
      .map((candidate) => candidate.id === internalUser.id ? internalUser : candidate)
      .sort((first, second) => first.name.localeCompare(second.name)));
    setDraft(settingsFromInternalUser(internalUser));
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus("");
    setError("");
  }

  function updatePosition(positionId) {
    const position = internalUserPosition(positionId);
    setDraft((current) => ({
      ...current,
      position: position.id,
      panelAccess: [...position.panels],
    }));
    setStatus("");
    setError("");
  }

  function togglePanel(panelId, checked) {
    setDraft((current) => ({
      ...current,
      panelAccess: checked
        ? [...new Set([...current.panelAccess, panelId])]
        : current.panelAccess.filter((panel) => panel !== panelId),
    }));
    setStatus("");
    setError("");
  }

  async function saveInternalUser(event) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy("save");
    setStatus("");
    setError("");
    try {
      const response = await fetch("/api/admin/internal-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.internalUser) {
        throw new Error(payload?.error || "Internal user settings could not be saved.");
      }
      replaceInternalUser(payload.internalUser);
      setStatus("Internal user controls saved successfully.");
    } catch (saveError) {
      setError(saveError.message || "Internal user settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function createInternalUser(event) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("create");
    setCreateError("");
    try {
      const response = await fetch("/api/admin/internal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          username: form.get("username"),
          password: form.get("password"),
          hubstaffUserId: form.get("hubstaffUserId"),
          position: form.get("position"),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.internalUser) {
        throw new Error(payload?.error || "The internal user account could not be created.");
      }
      setInternalUsers((current) => [...current, payload.internalUser]
        .sort((first, second) => first.name.localeCompare(second.name)));
      setSelectedId(payload.internalUser.id);
      setDraft(settingsFromInternalUser(payload.internalUser));
      setStatus(`${payload.internalUser.name} was created and can sign in now.`);
      formElement.reset();
      createDialogRef.current?.close();
    } catch (creationError) {
      setCreateError(creationError.message || "The internal user account could not be created.");
    } finally {
      setBusy("");
    }
  }

  if (!schemaReady) {
    return <section className={`${styles.workspace} ${styles.schemaWorkspace}`} id="internalUsers">
      <div className={styles.noClient}>
        <h2>Internal User Controls need a database update</h2>
        <p>Run <code>npm run internal-user:migrate</code> to add position and panel-access settings. Existing client and internal user records are preserved.</p>
      </div>
    </section>;
  }

  return <>
    <section className={styles.workspace} id="internalUsers">
      <aside className={styles.clientDirectory}>
        <div className={styles.directoryHeading}>
          <div><p>Accounts</p><h2>Internal users</h2></div>
          <button type="button" onClick={() => { setCreateError(""); createDialogRef.current?.showModal(); }}>
            <Icon name="plus" /> Add internal user
          </button>
        </div>
        <label className={styles.clientSearch}>
          <Icon name="search" />
          <span className="sr-only">Search internal users</span>
          <input type="search" placeholder="Search internal users..." value={query}
            onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className={styles.clientList}>
          {filteredInternalUsers.map((internalUser) => <button
            className={internalUser.id === selectedInternalUser?.id ? styles.selectedClient : ""}
            key={internalUser.id} type="button" onClick={() => selectInternalUser(internalUser)}>
            <span className={styles.clientAvatar}>{initials(internalUser.name)}</span>
            <span className={styles.clientCopy}><strong>{internalUser.name}</strong>
              <small>{internalUser.positionLabel} · @{internalUser.username || "internal-user"}</small></span>
            <span className={internalUser.active ? styles.online : styles.offline}>
              {internalUser.active ? "Active" : "Paused"}
            </span>
          </button>)}
          {!filteredInternalUsers.length ? <p className={styles.emptyList}>No matching internal users.</p> : null}
        </div>
      </aside>

      <section className={styles.controlPanel}>
        {selectedInternalUser && draft ? <form onSubmit={saveInternalUser}>
          <header className={styles.clientHeader}>
            <div className={styles.clientTitle}><span>{initials(selectedInternalUser.name)}</span><div>
              <p>Internal workspace</p><h2>{selectedInternalUser.name}</h2>
              <small>@{selectedInternalUser.username || "internal-user"} · Added {dateLabel(selectedInternalUser.createdAt)}</small>
            </div></div>
            <div className={styles.headerActions}>
              <span className={draft.active ? styles.enabled : styles.disabled}><i /> {draft.active ? "Portal active" : "Portal paused"}</span>
              <button disabled={Boolean(busy)} type="submit">{busy === "save" ? "Saving..." : "Save changes"}</button>
            </div>
          </header>
          {status ? <p className={styles.success} role="status">{status}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.internalUserSummary}>
            <div><span>Position</span><strong>{internalUserPosition(draft.position).label}</strong></div>
            <div><span>Visible panels</span><strong>{draft.panelAccess.length}</strong></div>
            <div><span>Hubstaff</span><strong>{selectedInternalUser.connected ? "Connected" : "Not connected"}</strong></div>
            <div><span>Last sync</span><strong>{dateLabel(selectedInternalUser.lastSyncedAt)}</strong></div>
          </div>

          <div className={styles.settingsGrid}>
            <section className={styles.settingsCard}>
              <header><span><Icon name="user" /></span><div><h3>Position & identity</h3><p>Position presets provide a starting access policy.</p></div></header>
              <div className={styles.fieldGrid}>
                <label><span>Display name</span><input maxLength="120" value={draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)} /></label>
                <label><span>Internal user position</span><select value={draft.position}
                  onChange={(event) => updatePosition(event.target.value)}>
                  {INTERNAL_USER_POSITIONS.map((positionOption) => <option key={positionOption.id} value={positionOption.id}>{positionOption.label}</option>)}
                </select><small>Changing the position applies that position&apos;s default panel access. You can customize it below.</small></label>
              </div>
            </section>

            <section className={styles.settingsCard}>
              <header><span><Icon name="shield" /></span><div><h3>Access & availability</h3><p>Pause access without deleting the account.</p></div></header>
              <label className={styles.toggleRow}><span><strong>Internal portal</strong>
                <small>Allow this internal user to sign in and load assigned panels.</small></span>
                <input type="checkbox" checked={draft.active}
                  onChange={(event) => updateDraft("active", event.target.checked)} /><i /></label>
              <p className={styles.controlHint}>Pausing access clears saved internal user Hubstaff credentials and invalidates in-flight synchronization.</p>
            </section>

            <section className={styles.settingsCard}>
              <header><span><Icon name="connection" /></span><div><h3>Hubstaff identity</h3><p>The approved user mapping is never selected by the browser session.</p></div></header>
              <div className={styles.fieldGrid}><label><span>Approved Hubstaff user ID</span>
                <input inputMode="numeric" pattern="[1-9][0-9]*" value={draft.hubstaffUserId}
                  onChange={(event) => updateDraft("hubstaffUserId", event.target.value)} />
                <small>Changing this ID clears the saved connection and requires the internal user to reconnect.</small></label></div>
            </section>

            <section className={`${styles.settingsCard} ${styles.wideCard}`}>
              <header><span><Icon name="shield" /></span><div><h3>Internal portal panels</h3><p>Choose exactly which navigation panels this internal user can see.</p></div></header>
              <div className={styles.workspaceAccessList}>{INTERNAL_USER_WORKSPACES.map((workspaceOption) => <section key={workspaceOption.id} className={styles.workspaceAccessGroup}>
                <div><strong>{workspaceOption.label}</strong><small>{workspaceOption.description}</small></div>
                <div className={styles.panelAccessGrid}>{INTERNAL_USER_PANELS.filter((panel) => panel.workspace === workspaceOption.id)
                  .map((panel) => <label key={panel.id} className={styles.panelAccessOption}>
                    <input type="checkbox" checked={draft.panelAccess.includes(panel.id)}
                      onChange={(event) => togglePanel(panel.id, event.target.checked)} />
                    <span><strong>{panel.label}{panel.planned ? " · Planned" : ""}</strong><small>{panel.description}</small></span>
                  </label>)}</div>
              </section>)}</div>
            </section>
          </div>
        </form> : <div className={styles.noClient}>
          <h2>Create your first internal user account</h2>
          <p>Provision a separate internal user login, approved Hubstaff identity, position, and portal access policy.</p>
          <button type="button" onClick={() => createDialogRef.current?.showModal()}>Add internal user</button>
        </div>}
      </section>
    </section>

    <dialog className={styles.createDialog} ref={createDialogRef}>
      <form onSubmit={createInternalUser}>
        <header><div><p>Private provisioning</p><h2>Create an internal user account</h2></div>
          <button type="button" aria-label="Close" onClick={() => createDialogRef.current?.close()}>×</button></header>
        <p className={styles.dialogIntro}>This creates a separate internal-user-only login and approved Hubstaff identity mapping. Position defaults can be customized after creation.</p>
        <div className={styles.dialogGrid}>
          <label><span>Internal user name</span><input name="name" maxLength="120" required placeholder="Alex Morgan" /></label>
          <label><span>Username</span><input name="username" minLength="3" maxLength="50" required pattern="[a-z0-9][a-z0-9._-]{2,49}" placeholder="alex.morgan" /></label>
          <label className={styles.dialogWide}><span>Temporary password</span><input name="password" type="password" minLength="12" maxLength="128" required autoComplete="new-password" placeholder="At least 12 characters" /></label>
          <label><span>Internal user position</span><select name="position" defaultValue="team_member">
            {INTERNAL_USER_POSITIONS.map((positionOption) => <option key={positionOption.id} value={positionOption.id}>{positionOption.label}</option>)}
          </select></label>
          <label><span>Approved Hubstaff user ID</span><input name="hubstaffUserId" inputMode="numeric" pattern="[1-9][0-9]*" required placeholder="123456" /></label>
        </div>
        {createError ? <p className={styles.dialogError} role="alert">{createError}</p> : null}
        <footer><button type="button" onClick={() => createDialogRef.current?.close()}>Cancel</button>
          <button disabled={busy === "create"} type="submit">{busy === "create" ? "Creating internal user..." : "Create internal user"}</button></footer>
      </form>
    </dialog>
  </>;
}
