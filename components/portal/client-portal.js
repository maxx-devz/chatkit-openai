import Image from "next/image";
import Link from "@/components/portal-ui/navigation-link";
import {WebsiteInsights,ClientDocumentsPanel,ClientOfficialDocuments,ClientAuditPanel,ClientMembersPanel,ClientPasswordSettings} from "./client-page-modules";
import { clientNavigation, clientView } from "@/lib/client-navigation";

import AiAssistantPanel from "@/components/ai-assistant/ai-assistant-panel";
import AccountControls from "@/components/portal/account-controls";
import HubstaffProvider, {
  HubstaffMetrics,
  HubstaffMonthGlance,
  HubstaffProjectProgress,
} from "@/components/portal/hubstaff-live";
import PresenceHeartbeat from "@/components/portal/presence-heartbeat";
import ResizableDashboardGrid from "@/components/portal/resizable-dashboard-grid";
import aocIcon from "@/aoc-icon.png";
import aocLogo from "@/aoc-logo.png";
import { PORTAL_CONFIG } from "@/config/portal";
import { CLIENT_PERMISSIONS } from "@/lib/client-permissions";
import styles from "./client-portal.module.css";
import theme from "@/components/portal-ui/portal-theme.module.css";
import HeaderCredits from "@/components/credits/header-credits";
import PortalPageSearch from "./portal-page-search";

const ICON_PATHS = {
  dashboard: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  sparkles: "M12 2l1.4 4.1L17.5 7.5l-4.1 1.4L12 13l-1.4-4.1-4.1-1.4 4.1-1.4zM18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 14l1 2.8 2.8 1L6 18.8 5 21.5 4 18.8l-2.8-1L4 16.8z",
  clock: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 4v5l3.5 2",
  chart: "M4 20V10m5 10V5m5 15v-7m5 7V8M2 20h20",
  clipboard: "M8 5H5v16h14V5h-3M9 3h6v4H9zM9 12h6M9 16h4",
  pie: "M11 3a9 9 0 1 0 9 10h-9zM14 3v7h7a8 8 0 0 0-7-7z",
  folder: "M3 7h7l2 2h9v11H3zM3 7V5h7l2 2",
  user: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 9a8 8 0 0 1 16 0",
  users: "M9 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 9a7 7 0 0 1 14 0M17 11a3 3 0 1 0-2-5M18 15a6 6 0 0 1 4 6",
  target: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M16 4h4v4",
  check: "M4 12l5 5L20 6",
};

function PortalIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function PortalSidebar({ portal }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.portalBrand}>
        <Image src={aocLogo} alt="Always Open Commerce" priority />
        <span>Client Portal</span>
      </div>

      <nav className={styles.portalNav} aria-label="Client portal">
        {clientNavigation(portal.permissions).map(({ icon, label, href, view }) => (
          <Link
            className={view === portal.view ? styles.activeNav : undefined}
            aria-current={view === portal.view ? "page" : undefined}
            prefetch={false}
            href={href}
            key={label}
          >
            <PortalIcon name={icon} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className={styles.sidebarAccount}>
        <span>{portal.clientInitials}</span>
        <div>
          <strong>{portal.clientName}</strong>
          <small>{portal.accountLabel}</small>
        </div>
        <b aria-hidden="true">›</b>
      </div>
    </aside>
  );
}

function PortalHeader({ portal }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.welcome}>
        <p>Welcome back, <strong>{portal.clientName}</strong></p>
        <span>{portal.welcomeMessage}</span>
      </div>

      <div className={styles.headerSearch}><PortalPageSearch items={[...clientNavigation(portal.permissions),{label:"Credits & usage",href:"/credits"}]} /></div>
      <details className={styles.notificationAvailability}>
        <summary aria-label="Notification availability"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7M10 20h4" />
        </svg></summary>
        <p>Notifications are not connected yet. Your project updates are available in the dashboard and activity log.</p>
      </details>
      <div className={styles.headerCredits}><HeaderCredits key={portal.client.id} clientId={portal.client.id} active={portal.view==="credits"} /></div>
      <div className={styles.headerAccount}><AccountControls
        key={`${portal.client.id}:${portal.user.id}`}
        client={portal.client}
        memberships={portal.memberships}
        user={portal.user}
      /></div>
    </header>
  );
}

function QuickQuestions({ questions }) {
  return (
    <section className={styles.quickQuestions} aria-labelledby="quick-questions-title">
      <header>
        <span>?</span>
        <h2 id="quick-questions-title">Quick Questions</h2>
      </header>
      {questions.map((question) => (
        <Link href="/?view=ai" prefetch={false} key={question}>
          <span>{question}</span>
          <b aria-hidden="true">›</b>
        </Link>
      ))}
    </section>
  );
}

function clientInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "AOC";
}

function PortalData({ portal, children }) {
  if (!["dashboard", "time", "projects"].includes(portal.view)) return children;
  return <HubstaffProvider clientName={portal.clientName} key={portal.client.slug}
    projectConfigured={Boolean(portal.client.hubstaffProjectUrl)}>{children}</HubstaffProvider>;
}

function MobileNavigation({ portal }) {
  const items = clientNavigation(portal.permissions);
  return <details className={styles.mobileNavigation}>
    <summary>Menu · {items.find(item => item.view === portal.view)?.label || "Client portal"}</summary>
    <nav aria-label="Mobile client portal">{items.map(item => <Link key={item.view} href={item.href}
      prefetch={false} aria-current={item.view === portal.view ? "page" : undefined}>{item.label}</Link>)}</nav>
  </details>;
}

export default function ClientPortal({ portalContext, requestedView, initialWebsite, connectionResult, standalonePage, children }) {
  const portal = {
    ...PORTAL_CONFIG,
    clientName: portalContext.client.name,
    clientInitials: clientInitials(portalContext.client.name),
    accountLabel: portalContext.user.username || "Client Account",
    client: portalContext.client,
    memberships: portalContext.memberships,
    permissions: portalContext.permissions,
    user: portalContext.user,
    view: standalonePage==="credits"?"credits":clientView(requestedView, portalContext.permissions),
  };
  const quickQuestions = [
    `How many hours does ${portal.clientName} have left this month?`,
    `What work was completed today for ${portal.clientName}?`,
    `Which ${portal.clientName} tasks are in progress?`,
    `What was completed this month for ${portal.clientName}?`,
  ];
  const canUseAi = portal.permissions.includes(CLIENT_PERMISSIONS.AI_USE);

  return (
    <div className={`${styles.portalShell} ${theme.surface}`}>
      <PresenceHeartbeat />
      <PortalSidebar portal={portal} />
      <div className={styles.portalMain}>
        <PortalHeader portal={portal} />
        <MobileNavigation portal={portal} />
        <PortalData portal={portal}>
          <main className={styles.dashboard} id="dashboard">
            {!["dashboard","credits"].includes(portal.view) && <header className={styles.pageHeading}>
              <h1>{clientNavigation(portal.permissions).find(item=>item.view===portal.view)?.label}</h1>
              <p>{portal.clientName} · your client workspace</p>
            </header>}
            {children}
            {portal.view === "dashboard" && portal.permissions.includes(CLIENT_PERMISSIONS.DOCUMENTS_READ) && <ClientOfficialDocuments key={`official-summary:${portalContext.client.id}`} clientId={portalContext.client.id} summary/>}
            {portal.view === "dashboard" && <section className={styles.metrics} aria-label="Account overview">
              <HubstaffMetrics />
            </section>}

            {portal.view === "dashboard" && (canUseAi ? <ResizableDashboardGrid clientId={portalContext.client.id}
              left={<div className={styles.leftColumn}>
                <div className={styles.overviewColumn}>
                  <div id="monthly-time"><HubstaffMonthGlance /></div>
                  <div id="project-status"><HubstaffProjectProgress canUseAi={canUseAi} /></div>
                </div>
              </div>}
              right={<div className={styles.rightColumn}>
                <AiAssistantPanel
                  clientId={portalContext.client.id}
                  clientName={portalContext.client.name}
                  userId={portalContext.user.id}
                  height={portal.assistantPanel.height}
                  key={portal.client.slug}
                  minHeight={portal.assistantPanel.minHeight}
                />
                <QuickQuestions questions={quickQuestions} />
              </div>}
            /> : <div className={styles.viewerOverview}>
              <div id="monthly-time"><HubstaffMonthGlance /></div>
              <div id="project-status"><HubstaffProjectProgress canUseAi={canUseAi} /></div>
            </div>)}
            {portal.view === "ai" && <AiAssistantPanel clientId={portalContext.client.id} clientName={portalContext.client.name}
              userId={portalContext.user.id} height="78vh" minHeight={600} />}
            {portal.view === "time" && <HubstaffMonthGlance detailed />}
            {portal.view === "projects" && <HubstaffProjectProgress canUseAi={canUseAi} />}
            {portal.view === "website-insights" && <WebsiteInsights embedded key={portalContext.client.id} clientId={portalContext.client.id}
              initialWebsite={initialWebsite} connectionResult={connectionResult}
              canWrite={portal.permissions.includes(CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE)}
              canManage={portal.permissions.includes(CLIENT_PERMISSIONS.DOCUMENTS_MANAGE)} />}
        {portal.view === "documents" && <ClientOfficialDocuments key={`official:${portalContext.client.id}`} clientId={portalContext.client.id}/>}
        {portal.view === "documents" && <ClientDocumentsPanel key={`documents:${portalContext.client.id}`} clientId={portalContext.client.id}
          canContribute={portal.permissions.includes(CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE)} />}
        {portal.view === "members" && portal.permissions.includes(CLIENT_PERMISSIONS.MEMBERS_MANAGE)
          ? <ClientMembersPanel key={`members:${portalContext.client.id}`} clientId={portalContext.client.id}
            currentUserId={portalContext.user.id} /> : null}
        {portal.view === "audit" && portal.permissions.includes(CLIENT_PERMISSIONS.ACCESS_AUDIT_READ)
          ? <ClientAuditPanel key={`audit:${portalContext.client.id}`} clientId={portalContext.client.id} /> : null}
        {portal.view === "account" && <ClientPasswordSettings username={portalContext.user.username} />}
          </main>
        </PortalData>
        <footer className={styles.footer}>
          <span>© {new Date().getUTCFullYear()} Always Open Commerce · Client Portal</span>
          <div className={styles.policyLinks}>
            <details><summary>Privacy Policy</summary><p>Contact AOC for the current privacy policy. A policy link has not been added to this portal yet.</p></details>
            <details><summary>Terms of Service</summary><p>Contact AOC for the terms that apply to your engagement. A terms link has not been added to this portal yet.</p></details>
          </div>
        </footer>
      </div>
    </div>
  );
}
