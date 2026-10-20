import Image from "next/image";

import AiAssistantPanel from "@/components/ai-assistant/ai-assistant-panel";
import AccountControls from "@/components/portal/account-controls";
import ClientDocumentsPanel from "@/components/portal/client-documents-panel";
import ClientAuditPanel from '@/components/portal/client-audit-panel';
import ClientMembersPanel from "@/components/portal/client-members-panel";
import ClientPasswordSettings from "@/components/portal/client-password-settings";
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

const NAV_ITEMS = [
  ["dashboard", "Dashboard", "#dashboard"],
  ["sparkles", "AOC AI", "#ai-assistant", CLIENT_PERMISSIONS.AI_USE],
  ["clock", "Monthly Time", "#monthly-time"],
  ["chart", "Project Status", "#project-status"],
  ["folder", "Documents", "#client-documents", CLIENT_PERMISSIONS.DOCUMENTS_READ],
  ["users", "Members & Access", "#client-members", CLIENT_PERMISSIONS.MEMBERS_MANAGE],
  ["clipboard", "Audit Log", "#client-audit", CLIENT_PERMISSIONS.ACCESS_AUDIT_READ],
  ["user", "Account", "#account-security"],
];

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
        {NAV_ITEMS.filter(([, , , permission]) => !permission || portal.permissions.includes(permission))
          .map(([icon, label, href], index) => (
          <a
            className={index === 0 ? styles.activeNav : undefined}
            href={href}
            key={label}
          >
            <PortalIcon name={icon} />
            <span>{label}</span>
          </a>
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

      <label className={styles.search}>
        <span className="sr-only">Search portal</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
        <input type="search" placeholder="Search portal..." />
      </label>

      <button className={styles.notification} type="button" aria-label="Notifications">
        <span aria-hidden="true">•</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7M10 20h4" />
        </svg>
      </button>

      <AccountControls
        client={portal.client}
        memberships={portal.memberships}
        user={portal.user}
      />
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
        <a href="#ai-assistant" key={question}>
          <span>{question}</span>
          <b aria-hidden="true">›</b>
        </a>
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

export default function ClientPortal({ portalContext }) {
  const portal = {
    ...PORTAL_CONFIG,
    clientName: portalContext.client.name,
    clientInitials: clientInitials(portalContext.client.name),
    accountLabel: portalContext.user.username || "Client Account",
    client: portalContext.client,
    memberships: portalContext.memberships,
    permissions: portalContext.permissions,
    user: portalContext.user,
  };
  const quickQuestions = [
    `How many hours does ${portal.clientName} have left this month?`,
    `What work was completed today for ${portal.clientName}?`,
    `Which ${portal.clientName} tasks are in progress?`,
    `What was completed this month for ${portal.clientName}?`,
  ];
  const canUseAi = portal.permissions.includes(CLIENT_PERMISSIONS.AI_USE);

  return (
    <div className={styles.portalShell}>
      <PresenceHeartbeat />
      <PortalSidebar portal={portal} />
      <div className={styles.portalMain}>
        <PortalHeader portal={portal} />
        <HubstaffProvider
          clientName={portal.clientName}
          key={portal.client.slug}
          projectConfigured={Boolean(portal.client.hubstaffProjectUrl)}
        >
          <main className={styles.dashboard} id="dashboard">
            <section className={styles.metrics} aria-label="Account overview">
              <HubstaffMetrics />
            </section>

            {canUseAi ? <ResizableDashboardGrid clientId={portalContext.client.id}
              left={<div className={styles.leftColumn}>
                <div className={styles.overviewColumn}>
                  <div id="monthly-time"><HubstaffMonthGlance /></div>
                  <div id="project-status"><HubstaffProjectProgress /></div>
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
              <div id="project-status"><HubstaffProjectProgress /></div>
            </div>}
          </main>
        </HubstaffProvider>
        <ClientDocumentsPanel key={`documents:${portalContext.client.id}`} clientId={portalContext.client.id}
          canContribute={portal.permissions.includes(CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE)} />
        {portal.permissions.includes(CLIENT_PERMISSIONS.MEMBERS_MANAGE)
          ? <ClientMembersPanel key={`members:${portalContext.client.id}`} clientId={portalContext.client.id}
            currentUserId={portalContext.user.id} /> : null}
        {portal.permissions.includes(CLIENT_PERMISSIONS.ACCESS_AUDIT_READ)
          ? <ClientAuditPanel key={`audit:${portalContext.client.id}`} clientId={portalContext.client.id} /> : null}
        <ClientPasswordSettings username={portalContext.user.username} />
        <footer className={styles.footer}>
          <span>© 2026 Always Open Commerce. Prototype client portal.</span>
          <span>Privacy Policy <i /> Terms of Service</span>
        </footer>
      </div>
    </div>
  );
}
