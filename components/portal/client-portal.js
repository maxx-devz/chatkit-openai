import Image from "next/image";

import AiAssistantPanel from "@/components/ai-assistant/ai-assistant-panel";
import AccountControls from "@/components/portal/account-controls";
import HubstaffProvider, {
  HubstaffMetrics,
  HubstaffProjectProgress,
} from "@/components/portal/hubstaff-live";
import aocIcon from "@/aoc-icon.png";
import aocLogo from "@/aoc-logo.png";
import { PORTAL_CONFIG } from "@/config/portal";
import styles from "./client-portal.module.css";

const NAV_ITEMS = [
  ["dashboard", "Dashboard"],
  ["sparkles", "AI Assistant", "#ai-assistant"],
  ["clock", "Monthly Time"],
  ["chart", "Project Status"],
  ["clipboard", "Recent Work"],
  ["pie", "Insights"],
  ["folder", "Documents"],
  ["user", "Account"],
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
        {NAV_ITEMS.map(([icon, label, href], index) => (
          <a
            className={index === 0 ? styles.activeNav : undefined}
            href={href || "#dashboard"}
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

function TimeOverview() {
  return (
    <section className={styles.card} aria-labelledby="time-overview-title">
      <header className={styles.cardHeader}>
        <span><PortalIcon name="chart" /></span>
        <h2 id="time-overview-title">This Month at a Glance</h2>
      </header>
      <div className={styles.glanceStats}>
        <div><strong>7.25</strong><span>Hours Used</span></div>
        <div><strong>7.75</strong><span>Hours Remaining</span></div>
        <div><strong>48%</strong><span>Time Used</span></div>
        <div><strong>5</strong><span>Tasks Completed</span></div>
      </div>
      <div className={styles.chartHeading}>
        <strong>Time Usage Trend</strong>
        <span><i /> Hours Used <i /> Hours Remaining</span>
      </div>
      <div className={styles.chartWrap} aria-label="Prototype time usage chart">
        <svg viewBox="0 0 700 250" role="img" aria-labelledby="chart-title">
          <title id="chart-title">Hours used increase while hours remaining decrease through May</title>
          {[40, 90, 140, 190].map((y) => (
            <line className={styles.gridLine} x1="48" x2="678" y1={y} y2={y} key={y} />
          ))}
          <line className={styles.axisLine} x1="48" x2="48" y1="24" y2="205" />
          <line className={styles.axisLine} x1="48" x2="678" y1="205" y2="205" />
          <polyline className={styles.remainingLine} points="48,44 140,70 232,92 324,121 416,145 508,163 598,178 678,166" />
          <polyline className={styles.usedLine} points="48,205 140,183 232,159 324,145 416,135 508,125 598,115 678,98" />
          {["May 1", "May 7", "May 14", "May 21", "May 28", "May 31"].map((label, index) => (
            <text x={48 + index * 124} y="232" key={label}>{label}</text>
          ))}
        </svg>
      </div>
    </section>
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
    user: portalContext.user,
  };

  return (
    <div className={styles.portalShell}>
      <PortalSidebar portal={portal} />
      <div className={styles.portalMain}>
        <PortalHeader portal={portal} />
        <HubstaffProvider projectConfigured={Boolean(portal.client.hubstaffProjectUrl)}>
          <main className={styles.dashboard} id="dashboard">
            <section className={styles.metrics} aria-label="Account overview">
              <HubstaffMetrics fallbackMetrics={portal.metrics} />
            </section>

            <div className={styles.dashboardGrid}>
              <div className={styles.leftColumn}>
                <TimeOverview />
                <HubstaffProjectProgress fallbackProjects={portal.projects} />
              </div>
              <div className={styles.rightColumn}>
                <AiAssistantPanel
                  clientId={portalContext.client.id}
                  clientName={portalContext.client.name}
                  userId={portalContext.user.id}
                  height={portal.assistantPanel.height}
                  key={portal.client.slug}
                  minHeight={portal.assistantPanel.minHeight}
                />
                <QuickQuestions questions={portal.quickQuestions} />
              </div>
            </div>
          </main>
        </HubstaffProvider>
        <footer className={styles.footer}>
          <span>© 2026 Always Open Commerce. Prototype client portal.</span>
          <span>Privacy Policy <i /> Terms of Service</span>
        </footer>
      </div>
    </div>
  );
}
