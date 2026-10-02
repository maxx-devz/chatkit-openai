"use client";

import { useMemo, useRef, useState } from "react";

import {
  EMPLOYEE_PANELS,
  EMPLOYEE_POSITIONS,
  EMPLOYEE_WORKSPACES,
  employeePosition,
} from "@/lib/employee-positions";
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

function settingsFromEmployee(employee) {
  return employee ? {
    id: employee.id,
    name: employee.name,
    position: employee.position,
    panelAccess: [...employee.panelAccess],
    active: employee.active,
    hubstaffUserId: employee.hubstaffUserId,
  } : null;
}

export default function EmployeeControls({ initialEmployees = [], schemaReady = false }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [selectedId, setSelectedId] = useState(initialEmployees[0]?.id || "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(settingsFromEmployee(initialEmployees[0]));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [createError, setCreateError] = useState("");
  const createDialogRef = useRef(null);

  const selectedEmployee = employees.find((employee) => employee.id === selectedId)
    || employees[0]
    || null;
  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees.filter((employee) => !needle
      || employee.name.toLowerCase().includes(needle)
      || employee.username.toLowerCase().includes(needle)
      || employee.positionLabel.toLowerCase().includes(needle));
  }, [employees, query]);

  function selectEmployee(employee) {
    setSelectedId(employee.id);
    setDraft(settingsFromEmployee(employee));
    setStatus("");
    setError("");
  }

  function replaceEmployee(employee) {
    setEmployees((current) => current
      .map((candidate) => candidate.id === employee.id ? employee : candidate)
      .sort((first, second) => first.name.localeCompare(second.name)));
    setDraft(settingsFromEmployee(employee));
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus("");
    setError("");
  }

  function updatePosition(positionId) {
    const position = employeePosition(positionId);
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

  async function saveEmployee(event) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy("save");
    setStatus("");
    setError("");
    try {
      const response = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.employee) {
        throw new Error(payload?.error || "Employee settings could not be saved.");
      }
      replaceEmployee(payload.employee);
      setStatus("Employee controls saved successfully.");
    } catch (saveError) {
      setError(saveError.message || "Employee settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function createEmployee(event) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("create");
    setCreateError("");
    try {
      const response = await fetch("/api/admin/employees", {
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
      if (!response.ok || !payload?.employee) {
        throw new Error(payload?.error || "The employee account could not be created.");
      }
      setEmployees((current) => [...current, payload.employee]
        .sort((first, second) => first.name.localeCompare(second.name)));
      setSelectedId(payload.employee.id);
      setDraft(settingsFromEmployee(payload.employee));
      setStatus(`${payload.employee.name} was created and can sign in now.`);
      formElement.reset();
      createDialogRef.current?.close();
    } catch (creationError) {
      setCreateError(creationError.message || "The employee account could not be created.");
    } finally {
      setBusy("");
    }
  }

  if (!schemaReady) {
    return <section className={`${styles.workspace} ${styles.schemaWorkspace}`} id="employees">
      <div className={styles.noClient}>
        <h2>Employee Controls need a database update</h2>
        <p>Run <code>npm run employee:migrate</code> to add position and panel-access settings. Existing client and employee records are preserved.</p>
      </div>
    </section>;
  }

  return <>
    <section className={styles.workspace} id="employees">
      <aside className={styles.clientDirectory}>
        <div className={styles.directoryHeading}>
          <div><p>Accounts</p><h2>Employees</h2></div>
          <button type="button" onClick={() => { setCreateError(""); createDialogRef.current?.showModal(); }}>
            <Icon name="plus" /> Add employee
          </button>
        </div>
        <label className={styles.clientSearch}>
          <Icon name="search" />
          <span className="sr-only">Search employees</span>
          <input type="search" placeholder="Search employees..." value={query}
            onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className={styles.clientList}>
          {filteredEmployees.map((employee) => <button
            className={employee.id === selectedEmployee?.id ? styles.selectedClient : ""}
            key={employee.id} type="button" onClick={() => selectEmployee(employee)}>
            <span className={styles.clientAvatar}>{initials(employee.name)}</span>
            <span className={styles.clientCopy}><strong>{employee.name}</strong>
              <small>{employee.positionLabel} · @{employee.username || "employee"}</small></span>
            <span className={employee.active ? styles.online : styles.offline}>
              {employee.active ? "Active" : "Paused"}
            </span>
          </button>)}
          {!filteredEmployees.length ? <p className={styles.emptyList}>No matching employees.</p> : null}
        </div>
      </aside>

      <section className={styles.controlPanel}>
        {selectedEmployee && draft ? <form onSubmit={saveEmployee}>
          <header className={styles.clientHeader}>
            <div className={styles.clientTitle}><span>{initials(selectedEmployee.name)}</span><div>
              <p>Employee workspace</p><h2>{selectedEmployee.name}</h2>
              <small>@{selectedEmployee.username || "employee"} · Added {dateLabel(selectedEmployee.createdAt)}</small>
            </div></div>
            <div className={styles.headerActions}>
              <span className={draft.active ? styles.enabled : styles.disabled}><i /> {draft.active ? "Portal active" : "Portal paused"}</span>
              <button disabled={Boolean(busy)} type="submit">{busy === "save" ? "Saving..." : "Save changes"}</button>
            </div>
          </header>
          {status ? <p className={styles.success} role="status">{status}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.employeeSummary}>
            <div><span>Position</span><strong>{employeePosition(draft.position).label}</strong></div>
            <div><span>Visible panels</span><strong>{draft.panelAccess.length}</strong></div>
            <div><span>Hubstaff</span><strong>{selectedEmployee.connected ? "Connected" : "Not connected"}</strong></div>
            <div><span>Last sync</span><strong>{dateLabel(selectedEmployee.lastSyncedAt)}</strong></div>
          </div>

          <div className={styles.settingsGrid}>
            <section className={styles.settingsCard}>
              <header><span><Icon name="user" /></span><div><h3>Position & identity</h3><p>Position presets provide a starting access policy.</p></div></header>
              <div className={styles.fieldGrid}>
                <label><span>Display name</span><input maxLength="120" value={draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)} /></label>
                <label><span>Employee position</span><select value={draft.position}
                  onChange={(event) => updatePosition(event.target.value)}>
                  {EMPLOYEE_POSITIONS.map((positionOption) => <option key={positionOption.id} value={positionOption.id}>{positionOption.label}</option>)}
                </select><small>Changing the position applies that position&apos;s default panel access. You can customize it below.</small></label>
              </div>
            </section>

            <section className={styles.settingsCard}>
              <header><span><Icon name="shield" /></span><div><h3>Access & availability</h3><p>Pause access without deleting the account.</p></div></header>
              <label className={styles.toggleRow}><span><strong>Employee portal</strong>
                <small>Allow this employee to sign in and load assigned panels.</small></span>
                <input type="checkbox" checked={draft.active}
                  onChange={(event) => updateDraft("active", event.target.checked)} /><i /></label>
              <p className={styles.controlHint}>Pausing access clears saved employee Hubstaff credentials and invalidates in-flight synchronization.</p>
            </section>

            <section className={styles.settingsCard}>
              <header><span><Icon name="connection" /></span><div><h3>Hubstaff identity</h3><p>The approved user mapping is never selected by the browser session.</p></div></header>
              <div className={styles.fieldGrid}><label><span>Approved Hubstaff user ID</span>
                <input inputMode="numeric" pattern="[1-9][0-9]*" value={draft.hubstaffUserId}
                  onChange={(event) => updateDraft("hubstaffUserId", event.target.value)} />
                <small>Changing this ID clears the saved connection and requires the employee to reconnect.</small></label></div>
            </section>

            <section className={`${styles.settingsCard} ${styles.wideCard}`}>
              <header><span><Icon name="shield" /></span><div><h3>Employee portal panels</h3><p>Choose exactly which navigation panels this employee can see.</p></div></header>
              <div className={styles.workspaceAccessList}>{EMPLOYEE_WORKSPACES.map((workspaceOption) => <section key={workspaceOption.id} className={styles.workspaceAccessGroup}>
                <div><strong>{workspaceOption.label}</strong><small>{workspaceOption.description}</small></div>
                <div className={styles.panelAccessGrid}>{EMPLOYEE_PANELS.filter((panel) => panel.workspace === workspaceOption.id)
                  .map((panel) => <label key={panel.id} className={styles.panelAccessOption}>
                    <input type="checkbox" checked={draft.panelAccess.includes(panel.id)}
                      onChange={(event) => togglePanel(panel.id, event.target.checked)} />
                    <span><strong>{panel.label}{panel.planned ? " · Planned" : ""}</strong><small>{panel.description}</small></span>
                  </label>)}</div>
              </section>)}</div>
            </section>
          </div>
        </form> : <div className={styles.noClient}>
          <h2>Create your first employee account</h2>
          <p>Provision a separate employee login, approved Hubstaff identity, position, and portal access policy.</p>
          <button type="button" onClick={() => createDialogRef.current?.showModal()}>Add employee</button>
        </div>}
      </section>
    </section>

    <dialog className={styles.createDialog} ref={createDialogRef}>
      <form onSubmit={createEmployee}>
        <header><div><p>Private provisioning</p><h2>Create an employee account</h2></div>
          <button type="button" aria-label="Close" onClick={() => createDialogRef.current?.close()}>×</button></header>
        <p className={styles.dialogIntro}>This creates a separate employee-only login and approved Hubstaff identity mapping. Position defaults can be customized after creation.</p>
        <div className={styles.dialogGrid}>
          <label><span>Employee name</span><input name="name" maxLength="120" required placeholder="Alex Morgan" /></label>
          <label><span>Username</span><input name="username" minLength="3" maxLength="50" required pattern="[a-z0-9][a-z0-9._-]{2,49}" placeholder="alex.morgan" /></label>
          <label className={styles.dialogWide}><span>Temporary password</span><input name="password" type="password" minLength="12" maxLength="128" required autoComplete="new-password" placeholder="At least 12 characters" /></label>
          <label><span>Employee position</span><select name="position" defaultValue="team_member">
            {EMPLOYEE_POSITIONS.map((positionOption) => <option key={positionOption.id} value={positionOption.id}>{positionOption.label}</option>)}
          </select></label>
          <label><span>Approved Hubstaff user ID</span><input name="hubstaffUserId" inputMode="numeric" pattern="[1-9][0-9]*" required placeholder="123456" /></label>
        </div>
        {createError ? <p className={styles.dialogError} role="alert">{createError}</p> : null}
        <footer><button type="button" onClick={() => createDialogRef.current?.close()}>Cancel</button>
          <button disabled={busy === "create"} type="submit">{busy === "create" ? "Creating employee..." : "Create employee"}</button></footer>
      </form>
    </dialog>
  </>;
}
