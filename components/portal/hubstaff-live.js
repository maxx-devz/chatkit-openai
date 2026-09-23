"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import styles from "./client-portal.module.css";

const HubstaffContext = createContext(null);
const REFRESH_INTERVAL_MS = 30_000;
const WORKFLOW_REFRESH_INTERVAL_MS = 60_000;
const EMPTY_VALUE = "\u2014";

function formatHours(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return EMPTY_VALUE;
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return EMPTY_VALUE;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatRemainingTime(hours, minutes) {
  if (Number.isFinite(Number(minutes)) && Number(minutes) < 60) {
    return { value: String(Math.max(0, Number(minutes))), suffix: "min" };
  }
  return { value: formatHours(hours), suffix: "hrs" };
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "In progress";
}

function MetricIcon({ name }) {
  const paths = {
    clock: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 4v5l3.5 2",
    project: "M3 7h7l2 2h9v11H3zM3 7V5h7l2 2",
    tasks: "M8 5H5v16h14V5h-3M9 3h6v4H9zM9 12h6M9 16h4",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function StageIcon({ stage }) {
  const paths = {
    todo: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z",
    in_progress: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2",
    review: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    done: "M4 12l5 5L20 6",
    other: "M4 6h16M4 12h16M4 18h10",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[stage] || paths.other} /></svg>;
}

function LiveMetricCard({ metric }) {
  return (
    <article className={`${styles.metricCard} ${styles[metric.tone]}`}>
      <span className={styles.metricIcon}><MetricIcon name={metric.icon} /></span>
      <div className={styles.metricBody}>
        <p>{metric.label}</p>
        <div className={styles.metricValue}>
          {metric.href ? (
            <a href={metric.href} target="_blank" rel="noreferrer">{metric.value}</a>
          ) : <strong>{metric.value}</strong>}
          {metric.suffix ? <b>{metric.suffix}</b> : null}
        </div>
        <span>{metric.detail}</span>
        {Number.isFinite(metric.progress) ? (
          <div className={styles.metricProgress}>
            <i style={{ width: `${Math.min(100, Math.max(0, metric.progress))}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function HubstaffProvider({ clientName, projectConfigured, children }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(projectConfigured ? "loading" : "unconfigured");
  const [error, setError] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [workflowStatus, setWorkflowStatus] = useState(projectConfigured ? "waiting" : "unconfigured");
  const [workflowError, setWorkflowError] = useState("");

  useEffect(() => {
    let active = true;
    let controller = null;
    let requestInFlight = false;

    if (!projectConfigured) {
      return undefined;
    }

    async function load() {
      if (!active || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      controller = new AbortController();
      setStatus((current) => current === "ready" ? "refreshing" : "loading");

      try {
        const response = await fetch("/api/hubstaff", { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const diagnostics = [
            payload?.error,
            payload?.providerCode ? `Provider code: ${payload.providerCode}` : "",
            payload?.providerErrorCode ? `Provider error code: ${payload.providerErrorCode}` : "",
            payload?.upstreamStatus ? `HTTP ${payload.upstreamStatus}` : "",
          ].filter(Boolean);
          throw new Error(diagnostics.join(" / ") || "Hubstaff data could not be loaded.");
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
  }, [projectConfigured]);

  useEffect(() => {
    let active = true;
    let controller = null;
    let requestInFlight = false;

    if (!data?.configured || !data?.project?.id) return undefined;

    async function loadWorkflow() {
      if (!active || requestInFlight || document.visibilityState === "hidden") return;
      requestInFlight = true;
      controller = new AbortController();
      setWorkflowStatus((current) => current === "ready" ? "refreshing" : "loading");
      try {
        const response = await fetch("/api/hubstaff/workflow", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Hubstaff workflow could not be loaded.");
        if (!active) return;
        setWorkflow(payload);
        setWorkflowError("");
        setWorkflowStatus("ready");
      } catch (workflowLoadError) {
        if (!active || workflowLoadError.name === "AbortError") return;
        setWorkflowError(workflowLoadError.message || "Hubstaff workflow could not be loaded.");
        setWorkflowStatus("error");
      } finally {
        requestInFlight = false;
        controller = null;
      }
    }

    loadWorkflow();
    const intervalId = window.setInterval(loadWorkflow, WORKFLOW_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      controller?.abort();
    };
  }, [data?.configured, data?.project?.id]);

  const value = useMemo(
    () => ({
      clientName,
      data,
      status,
      error,
      projectConfigured,
      workflow,
      workflowStatus,
      workflowError,
    }),
    [
      clientName,
      data,
      error,
      projectConfigured,
      status,
      workflow,
      workflowError,
      workflowStatus,
    ],
  );
  return <HubstaffContext.Provider value={value}>{children}</HubstaffContext.Provider>;
}

function useHubstaff() {
  return useContext(HubstaffContext) || {
    data: null,
    status: "unconfigured",
    error: "",
    clientName: "Client",
    projectConfigured: false,
    workflow: null,
    workflowStatus: "unconfigured",
    workflowError: "",
  };
}

function connectionDetail(status, projectConfigured) {
  if (!projectConfigured || status === "unconfigured") return "Connect a project in Admin";
  if (status === "loading") return "Connecting to Hubstaff";
  if (status === "error") return "Hubstaff is temporarily unavailable";
  return "Live from Hubstaff";
}

export function HubstaffMetrics() {
  const { data, status, projectConfigured, workflow, workflowStatus } = useHubstaff();
  const metrics = useMemo(() => {
    const detail = connectionDetail(status, projectConfigured);
    if (!data?.hours || !data?.project) {
      return [
        { label: "Hours Used This Month", value: EMPTY_VALUE, suffix: "hrs", detail, tone: "blue", icon: "clock" },
        { label: "Hours Remaining", value: EMPTY_VALUE, suffix: "hrs", detail, tone: "orange", icon: "clock" },
        { label: "Hubstaff Project", value: projectConfigured ? "Loading" : "Not connected", detail, tone: "purple", icon: "project" },
        { label: "Task Progress", value: EMPTY_VALUE, detail, tone: "green", icon: "tasks" },
      ];
    }

    const { costBudget, hours, project } = data;
    const showDerivedTime = Boolean(
      costBudget
      && hours.remaining === null
      && Number.isFinite(Number(costBudget.remainingHours)),
    );
    const showCostBudget = Boolean(costBudget && hours.remaining === null && !showDerivedTime);
    const budgetUsed = hours.budgetSpent ?? hours.used;
    const usedProgress = hours.limit && budgetUsed !== null
      ? (budgetUsed / hours.limit) * 100
      : null;
    const workflowColumns = Array.isArray(workflow?.columns) ? workflow.columns : [];
    const activeTasks = workflowColumns
      .filter((column) => column.stage !== "done")
      .reduce((total, column) => total + column.taskCount, 0);
    const reviewTasks = workflowColumns
      .filter((column) => column.stage === "review")
      .reduce((total, column) => total + column.taskCount, 0);
    const budgetLabel = hours.limitSource === "hubstaff_budget_history"
      ? `${titleCase(hours.budgetRecurrence || "current")} Hubstaff budget`
      : `${formatHours(hours.limit)} hr monthly limit`;
    const remainingDetail = hours.limit === null
      ? "No monthly hours limit configured"
      : hours.over > 0
        ? `${formatHours(hours.over)} hrs over the ${budgetLabel}`
        : `${formatHours(budgetUsed)} of ${formatHours(hours.limit)} hrs used / ${budgetLabel}`;
    const projectDetail = costBudget
      ? `${formatMoney(costBudget.spent, costBudget.currency)} of ${formatMoney(costBudget.limit, costBudget.currency)} ${titleCase(costBudget.recurrence || "current")} budget / ${formatMoney(costBudget.remaining, costBudget.currency)} remaining`
      : `${titleCase(project.status)} / Open in Hubstaff`;
    const derivedTime = showDerivedTime
      ? formatRemainingTime(costBudget.remainingHours, costBudget.remainingMinutes)
      : null;
    const secondaryMetric = showDerivedTime ? {
      label: "Hours Remaining",
      value: derivedTime.value,
      suffix: derivedTime.suffix,
      detail: `${formatMoney(costBudget.remaining, costBudget.currency)} remains from the ${formatMoney(costBudget.limit, costBudget.currency)} monthly budget`,
      progress: costBudget.limit ? (costBudget.remaining / costBudget.limit) * 100 : null,
      tone: "orange",
      icon: "clock",
    } : showCostBudget ? {
      label: "Budget Remaining",
      value: formatMoney(costBudget.remaining, costBudget.currency),
      suffix: "",
      detail: `${formatMoney(costBudget.spent, costBudget.currency)} of ${formatMoney(costBudget.limit, costBudget.currency)} ${titleCase(costBudget.recurrence || "current")} budget used`,
      progress: costBudget.limit ? (costBudget.remaining / costBudget.limit) * 100 : null,
      tone: "orange",
      icon: "clock",
    } : {
      label: "Hours Remaining",
      value: formatHours(hours.remaining),
      suffix: hours.remaining === null ? "" : "hrs",
      detail: remainingDetail,
      progress: usedProgress === null ? null : 100 - usedProgress,
      tone: "orange",
      icon: "clock",
    };
    return [
      {
        label: "Hours Used This Month", value: formatHours(hours.used), suffix: "hrs",
        detail: "Tracked from the first of this month through today",
        progress: null, tone: "blue", icon: "clock",
      },
      secondaryMetric,
      {
        label: "Hubstaff Project", value: project.name, href: project.url,
        detail: projectDetail, tone: "purple", icon: "project",
      },
      {
        label: "Current Work",
        value: workflowStatus === "loading" || workflowStatus === "waiting"
          ? "Loading"
          : workflowStatus === "error"
            ? EMPTY_VALUE
            : activeTasks
              ? `${activeTasks} active`
              : "All clear",
        detail: workflowStatus === "error"
          ? "Workflow is temporarily unavailable"
          : reviewTasks
            ? `${reviewTasks} waiting for review`
            : `${workflowColumns.length} workflow stages`,
        progress: null,
        tone: "green", icon: "tasks",
      },
    ];
  }, [data, projectConfigured, status, workflow, workflowStatus]);
  return metrics.map((metric) => <LiveMetricCard metric={metric} key={metric.label} />);
}

export function HubstaffMonthGlance() {
  const { data, status, error, projectConfigured, workflow } = useHubstaff();
  const hours = data?.hours;
  const costBudget = data?.costBudget;
  const activeWorkflowTasks = (workflow?.columns || [])
    .filter((column) => column.stage !== "done")
    .reduce((total, column) => total + column.taskCount, 0);
  const showDerivedTime = Boolean(
    costBudget
    && hours?.remaining === null
    && Number.isFinite(Number(costBudget.remainingHours)),
  );
  const showCostBudget = Boolean(costBudget && hours?.remaining === null && !showDerivedTime);
  const derivedTime = showDerivedTime
    ? formatRemainingTime(costBudget.remainingHours, costBudget.remainingMinutes)
    : null;
  const budgetUsed = hours?.budgetSpent ?? hours?.used;
  const timeUsed = showDerivedTime || showCostBudget
    ? `${Math.round((costBudget.spent / costBudget.limit) * 100)}%`
    : hours?.limit && budgetUsed !== null
      ? `${Math.round((budgetUsed / hours.limit) * 100)}%`
      : EMPTY_VALUE;
  const budgetUsageLabel = showDerivedTime || showCostBudget
    ? `${titleCase(costBudget.recurrence || "Current")} Cost Budget Used`
    : hours?.limitSource === "hubstaff_budget_history"
      ? `${titleCase(hours.budgetRecurrence || "Current")} Hours Budget Used`
      : "Monthly Hours Limit Used";
  const refreshed = formatTimestamp(data?.source?.fetchedAt);

  return (
    <section className={styles.card} aria-labelledby="time-overview-title">
      <header className={styles.cardHeader}>
        <span><MetricIcon name="clock" /></span>
        <h2 id="time-overview-title">This Month at a Glance</h2>
        {refreshed ? <small className={styles.liveBadge}>Updated {refreshed}</small> : null}
      </header>
      <div className={styles.glanceStats}>
        <div><strong>{formatHours(hours?.used)}</strong><span>Hours Used</span></div>
        <div>
          <strong>
            {showDerivedTime
              ? `${derivedTime.value} ${derivedTime.suffix}`
              : showCostBudget
                ? formatMoney(costBudget.remaining, costBudget.currency)
                : formatHours(hours?.remaining)}
          </strong>
          <span>{showCostBudget ? "Budget Remaining" : "Hours Remaining"}</span>
        </div>
        <div><strong>{timeUsed}</strong><span>{budgetUsageLabel}</span></div>
        <div><strong>{workflow ? activeWorkflowTasks : EMPTY_VALUE}</strong><span>Active Workflow Tasks</span></div>
      </div>
      {!data ? (
        <p className={status === "error" ? styles.liveWarning : styles.liveEmpty}>
          {connectionDetail(status, projectConfigured)}.
          {error ? <><br /><small>{error}</small></> : null}
        </p>
      ) : null}
      {data?.source?.partial || data?.source?.tasksLimited || data?.source?.activityLimited || (data && error) ? (
        <p className={styles.liveWarning}>
          {data?.source?.tasksLimited
            ? "Hubstaff returned the first 100 tasks. Summary figures reflect those tasks."
            : data?.source?.activityLimited
              ? "Hubstaff returned the first 100 daily activity rows. The hours total may be incomplete."
            : "Some Hubstaff data could not be refreshed. The portal will retry automatically."}
          {error ? <><br /><small>{error}</small></> : null}
        </p>
      ) : null}
    </section>
  );
}

export function HubstaffProjectProgress() {
  const {
    data,
    status,
    error,
    projectConfigured,
    workflow,
    workflowStatus,
    workflowError,
  } = useHubstaff();
  const [openColumnId, setOpenColumnId] = useState("");
  const [columnTasks, setColumnTasks] = useState({});
  const columns = Array.isArray(workflow?.columns) ? workflow.columns : [];
  const activeCount = columns
    .filter((column) => column.stage !== "done")
    .reduce((total, column) => total + column.taskCount, 0);
  const maxColumnCount = Math.max(
    1,
    ...columns.filter((column) => column.stage !== "done").map((column) => column.taskCount),
  );
  const showLiveProject = Boolean(data?.configured);

  async function toggleColumn(column) {
    if (openColumnId === column.id) {
      setOpenColumnId("");
      return;
    }
    setOpenColumnId(column.id);
    const existing = columnTasks[column.id];
    if (existing?.status === "ready" || existing?.status === "loading") return;

    setColumnTasks((current) => ({
      ...current,
      [column.id]: { status: "loading", tasks: [], error: "", source: null },
    }));
    try {
      const response = await fetch(`/api/hubstaff/tasks?listId=${encodeURIComponent(column.id)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Tasks could not be loaded.");
      setColumnTasks((current) => ({
        ...current,
        [column.id]: {
          status: "ready",
          tasks: Array.isArray(payload?.tasks) ? payload.tasks : [],
          error: "",
          source: payload?.source || null,
        },
      }));
    } catch (taskLoadError) {
      setColumnTasks((current) => ({
        ...current,
        [column.id]: {
          status: "error",
          tasks: [],
          error: taskLoadError.message || "Tasks could not be loaded.",
          source: null,
        },
      }));
    }
  }

  return (
    <section className={styles.card} aria-labelledby="projects-title">
      <header className={styles.cardHeader}>
        <span><MetricIcon name="tasks" /></span>
        <h2 id="projects-title">Project Progress</h2>
        {showLiveProject ? <small className={styles.liveBadge}>Live workflow</small> : null}
      </header>

      {showLiveProject ? (
        <>
          <div className={styles.liveProjectMeta}>
            <div>
              <a className={styles.liveProjectTitle} href={data.project.url} target="_blank" rel="noreferrer">
                {data.project.name}
              </a>
              <span>
                {workflowStatus === "ready" || workflowStatus === "refreshing"
                  ? `${activeCount} active tasks across ${columns.length} workflow stages`
                  : "Loading the latest workflow stages"}
              </span>
            </div>
            <a href={data.project.url} target="_blank" rel="noreferrer">Open Hubstaff</a>
          </div>
          {workflowStatus === "loading" || workflowStatus === "waiting" ? (
            <div className={styles.workflowSkeleton} aria-label="Loading workflow">
              {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
            </div>
          ) : null}
          {workflowStatus === "error" ? (
            <p className={styles.liveWarning}>{workflowError}</p>
          ) : null}
          {columns.length ? (
            <div className={styles.workflowAccordion}>
              {columns.map((column) => {
                const isOpen = openColumnId === column.id;
                const taskState = columnTasks[column.id];
                const loadedCount = taskState?.status === "ready" ? taskState.tasks.length : null;
                const isDone = column.stage === "done";
                const displayedCount = isDone
                  ? loadedCount === null ? "Load this month" : `${loadedCount} this month`
                  : `${column.taskCount} ${column.taskCount === 1 ? "task" : "tasks"}`;
                const progress = isDone
                  ? loadedCount === null ? 0 : Math.min(100, (loadedCount / maxColumnCount) * 100)
                  : Math.min(100, (column.taskCount / maxColumnCount) * 100);
                const panelId = `hubstaff-column-${column.id}`;
                return (
                  <section className={`${styles.workflowGroup} ${styles[`workflow_${column.stage}`] || ""}`} key={column.id}>
                    <button
                      aria-controls={panelId}
                      aria-expanded={isOpen}
                      className={styles.workflowRow}
                      onClick={() => toggleColumn(column)}
                      type="button"
                    >
                      <span className={styles.workflowIcon}><StageIcon stage={column.stage} /></span>
                      <span className={styles.workflowCopy}>
                        <strong>{column.name}</strong>
                        <small>{displayedCount}</small>
                        <i><b style={{ width: `${progress}%` }} /></i>
                      </span>
                      <span className={styles.workflowChevron} aria-hidden="true">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen ? (
                      <div className={styles.workflowPanel} id={panelId}>
                        {taskState?.status === "loading" ? (
                          <div className={styles.taskLoading} role="status">
                            <i /><i /><i />
                            <span>Loading {column.name} tasks…</span>
                          </div>
                        ) : null}
                        {taskState?.status === "error" ? (
                          <div className={styles.workflowTaskError}>
                            <span>{taskState.error}</span>
                            <button type="button" onClick={() => {
                              setColumnTasks((current) => ({ ...current, [column.id]: undefined }));
                              setOpenColumnId("");
                            }}>Close and retry</button>
                          </div>
                        ) : null}
                        {taskState?.status === "ready" && !taskState.tasks.length ? (
                          <p className={styles.workflowEmpty}>
                            {isDone ? "No tasks were completed in this column this month." : "No active tasks in this column."}
                          </p>
                        ) : null}
                        {taskState?.status === "ready" && taskState.tasks.length ? (
                          <div className={styles.workflowTasks}>
                            {taskState.tasks.map((task) => (
                              <a href={task.href || data.project.url} key={task.id} target="_blank" rel="noreferrer">
                                <span className={styles.taskCardIcon}><StageIcon stage={column.stage} /></span>
                                <span>
                                  <strong>{task.title}</strong>
                                  <small>
                                    {task.doneAt
                                      ? `Completed ${formatTimestamp(task.doneAt)}`
                                      : task.dueAt
                                        ? `Due ${formatTimestamp(task.dueAt)}`
                                        : column.name}
                                  </small>
                                </span>
                                <b>Open task <span aria-hidden="true">↗</span></b>
                              </a>
                            ))}
                            {taskState.source?.truncated ? (
                              <p className={styles.workflowNotice}>More tasks are available in Hubstaff.</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : null}
          {columns.length ? (
            <div className={styles.taskAssistantPrompt}>
              <span><MetricIcon name="tasks" /></span>
              <div>
                <strong>Need the full story?</strong>
                <small>Ask AOC-GPT to summarize progress, blockers, or completed work.</small>
              </div>
              <a href="#ai-assistant">Ask AOC-GPT</a>
            </div>
          ) : null}
          {data.source?.partial || data.source?.activityLimited || error ? (
            <p className={styles.liveWarning}>
              Some Hubstaff data could not be refreshed. It will retry automatically.
              {error ? <><br /><small>{error}</small></> : null}
            </p>
          ) : null}
        </>
      ) : (
        <p className={status === "error" ? styles.liveWarning : styles.liveEmpty}>
          {connectionDetail(status, projectConfigured)}.
          {error ? <><br /><small>{error}</small></> : null}
        </p>
      )}
    </section>
  );
}
