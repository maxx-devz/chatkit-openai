"use client";

import ActionCue from "@/components/portal-ui/action-cue";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import aocIcon from "@/aoc-icon.png";
import Link from "@/components/portal-ui/navigation-link";
import dynamic from "next/dynamic";
import WorkspaceLoading from "@/components/portal-ui/workspace-loading";
import {useRouter,useSearchParams} from "next/navigation";
import AdminShell from "./admin-shell";
import {useAdminDraft} from "./admin-draft-provider";
import {ADMIN_VIEWS,ADMIN_CLIENT_TABS,adminView,adminClientTab,legacyAdminHash} from "@/lib/admin-navigation";
import AdminClientPlan from "@/components/credits/admin-client-plan";
import styles from "./admin-dashboard.module.css";

const loading=()=> <WorkspaceLoading label="Opening this module" compact/>;
const AdminClientWebsites=dynamic(()=>import("./admin-client-websites"),{loading});
const AdminAssistant=dynamic(()=>import("./admin-assistant"),{loading});
const PortalUsage=dynamic(()=>import("./portal-usage"),{loading});
const ProviderSettings=dynamic(()=>import("./provider-settings"),{loading});
const ClientHubstaffIndex=dynamic(()=>import("./client-hubstaff-index"),{loading});

const ICONS = {
  documents: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  credits: "M3 5h18v14H3zM3 9h18M7 14h3M15 14h2",
  sources: "M10 13a5 5 0 0 0 7 .4l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.4l-3 3a5 5 0 0 0 7 7l2-2",
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
  return value==null?"Not available":new Intl.NumberFormat().format(Number(value));
}

function dateLabel(value) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function presenceTitle(client) {
  if (client.isOnline) return "A client user is active in the portal now";
  if (!client.lastSeenAt) return "No recent portal activity";
  const date = new Date(client.lastSeenAt);
  if (Number.isNaN(date.getTime())) return "No recent portal activity";
  return `Last seen ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
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
        vectorStoreId: client.vectorStoreId,
        approvedWebsiteUrl: client.approvedWebsiteUrl || "",
        hubstaffProjectUrl: client.hubstaffProjectUrl || "",
        hubstaffMonthlyHoursLimit: client.hubstaffMonthlyHoursLimit ?? "",
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

export default function AdminDashboard({ initialData,view="overview" }) {
  const router=useRouter(),params=useSearchParams();
  const activeView=adminView(params.get("view") || view),tab=adminClientTab(params.get("tab"));
  const [clients, setClients] = useState(initialData.clients || []);
  const selectedSlug=params.get("client") || clients[0]?.slug || "";
  const setSelectedSlug=slug=>router.push("/admin?"+new URLSearchParams({view:"clients",client:slug,tab}));
  const [query, setQuery] = useState("");

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [feedbackSlug,setFeedbackSlug]=useState("");
  const [busy, setBusy] = useState("");
  const [createError, setCreateError] = useState("");
  const [makeConnection, setMakeConnection] = useState({
    state: "idle",
    message: "Not tested in this session.",
  });
  const createDialogRef = useRef(null);

  useEffect(() => {
    if (!["overview", "clients"].includes(activeView)) return;
    let active = true;
    let requestInFlight = false;

    async function refreshPresence() {
      if (!active || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/admin/presence", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.clients) || !active) return;
        const presenceBySlug = new Map(payload.clients.map((client) => [client.slug, client]));
        setClients((current) => current.map((client) => {
          const presence = presenceBySlug.get(client.slug);
          return presence ? { ...client, ...presence } : client;
        }));
      } catch {
        // Presence is informational; keep the last known state during a transient failure.
      } finally {
        requestInFlight = false;
      }
    }

    const refresh = () => { void refreshPresence(); };
    refresh();
    const intervalId = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [activeView]);

  const selectedClient = clients.find((client) => client.slug === selectedSlug)
    || null;
  const {value:draft,update:setDraft,clear:clearDraft,clearIfUnchanged,dirty}=useAdminDraft((initialData.admin.id || initialData.admin.username)+":client:"+selectedSlug,settingsFromClient(selectedClient));
  useEffect(()=>{const legacy=()=>{const target=legacyAdminHash(window.location.hash);if(target)router.replace("/admin?"+new URLSearchParams(target));};
    legacy();window.addEventListener("hashchange",legacy);return()=>window.removeEventListener("hashchange",legacy);},[router]);
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
    conversations: clients.reduce((total, client) => total + client.conversationCount, 0),
  }), [clients]);

  function selectClient(client) {
    setSelectedSlug(client.slug);
    setStatus("");
    setError("");
  }

  function replaceClient(client) {
    setClients((current) => current
      .map((candidate) => candidate.slug === client.slug ? client : candidate)
      .sort((first, second) => first.name.localeCompare(second.name)));
    clearIfUnchanged(draft);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus("");
    setError("");
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!draft || busy) return;
    setFeedbackSlug(draft.slug);
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

  async function testMakeConnection() {
    if (busy || !window.confirm("Send a real test event to the configured portal-wide Make scenario? This is separate from Save Client.")) return;
    setBusy("make-test");
    setMakeConnection({ state: "testing", message: "Contacting Make..." });

    try {
      const response = await fetch("/api/admin/make/test", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.connected !== true) {
        throw new Error(payload?.error || "The Make connection test failed.");
      }
      setMakeConnection({
        state: "success",
        message: payload.message || "Make accepted the connection test.",
        requestId: payload.requestId,
        sentAt: payload.sentAt,
      });
    } catch (connectionError) {
      setMakeConnection({
        state: "error",
        message: connectionError.message || "The Make connection test failed.",
      });
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
          approvedWebsiteUrl: form.get("approvedWebsiteUrl"),
          hubstaffProjectUrl: form.get("hubstaffProjectUrl"),
          hubstaffMonthlyHoursLimit: form.get("hubstaffMonthlyHoursLimit"),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.client) {
        throw new Error(payload?.error || "The client could not be created.");
      }

      setClients((current) => [...current, payload.client]
        .sort((first, second) => first.name.localeCompare(second.name)));
      setSelectedSlug(payload.client.slug);

      setStatus(`${payload.client.name} was created and can sign in now.`);
      setFeedbackSlug(payload.client.slug);
      formElement.reset();
      createDialogRef.current?.close();
    } catch (creationError) {
      setCreateError(creationError.message || "The client could not be created.");
    } finally {
      setBusy("");
    }
  }


  const page=ADMIN_VIEWS[activeView];
  return <AdminShell admin={initialData.admin} active={activeView} title={page.title} description={page.description}>
    {activeView==='overview' && <>
      <section className={styles.metrics} aria-label="Administrator overview">
        <Metric icon="clients" label="Client accounts" value={number(summary.totalClients)} detail={summary.activeClients+' portal enabled'} tone="blue"/>
        <Metric icon="spark" label="AI-enabled clients" value={number(summary.aiEnabledClients)} detail={summary.totalClients-summary.aiEnabledClients+' paused'} tone="cyan"/>
        <Metric icon="activity" label="Recorded AI chats this UTC month" value={number(summary.requestsUsed)} detail="Activity count; no monthly request cap." tone="violet"/>
      </section>
      <section className={styles.overviewWorkspaces} aria-label="Admin workspaces">
        <header className={styles.workspaceIntro}><div><p className={styles.eyebrow}>YOUR WORKSPACE</p><h2>Manage your portal</h2><p>Choose an area to manage clients, services and access.</p></div><span className={styles.overviewSecure}><Icon name="shield"/> Private admin access</span></header>
        <div className={styles.workspaceCards}>{[
          {title:'Clients',description:'Manage client accounts, access and integrations.',href:'/admin?view=clients',icon:'clients',tone:'blue',action:'Manage clients'},
          {title:'Plans & Credits',description:'Set monthly plans, included credits and approved additions.',href:'/admin/credits',icon:'credits',tone:'teal',action:'Manage plans'},
          {title:'AI Usage',description:'Review recorded AI activity, provider costs and reporting.',href:'/admin?view=usage',icon:'activity',tone:'violet',action:'Review usage'},
          {title:'Document Library',description:'Share approved client documents with clear titles and descriptions.',href:'/admin/client-documents',icon:'documents',tone:'amber',action:'Manage documents'},
          {title:'Source Connections',description:'Connect and prepare approved company knowledge.',href:'/admin/sources',icon:'sources',tone:'cyan',action:'Review connections'},
          {title:'Audit Log',description:'Trace administrative actions, outcomes and diagnostic details.',href:'/admin/audit',icon:'shield',tone:'slate',action:'Open activity log'},
        ].map(item=><Link key={item.title} href={item.href} prefetch={false} className={styles.workspaceCard} data-tone={item.tone}><span className={styles.workspaceIcon}><Icon name={item.icon}/></span><h3>{item.title}</h3><p>{item.description}</p><span className={styles.workspaceAction}>{item.action}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></Link>)}</div>
        <p className={styles.overviewNote}><Icon name="spark"/> Client plans include AI credits. Provider capacity and configured access rules still apply.</p>
      </section>
    </>}
    {activeView==='usage' && <PortalUsage/>}
    {activeView==='assistant' && <AdminAssistant clients={clients}/>}
    {activeView==='security' && <>
      <section className={styles.settingsCard}><h2>Client access safeguards</h2><p>Portal and AI access toggles are managed per client. Active client plans enforce their own AI credit limits; historical reporting allowances do not grant access.</p>
        <Link href="/admin?view=clients&tab=access" prefetch={false}>Open client access controls</Link></section>
      <ProviderSettings/>
    </>}
    {activeView==='clients' && <section className={styles.workspace} id="clients">
      <aside className={styles.clientDirectory}>
        <div className={styles.directoryHeading}><div><p>Workspaces</p><h2>Clients</h2></div>
          <button data-action="add" type="button" onClick={()=>{setCreateError('');createDialogRef.current?.showModal();}}><Icon name="plus"/> Add client</button></div>
        <label className={styles.clientSearch}><Icon name="search"/><span className="sr-only">Search clients</span>
          <input type="search" placeholder="Search clients…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <div className={styles.clientList}>{filteredClients.map(client=><button type="button" key={client.slug}
          aria-pressed={client.slug===selectedClient?.slug} disabled={Boolean(busy)}
          className={client.slug===selectedClient?.slug?styles.selectedClient:''} onClick={()=>selectClient(client)}>
          <span className={styles.clientAvatar}>{initials(client.name)}</span><span className={styles.clientCopy}>
            <strong>{client.name}</strong><small>@{client.slug}</small><small className={styles.clientRequestCount}>{number(client.requestsUsed)} recorded AI chats this month</small></span>
          <span className={client.isOnline?styles.online:styles.offline} title={presenceTitle(client)}>{client.isOnline?'Online':'Offline'}</span>
        </button>)}{!filteredClients.length && <p className={styles.emptyList}>No matching clients.</p>}</div>
      </aside>
      <section className={styles.controlPanel}>{selectedClient && draft?<form onSubmit={saveSettings}>
        <div className={styles.clientToolbar}><header className={styles.clientHeader}><div className={styles.clientTitle}><span>{initials(selectedClient.name)}</span>
          <div><p>Selected client</p><h2>{selectedClient.name}</h2><small>@{selectedClient.slug} · {dirty?'Unsaved changes':'Saved settings'}</small></div></div>
          <div className={styles.headerActions}><span className={selectedClient.portalEnabled?styles.enabled:styles.disabled}>
            {selectedClient.portalEnabled?'Portal active':'Portal paused'}</span>
            {dirty && <button type="button" disabled={Boolean(busy)} onClick={clearDraft}>Discard edits</button>}
            <button data-action="edit" type="submit" disabled={Boolean(busy) || !dirty}>{busy==='save'?'Saving…':'Save client'}</button></div></header>
        {status && feedbackSlug===selectedSlug && <p className={styles.success} role="status">{status}</p>}{error && feedbackSlug===selectedSlug && <p className={styles.error} role="alert">{error}</p>}
        <nav className={styles.clientTabs} aria-label="Selected client sections">{ADMIN_CLIENT_TABS.map(([key,label])=><Link key={key}
          href={'/admin?'+new URLSearchParams({view:'clients',client:selectedClient.slug,tab:key})} prefetch={false} aria-current={tab===key?'page':undefined}>{label}</Link>)}</nav></div>
        <div className={styles.selectedSections}>
          {tab==='overview' && <>
            <AdminClientPlan key={selectedClient.id} clientId={selectedClient.id} summary/>
            <section data-action-card="edit" className={styles.settingsCard}><ActionCue tone="edit">Edit client details</ActionCue><h3>Client identity</h3>
              <label className={styles.nameField}><span>Client display name</span><input maxLength="120" value={draft.name} disabled={Boolean(busy)} onChange={event=>updateDraft('name',event.target.value)}/></label>
              <p>Client workspace: <strong>@{selectedClient.slug}</strong> · Created {dateLabel(selectedClient.createdAt)}</p>
              <p>Access toggles and provider usage safeguards are in their own sections.</p>
            </section>
          </>}
          {tab==='access' && <section data-action-card="warning" className={styles.settingsCard}><ActionCue tone="warning">Caution · Changes client access</ActionCue><h3>Access & availability</h3><p>Pause access without deleting conversations or history. Save Client applies these changes.</p>
            <label className={styles.toggleRow}><span><strong>Client portal</strong><small>Allow the client workspace to be accessed.</small></span>
              <input type="checkbox" checked={draft.portalEnabled} disabled={Boolean(busy)} onChange={event=>updateDraft('portalEnabled',event.target.checked)}/><i/></label>
            <label className={styles.toggleRow}><span><strong>AI assistant</strong><small>Allow new AI requests through the selected provider, including OpenAI or OpenRouter.</small></span>
              <input type="checkbox" checked={draft.aiEnabled} disabled={Boolean(busy)} onChange={event=>updateDraft('aiEnabled',event.target.checked)}/><i/></label>
          </section>}
          {tab==='usage' && <>
            <AdminClientPlan key={selectedClient.id} clientId={selectedClient.id} summary/>
            <section className={styles.settingsCard} id="ai-controls"><h3>AI chat usage</h3>
              <p>{number(selectedClient.requestsUsed)} recorded AI chats this UTC month. Credit limits follow this client’s active plan.</p>
              <Link href={"/admin?view=usage&usageClient="+selectedClient.id} prefetch={false}>Clear this client&apos;s AI chat usage history</Link>
            </section>
          </>}
          {tab==='integrations' && <>
            <section data-action-card="edit" className={styles.settingsCard}><ActionCue tone="edit">Edit permitted knowledge</ActionCue><h3>Approved AI knowledge & web domain</h3>
              <p>Shared company knowledge is managed in Source Connections. The fields below are optional client-specific settings; saving them does not verify remote access.</p>
              <Link href="/admin/sources" prefetch={false}>Open Source Connections</Link>
              <label className={styles.vectorField}><span>Client vector store ID</span><input value={draft.vectorStoreId} placeholder="vs_…" disabled={Boolean(busy)} onChange={event=>updateDraft('vectorStoreId',event.target.value)}/><small>{selectedClient.vectorStoreId?'Saved client knowledge ID · access not checked here':'No client-specific vector store saved'}</small></label>
              <label className={styles.vectorField}><span>Approved AI web-search domain URL</span><input type="url" value={draft.approvedWebsiteUrl} disabled={Boolean(busy)} placeholder="https://www.example.com" onChange={event=>updateDraft('approvedWebsiteUrl',event.target.value)}/>
                <small>AI web search remains restricted to this public domain and its subdomains. Website Insights sites do not widen this restriction.</small></label>
            </section>
            <AdminClientWebsites key={selectedClient.id} clientId={selectedClient.id}/>
            <section data-action-card="edit" className={styles.settingsCard}><ActionCue tone="edit">Edit project mapping</ActionCue><h3>Hubstaff project</h3><p>{selectedClient.hubstaffProjectUrl?'Project mapping saved. Sync status appears below.':'No project mapping saved. Enter this client’s Hubstaff project and save it before syncing.'}</p>
              <label className={styles.vectorField}><span>Hubstaff project URL</span><input type="url" value={draft.hubstaffProjectUrl} disabled={Boolean(busy)} placeholder="https://tasks.hubstaff.com/app/organizations/…/projects/…" onChange={event=>updateDraft('hubstaffProjectUrl',event.target.value)}/>
                <small style={{display:'none'}}>Only the mapped project is available to this client. Ownership checks remain enforced by the server.</small></label>
              <label className={styles.vectorField} style={{display:'none'}}><span>Monthly Hubstaff hours fallback</span><input type="number" min="0.01" max="100000" step="0.01" value={draft.hubstaffMonthlyHoursLimit ?? ""} disabled={Boolean(busy)} onChange={event=>updateDraft("hubstaffMonthlyHoursLimit",event.target.value)}/><small>Optional. Used only when Hubstaff provides no hours budget. This does not limit AI chat usage.</small></label>
            </section>
            <section data-action-card="info" className={styles.settingsCard}><ActionCue tone="info">Sync saved project data</ActionCue><h3>Project indexing</h3><p>Queue and sync controls are independent of Save Client. They use the saved project mapping.</p>
              <ClientHubstaffIndex key={selectedClient.id+':'+selectedClient.hubstaffProjectUrl+':'+selectedClient.portalEnabled+':'+selectedClient.aiEnabled}
                clientId={selectedClient.id} projectUrl={selectedClient.hubstaffProjectUrl} enabled={selectedClient.portalEnabled && selectedClient.aiEnabled}
                mappingChanged={draft.hubstaffProjectUrl.trim()!==(selectedClient.hubstaffProjectUrl || '').trim()}/>
            </section>
            <section data-action-card="warning" className={styles.settingsCard}><ActionCue tone="warning">Caution · Sends a real test event</ActionCue><h3>Make automation · portal-wide</h3><p>This is a portal-wide integration, not a saved client mapping. A test sends a real event to the configured Make scenario; Save Client does not run it.</p>
              <p role={makeConnection.state==='error'?'alert':'status'}>{makeConnection.message}</p>
              <button type="button" disabled={Boolean(busy)} onClick={testMakeConnection}>{busy==='make-test'?'Testing…':'Send Make connection test'}</button>
            </section>
          </>}
          {tab==='activity' && <section data-action-card="info" className={styles.settingsCard}><ActionCue tone="info">View workspace activity</ActionCue><h3>Workspace activity</h3><div className={styles.accountStats}>
            <div><strong>{number(selectedClient.memberCount)}</strong><span>Workspace logins</span></div><div><strong>{number(selectedClient.conversationCount)}</strong><span>ChatKit conversations</span></div>
            <div><strong>{number(selectedClient.approvedKnowledge)}</strong><span>Approved client sources</span></div><div><strong>{number(selectedClient.pendingKnowledge)}</strong><span>Pending client sources</span></div></div>
            <p>Conversation totals include this client’s saved ChatKit threads across all members, in Work and General modes. They exclude the private AOC admin assistant and legacy workspace snapshots. Conversation content is not shown.</p>
            <p>Latest thread creation or recorded AI request: {selectedClient.lastActivityAt?dateLabel(selectedClient.lastActivityAt):selectedClient.conversationCount==null?'Tracking unavailable':'None recorded'}.</p>
            <p>Presence is separate: {presenceTitle(selectedClient)}. Activity timestamps are displayed in your browser’s local time.</p>
            <div className={styles.memberList}>{selectedClient.members.map((member,index)=><div key={index}><span>{initials(member.name || member.username)}</span>
              <p><strong>{member.name || member.username}</strong><small>@{member.username || 'portal-user'}</small></p><b>{String(member.role || 'member').replaceAll('_',' ')}</b></div>)}</div>
            <Link href={'/admin/audit?clientId='+selectedClient.id} prefetch={false}>Open this client’s recorded audit activity</Link>
          </section>}
        </div>
      </form>:<div className={styles.noClient}><Image src={aocIcon} alt=""/><h2>{clients.length?'Choose an available client':'Create your first client account'}</h2>
        <p>{clients.length?'The requested client is not in this list. Select an existing client to continue.':'No client records exist yet.'}</p>
        <button type="button" onClick={()=>createDialogRef.current?.showModal()}>Add client</button></div>}</section>
    </section>}
      <dialog className={styles.createDialog} ref={createDialogRef}>
        <form data-action-card="add" onSubmit={createClient}><ActionCue tone="add">Add a client workspace</ActionCue>
          <header>
            <div><p>Private provisioning</p><h2>Create a client account</h2></div>
            <button type="button" aria-label="Close" onClick={() => createDialogRef.current?.close()}>×</button>
          </header>
          <p className={styles.dialogIntro}>
            This creates one client workspace, one login, and one client-admin membership.
            The password is hashed by Better Auth and is never stored in portal tables.
          </p>
          <div className={styles.dialogGrid}>
            <label><span>Client name</span><input name="name" maxLength="120" required placeholder="Client Name" /></label>
            <label><span>Username</span><input name="username" minLength="3" maxLength="50" required pattern="[a-z0-9][a-z0-9._-]{2,49}" placeholder="Username" /></label>
            <label className={styles.dialogWide}><span>Temporary password</span><input name="password" type="password" minLength="12" maxLength="128" required autoComplete="new-password" placeholder="At least 12 characters" /></label>
            <label className={styles.dialogWide}>
              <span>Approved website URL</span>
              <input
                name="approvedWebsiteUrl"
                type="url"
                placeholder="https://www.example.com"
              />
              <small>Optional. The assistant can search only this website domain for this client.</small>
            </label>
            <label className={styles.dialogWide}>
              <span>Hubstaff project URL</span>
              <input
                name="hubstaffProjectUrl"
                type="url"
                placeholder="https://tasks.hubstaff.com/app/organizations/####/projects/######"
              />
            </label>
            <label className={styles.dialogWide} style={{display:'none'}}><span>Monthly Hubstaff hours fallback</span><input name="hubstaffMonthlyHoursLimit" type="hidden" min="0.01" max="100000" step="0.01"/><small>Optional when Hubstaff has no hours budget. Separate from AI usage.</small></label>
          </div>
          {createError ? <p className={styles.dialogError} role="alert">{createError}</p> : null}
          <footer>
            <button type="button" onClick={() => createDialogRef.current?.close()}>Cancel</button>
            <button data-action="add" disabled={busy === "create"} type="submit">
              {busy === "create" ? "Creating client..." : "Create client"}
            </button>
          </footer>
        </form>
      </dialog>
  </AdminShell>;
}
