"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";

import aocIcon from "@/aoc-icon.png";
import aocLogo from "@/aoc-logo.png";
import SignOutButton from "@/components/auth/sign-out-button";
import AdminAssistant from "@/components/admin/admin-assistant";
import styles from "./admin-dashboard.module.css";

const ICONS = {
  overview: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  clients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  spark: "M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z",
  shield: "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM8.5 12l2.2 2.2 4.8-5",
  activity: "M3 12h4l2.5-6 4.5 12 2.5-6H21",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 5 5",
  user: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 9a8 8 0 0 1 16 0",
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function number(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function dateLabel(value) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function initials(value) {
  return String(value || "AOC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function settingsFromClient(client) {
  return client
    ? {
        slug: client.slug,
        name: client.name,
        portalEnabled: client.portalEnabled,
        aiEnabled: client.aiEnabled,
        monthlyPromptLimit: client.monthlyPromptLimit,
        assistantInstructions: client.assistantInstructions,
        vectorStoreId: client.vectorStoreId,
        hubstaffProjectUrl: client.hubstaffProjectUrl || "",
      }
    : null;
}

function Metric({ icon, label, value, detail, tone }) {
  return (
    <article className={`${styles.metric} ${styles[tone]}`}>
      <span><Icon name={icon} /></span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

export default function AdminDashboard({ initialData }) {
  const [clients, setClients] = useState(initialData.clients || []);
  const [selectedSlug, setSelectedSlug] = useState(initialData.clients?.[0]?.slug || "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(settingsFromClient(initialData.clients?.[0]));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [createError, setCreateError] = useState("");
  const createDialogRef = useRef(null);

  const selectedClient = clients.find((client) => client.slug === selectedSlug)
    || clients[0]
    || null;
  const filteredClients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) =>
      !needle
      || client.name.toLowerCase().includes(needle)
      || client.slug.toLowerCase().includes(needle));
  }, [clients, query]);
  const summary = useMemo(() => ({
    totalClients: clients.length,
    activeClients: clients.filter((client) => client.portalEnabled).length,
    aiEnabledClients: clients.filter((client) => client.aiEnabled).length,
    requestsUsed: clients.reduce((total, client) => total + client.requestsUsed, 0),
    allowance: clients.reduce((total, client) => total + client.monthlyPromptLimit, 0),
    conversations: clients.reduce((total, client) => total + client.conversationCount, 0),
  }), [clients]);

  function selectClient(client) {
    setSelectedSlug(client.slug);
    setDraft(settingsFromClient(client));
    setStatus("");
    setError("");
  }

  function replaceClient(client) {
    setClients((current) => current
      .map((candidate) => candidate.slug === client.slug ? client : candidate)
      .sort((first, second) => first.name.localeCompare(second.name)));
    setDraft(settingsFromClient(client));
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus("");
    setError("");
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy("save");
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.client) {
        throw new Error(payload?.error || "Client settings could not be saved.");
      }
      replaceClient(payload.client);
      setStatus("Client controls saved successfully.");
    } catch (saveError) {
      setError(saveError.message || "Client settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function resetUsage() {
    if (!selectedClient || busy) return;
    const approved = window.confirm(
      `Reset ${selectedClient.name}'s current monthly AI request usage to zero?`,
    );
    if (!approved) return;
    setBusy("reset");
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/admin/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selectedClient.slug }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.client) {
        throw new Error(payload?.error || "Monthly usage could not be reset.");
      }
      replaceClient(payload.client);
      setStatus("Monthly request usage reset to zero.");
    } catch (resetError) {
      setError(resetError.message || "Monthly usage could not be reset.");
    } finally {
      setBusy("");
    }
  }

  async function createClient(event) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("create");
    setCreateError("");

    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          name: form.get("name"),
          password: form.get("password"),
          monthlyPromptLimit: Number(form.get("monthlyPromptLimit")),
          hubstaffProjectUrl: form.get("hubstaffProjectUrl"),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.client) {
        throw new Error(payload?.error || "The client could not be created.");
      }

      setClients((current) => [...current, payload.client]
        .sort((first, second) => first.name.localeCompare(second.name)));
      setSelectedSlug(payload.client.slug);
      setDraft(settingsFromClient(payload.client));
      setStatus(`${payload.client.name} was created and can sign in now.`);
      formElement.reset();
      createDialogRef.current?.close();
    } catch (creationError) {
      setCreateError(creationError.message || "The client could not be created.");
    } finally {
      setBusy("");
    }
  }

  const usagePercent = selectedClient
    ? Math.min(100, (selectedClient.requestsUsed / selectedClient.monthlyPromptLimit) * 100)
    : 0;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image src={aocLogo} alt="Always Open Commerce" priority />
          <span>Administrator Portal</span>
        </div>

        <nav aria-label="Administrator portal">
          <a className={styles.activeNav} href="#overview"><Icon name="overview" />Overview</a>
          <a href="#clients"><Icon name="clients" />Client controls</a>
          <a href="#assistant"><Icon name="spark" />AI assistant</a>
          <a href="#ai-controls"><Icon name="activity" />AI allowances</a>
          <a href="#security"><Icon name="shield" />Access & security</a>
        </nav>

        <div className={styles.sidebarStatus}>
          <span><i /> Production controls</span>
          <p>Changes apply immediately to the connected Neon database.</p>
        </div>

        <div className={styles.adminIdentity}>
          <span>{initials(initialData.admin.name)}</span>
          <div>
            <strong>{initialData.admin.name}</strong>
            <small>{initialData.admin.username || initialData.admin.role}</small>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p>AOC operations</p>
            <h1>Client AI control center</h1>
            <span>Manage access, monthly AI allowances, and client knowledge.</span>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.secureBadge}><Icon name="shield" />Admin protected</span>
            <SignOutButton className={styles.signOut} />
          </div>
        </header>

        <main className={styles.content} id="overview">
          <section className={styles.metrics} aria-label="Administrator overview">
            <Metric
              icon="clients"
              label="Client accounts"
              value={number(summary.totalClients)}
              detail={`${summary.activeClients} portal enabled`}
              tone="blue"
            />
            <Metric
              icon="spark"
              label="AI-enabled clients"
              value={number(summary.aiEnabledClients)}
              detail={`${summary.totalClients - summary.aiEnabledClients} paused`}
              tone="cyan"
            />
            <Metric
              icon="activity"
              label="Requests this month"
              value={number(summary.requestsUsed)}
              detail={`${number(summary.allowance)} combined allowance`}
              tone="violet"
            />
            <Metric
              icon="overview"
              label="Saved conversations"
              value={number(summary.conversations)}
              detail="Across private client workspaces"
              tone="green"
            />
          </section>

          <AdminAssistant clients={clients} />

          <section className={styles.workspace} id="clients">
            <aside className={styles.clientDirectory}>
              <div className={styles.directoryHeading}>
                <div>
                  <p>Accounts</p>
                  <h2>Clients</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreateError("");
                    createDialogRef.current?.showModal();
                  }}
                >
                  <Icon name="plus" /> Add client
                </button>
              </div>

              <label className={styles.clientSearch}>
                <Icon name="search" />
                <span className="sr-only">Search clients</span>
                <input
                  type="search"
                  placeholder="Search clients..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              <div className={styles.clientList}>
                {filteredClients.map((client) => {
                  const percent = Math.min(
                    100,
                    (client.requestsUsed / client.monthlyPromptLimit) * 100,
                  );
                  return (
                    <button
                      className={client.slug === selectedClient?.slug ? styles.selectedClient : ""}
                      key={client.slug}
                      type="button"
                      onClick={() => selectClient(client)}
                    >
                      <span className={styles.clientAvatar}>{initials(client.name)}</span>
                      <span className={styles.clientCopy}>
                        <strong>{client.name}</strong>
                        <small>@{client.slug}</small>
                        <i><b style={{ width: `${percent}%` }} /></i>
                      </span>
                      <span className={client.aiEnabled ? styles.live : styles.paused}>
                        {client.aiEnabled ? "Live" : "Paused"}
                      </span>
                    </button>
                  );
                })}
                {!filteredClients.length ? (
                  <p className={styles.emptyList}>No matching clients.</p>
                ) : null}
              </div>
            </aside>

            <section className={styles.controlPanel}>
              {selectedClient && draft ? (
                <form onSubmit={saveSettings}>
                  <header className={styles.clientHeader}>
                    <div className={styles.clientTitle}>
                      <span>{initials(selectedClient.name)}</span>
                      <div>
                        <p>Client workspace</p>
                        <h2>{selectedClient.name}</h2>
                        <small>@{selectedClient.slug} · Added {dateLabel(selectedClient.createdAt)}</small>
                      </div>
                    </div>
                    <div className={styles.headerActions}>
                      <span className={draft.portalEnabled ? styles.enabled : styles.disabled}>
                        <i /> {draft.portalEnabled ? "Portal active" : "Portal disabled"}
                      </span>
                      <button disabled={Boolean(busy)} type="submit">
                        {busy === "save" ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </header>

                  {status ? <p className={styles.success} role="status">{status}</p> : null}
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}

                  <div className={styles.usageHero} id="ai-controls">
                    <div className={styles.usageRing} style={{ "--usage": `${usagePercent * 3.6}deg` }}>
                      <span>
                        <strong>{Math.round(usagePercent)}%</strong>
                        <small>used</small>
                      </span>
                    </div>
                    <div className={styles.usageOverview}>
                      <p>Monthly AI allowance</p>
                      <h3>{number(selectedClient.requestsRemaining)} requests remaining</h3>
                      <span>
                        {number(selectedClient.requestsUsed)} of {number(selectedClient.monthlyPromptLimit)} used
                        · resets {dateLabel(selectedClient.resetsAt)}
                      </span>
                      <div><i style={{ width: `${usagePercent}%` }} /></div>
                    </div>
                    <dl className={styles.tokenSummary}>
                      <div><dt>Total tokens</dt><dd>{number(selectedClient.totalTokens)}</dd></div>
                      <div><dt>Input</dt><dd>{number(selectedClient.inputTokens)}</dd></div>
                      <div><dt>Output</dt><dd>{number(selectedClient.outputTokens)}</dd></div>
                    </dl>
                  </div>

                  <div className={styles.settingsGrid}>
                    <section className={styles.settingsCard}>
                      <header>
                        <span><Icon name="spark" /></span>
                        <div><h3>AI request controls</h3><p>Limits are enforced by the server.</p></div>
                      </header>
                      <div className={styles.fieldGrid}>
                        <label>
                          <span>Monthly request limit</span>
                          <input
                            type="number"
                            min="1"
                            max="100000"
                            value={draft.monthlyPromptLimit}
                            onChange={(event) => updateDraft("monthlyPromptLimit", Number(event.target.value))}
                          />
                          <small>Total OpenAI requests allowed each UTC month.</small>
                        </label>
                      </div>
                      <button
                        className={styles.resetButton}
                        disabled={Boolean(busy) || selectedClient.requestsUsed === 0}
                        onClick={resetUsage}
                        type="button"
                      >
                        {busy === "reset" ? "Resetting..." : "Reset current monthly usage"}
                      </button>
                    </section>

                    <section className={styles.settingsCard} id="security">
                      <header>
                        <span><Icon name="shield" /></span>
                        <div><h3>Access & availability</h3><p>Pause access without deleting data.</p></div>
                      </header>
                      <label className={styles.toggleRow}>
                        <span><strong>Client portal</strong><small>Allow this client to sign in and load its workspace.</small></span>
                        <input
                          type="checkbox"
                          checked={draft.portalEnabled}
                          onChange={(event) => updateDraft("portalEnabled", event.target.checked)}
                        />
                        <i />
                      </label>
                      <label className={styles.toggleRow}>
                        <span><strong>AI assistant</strong><small>Allow new OpenAI requests for this client.</small></span>
                        <input
                          type="checkbox"
                          checked={draft.aiEnabled}
                          onChange={(event) => updateDraft("aiEnabled", event.target.checked)}
                        />
                        <i />
                      </label>
                      <label className={styles.nameField}>
                        <span>Client display name</span>
                        <input
                          maxLength="120"
                          value={draft.name}
                          onChange={(event) => updateDraft("name", event.target.value)}
                        />
                      </label>
                    </section>

                    <section className={`${styles.settingsCard} ${styles.wideCard}`}>
                      <header>
                        <span><Icon name="overview" /></span>
                        <div><h3>Client knowledge & instructions</h3><p>Private configuration supplied only to this client&apos;s assistant.</p></div>
                      </header>
                      <label className={styles.instructionsField}>
                        <span>Assistant instructions</span>
                        <textarea
                          maxLength="12000"
                          rows="6"
                          placeholder="Example: Answer using ChurchBanners terminology and approved project details..."
                          value={draft.assistantInstructions}
                          onChange={(event) => updateDraft("assistantInstructions", event.target.value)}
                        />
                        <small>{number(draft.assistantInstructions.length)} / 12,000 characters</small>
                      </label>
                      <label className={styles.vectorField}>
                        <span>OpenAI vector store ID</span>
                        <input
                          placeholder="vs_..."
                          value={draft.vectorStoreId}
                          onChange={(event) => updateDraft("vectorStoreId", event.target.value)}
                        />
                        <small>Optional approved file-search knowledge base for this client only.</small>
                      </label>
                      <label className={styles.vectorField}>
                        <span>Hubstaff project URL</span>
                        <input
                          type="url"
                          placeholder="https://tasks.hubstaff.com/app/organizations/14952/projects/803599"
                          value={draft.hubstaffProjectUrl}
                          onChange={(event) => updateDraft("hubstaffProjectUrl", event.target.value)}
                        />
                        <small>Optional. Only this client&apos;s project is queried for monthly hours and task progress.</small>
                      </label>
                    </section>

                    <section className={`${styles.settingsCard} ${styles.wideCard}`}>
                      <header>
                        <span><Icon name="user" /></span>
                        <div><h3>Workspace overview</h3><p>Read-only operational details for this account.</p></div>
                      </header>
                      <div className={styles.accountStats}>
                        <div><strong>{number(selectedClient.memberCount)}</strong><span>Portal users</span></div>
                        <div><strong>{number(selectedClient.conversationCount)}</strong><span>Saved conversations</span></div>
                        <div><strong>{number(selectedClient.approvedKnowledge)}</strong><span>Approved sources</span></div>
                        <div><strong>{number(selectedClient.pendingKnowledge)}</strong><span>Pending sources</span></div>
                      </div>
                      <div className={styles.memberList}>
                        {selectedClient.members.map((member, index) => (
                          <div key={`${member.username || member.email}-${index}`}>
                            <span>{initials(member.name || member.username)}</span>
                            <p><strong>{member.name || member.username}</strong><small>@{member.username || "portal-user"}</small></p>
                            <b>{String(member.role || "member").replaceAll("_", " ")}</b>
                          </div>
                        ))}
                        {!selectedClient.members.length ? <p>No login is assigned.</p> : null}
                      </div>
                      <p className={styles.lastActivity}>Last workspace activity: {dateLabel(selectedClient.lastActivityAt)}</p>
                    </section>
                  </div>
                </form>
              ) : (
                <div className={styles.noClient}>
                  <Image src={aocIcon} alt="" />
                  <h2>Create your first client account</h2>
                  <p>The administrator portal is ready, but there are no client records yet.</p>
                  <button type="button" onClick={() => createDialogRef.current?.showModal()}>
                    Add client
                  </button>
                </div>
              )}
            </section>
          </section>
        </main>
      </div>

      <dialog className={styles.createDialog} ref={createDialogRef}>
        <form onSubmit={createClient}>
          <header>
            <div><p>Private provisioning</p><h2>Create a client account</h2></div>
            <button type="button" aria-label="Close" onClick={() => createDialogRef.current?.close()}>×</button>
          </header>
          <p className={styles.dialogIntro}>
            This creates one client workspace, one login, and one client-admin membership.
            The password is hashed by Better Auth and is never stored in portal tables.
          </p>
          <div className={styles.dialogGrid}>
            <label><span>Client name</span><input name="name" maxLength="120" required placeholder="ChurchBanners" /></label>
            <label><span>Username</span><input name="username" minLength="3" maxLength="50" required pattern="[a-z0-9][a-z0-9._-]{2,49}" placeholder="churchbanners" /></label>
            <label className={styles.dialogWide}><span>Temporary password</span><input name="password" type="password" minLength="12" maxLength="128" required autoComplete="new-password" placeholder="At least 12 characters" /></label>
            <label className={styles.dialogWide}><span>Monthly requests</span><input name="monthlyPromptLimit" type="number" min="1" max="100000" defaultValue="150" required /></label>
            <label className={styles.dialogWide}>
              <span>Hubstaff project URL</span>
              <input
                name="hubstaffProjectUrl"
                type="url"
                placeholder="https://tasks.hubstaff.com/app/organizations/14952/projects/803599"
              />
            </label>
          </div>
          {createError ? <p className={styles.dialogError} role="alert">{createError}</p> : null}
          <footer>
            <button type="button" onClick={() => createDialogRef.current?.close()}>Cancel</button>
            <button disabled={busy === "create"} type="submit">
              {busy === "create" ? "Creating client..." : "Create client"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
