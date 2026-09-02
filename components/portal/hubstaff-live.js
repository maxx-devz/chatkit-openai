"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import styles from "./client-portal.module.css";

const HubstaffContext = createContext(null);
const REFRESH_INTERVAL_MS = 30_000;

function formatHours(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "In progress";
}

function LiveMetricCard({ metric }) {
  const iconName = metric.tone === "purple"
    ? "target"
    : metric.tone === "green"
      ? "check"
      : "clock";
  const iconPaths = {
    clock: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 4v5l3.5 2",
    target: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M16 4h4v4",
    check: "M4 12l5 5L20 6",
  };

  return (
    <article className={`${styles.metricCard} ${styles[metric.tone]}`}>
      <span className={styles.metricIcon}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={iconPaths[iconName]} />
        </svg>
      </span>
      <div className={styles.metricBody}>
        <p>{metric.label}</p>
        <div className={styles.metricValue}>
          <strong>{metric.value}</strong>
          {metric.suffix ? <b>{metric.suffix}</b> : null}
        </div>
        <span>{metric.detail}</span>
        {Number.isFinite(metric.progress) ? (
          <div className={styles.metricProgress}>
            <i style={{ width: `${metric.progress}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function HubstaffProvider({ projectConfigured, children }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let controller = null;
    let requestInFlight = false;

    async function load() {
      if (!active || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      controller = new AbortController();
      setStatus((current) => current === "ready" ? "refreshing" : "loading");

      try {
        const response = await fetch("/api/hubstaff", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const diagnostics = [
            payload?.error,
            payload?.providerCode ? `Provider code: ${payload.providerCode}` : "",
            payload?.providerErrorCode ? `Provider error code: ${payload.providerErrorCode}` : "",
            payload?.upstreamStatus ? `HTTP ${payload.upstreamStatus}` : "",
          ].filter(Boolean);
          throw new Error(diagnostics.join(" · ") || "Hubstaff data could not be loaded.");
        }
        if (!active) return;

        setData(payload?.configured ? payload : null);
        setError(payload?.source?.warning || "");
        setStatus(payload?.configured ? "ready" : "unconfigured");
      } catch (loadError) {
        if (!active || loadError.name === "AbortError") return;
        setError(loadError.message || "Hubstaff data could not be loaded.");
        setStatus("error");
      } finally {
        requestInFlight = false;
        controller = null;
      }
    }

    load();
    const intervalId = window.setInterval(load, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
      controller?.abort();
    };
  }, []);

  const value = useMemo(
    () => ({ data, status, error, projectConfigured }),
    [data, error, projectConfigured, status],
  );

  return <HubstaffContext.Provider value={value}>{children}</HubstaffContext.Provider>;
}

function useHubstaff() {
  return useContext(HubstaffContext) || {
    data: null,
    status: "unconfigured",
    error: "",
    projectConfigured: false,
  };
}

export function HubstaffMetrics({ fallbackMetrics }) {
  const { data } = useHubstaff();
  const metrics = useMemo(() => {
    if (!data?.hours) return fallbackMetrics;

    const usedProgress = data.hours.limit
      ? Math.min(100, Math.max(0, (data.hours.used / data.hours.limit) * 100))
      : null;
    const limitDetail = data.hours.limit === null
      ? "Tracked by Hubstaff this month"
      : `of ${formatHours(data.hours.limit)} hrs`;

    return fallbackMetrics.map((metric, index) => {
      if (index === 0) {
        return {
          ...metric,
          value: formatHours(data.hours.used),
          detail: limitDetail,
          progress: usedProgress,
        };
      }
      if (index === 1) {
        return {
          ...metric,
          value: formatHours(data.hours.remaining),
          detail: data.hours.limit === null
            ? "Add a Hubstaff monthly budget to calculate remaining"
            : `${formatHours(data.hours.limit)} hrs monthly budget`,
          progress: usedProgress === null ? null : Math.max(0, 100 - usedProgress),
        };
      }
      return metric;
    });
  }, [data, fallbackMetrics]);

  return metrics.map((metric) => <LiveMetricCard metric={metric} key={metric.label} />);
}

function StaticProjectRows({ projects }) {
  return (
    <div className={styles.projectList}>
      {projects.map((project) => (
        <article key={project.name}>
          <span className={styles.projectIcon}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v16h14V5h-3M9 3h6v4H9zM9 12h6M9 16h4" /></svg>
          </span>
          <div className={styles.projectName}>
            <strong>{project.name}</strong>
            <small>{project.detail}</small>
          </div>
          <span className={project.status === "Completed" ? styles.completed : styles.inProgress}>{project.status}</span>
          <div className={styles.projectProgress}><i style={{ width: `${project.progress}%` }} /></div>
          <b>{project.progress}%</b>
        </article>
      ))}
    </div>
  );
}

export function HubstaffProjectProgress({ fallbackProjects }) {
  const { data, status, error } = useHubstaff();
  const tasks = useMemo(() => data?.tasks || [], [data?.tasks]);
  const groupedTasks = useMemo(() => {
    const groups = new Map();
    for (const task of tasks) {
      const name = task.completed ? "Done" : titleCase(task.column || task.status);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(task);
    }
    return [...groups.entries()].sort(([first], [second]) => {
      if (first === "Done") return 1;
      if (second === "Done") return -1;
      return first.localeCompare(second);
    });
  }, [tasks]);

  // Keep the last successful board visible if a background refresh fails.
  // This avoids replacing useful data with the static fallback during a
  // transient Hubstaff/network error.
  const showLiveTasks = Boolean(data?.configured);
  const completedCount = tasks.filter((task) => task.completed).length;
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <section className={styles.card} aria-labelledby="projects-title">
      <header className={styles.cardHeader}>
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v16h14V5h-3M9 3h6v4H9zM9 12h6M9 16h4" /></svg></span>
        <h2 id="projects-title">Project Progress</h2>
        {showLiveTasks ? <small className={styles.liveBadge}>Live · {progress}% complete</small> : null}
      </header>

      {showLiveTasks ? (
        <>
          <div className={styles.liveProjectMeta}>
            <div>
              <strong>{data.project.name}</strong>
              <span>{completedCount} of {tasks.length} tasks completed</span>
            </div>
            <a href={data.project.url} target="_blank" rel="noreferrer">Open Hubstaff</a>
          </div>
          {groupedTasks.length ? (
            <div className={styles.taskBoard}>
              {groupedTasks.map(([column, columnTasks]) => (
                <section className={styles.taskColumn} key={column}>
                  <header><strong>{column}</strong><span>{columnTasks.length}</span></header>
                  <div>
                    {columnTasks.map((task) => (
                      <article className={styles.taskCard} key={task.id}>
                        <strong>{task.title}</strong>
                        <small>{task.completed ? "Completed" : titleCase(task.status)}</small>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className={styles.liveEmpty}>No active or completed tasks were returned for this project.</p>
          )}
          {data.source?.partial || error ? (
            <p className={styles.liveWarning}>
              Some Hubstaff data could not be refreshed. It will retry automatically.
              {error ? <><br /><small>{error}</small></> : null}
            </p>
          ) : null}
        </>
      ) : (
        <>
          {status === "loading" ? (
            <p className={styles.liveLoading}>Connecting to Hubstaff…</p>
          ) : null}
          {status === "error" ? (
            <p className={styles.liveWarning}>
              Hubstaff is temporarily unavailable. Showing the portal defaults until the next retry.
              {error ? <><br /><small>{error}</small></> : null}
            </p>
          ) : null}
          {status === "unconfigured" ? (
            <p className={styles.liveEmpty}>Connect a Hubstaff project in Admin → Client controls to show live tasks.</p>
          ) : null}
          <StaticProjectRows projects={fallbackProjects} />
        </>
      )}
    </section>
  );
}
