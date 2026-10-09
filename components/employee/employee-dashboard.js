'use client';

import { useEffect, useState } from 'react';
import { useEmployeeWorkspace } from './employee-workspace-provider';
import { dueState, selectEmployeeTasks } from '@/lib/employee-view';
import styles from './employee-dashboard.module.css';

const DEFAULT_TASKS_PER_PAGE = 10;
const PAGE_SIZE_OPTIONS = [10, 30, 50];
function displayDate(value) {
  if (!value) return 'No due date';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
}

function displayShortDate(value) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}

function displayDateRange(start, stop) {
  const first = displayShortDate(start);
  const last = displayShortDate(stop);
  return first && last ? `${first} – ${last}` : 'Current work week';
}

function displayHours(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`;
}

function displayPercent(value) {
  return Number.isFinite(value) ? `${value.toLocaleString()}%` : '—';
}

function isUrgentTask(task) {
  return task.priority?.level === 'urgent';
}

function attentionRank(task, now) {
  const due = dueState(task, now);
  if (due === 'overdue') return 0;
  if (isUrgentTask(task)) return 1;
  return 2;
}

function attentionDetails(task, now) {
  const details = [task.projectName];
  const due = dueState(task, now);
  if (isUrgentTask(task)) details.push('Urgent');
  if (due === 'overdue') details.push('Overdue');
  else if (due === 'soon') details.push('Due soon');
  else if (task.dueAt) details.push('Due');
  if (task.dueAt) details.push(displayDate(task.dueAt));
  return details.join(' · ');
}

function localDateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayPlanStorageKey(name, now) {
  return `aoc-employee-today-plan:${encodeURIComponent(name)}:${localDateKey(now)}`;
}

function previousDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() - 1, 12);
}

function uniqueStringIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : [];
}

function normalizeStoredPlan(value) {
  if (Array.isArray(value)) return { taskIds: uniqueStringIds(value), workingTaskId: '', completedTaskIds: [], carryOverHandled: false };
  if (!value || typeof value !== 'object') return { taskIds: [], workingTaskId: '', completedTaskIds: [], carryOverHandled: false };
  return {
    taskIds: uniqueStringIds(value.taskIds),
    workingTaskId: typeof value.workingTaskId === 'string' ? value.workingTaskId : '',
    completedTaskIds: uniqueStringIds(value.completedTaskIds),
    carryOverHandled: value.carryOverHandled === true,
  };
}

export default function EmployeeDashboard({ name, position, panelAccess = [], workspace = 'personal', connected, connectionMessage, children }) {
  const panels = new Set(panelAccess);
  const isPersonal = workspace === 'personal';
  const isTeam = workspace === 'team';
  const isSettings = workspace === 'settings';
  const canOverview = panels.has('overview');
  const canViewTasks = panels.has('my_tasks');
  const canViewActivity = panels.has('activity');
  const canViewTeam = panels.has('team_directory');
  const canViewTeamTasks = panels.has('team_tasks');
  const canConnectHubstaff = panels.has('hubstaff');
  const shouldLoadDashboard = isSettings
    || (isPersonal && connected)
    || (isTeam && (canViewTeam || canViewTeamTasks));
  const { data, busy, error } = useEmployeeWorkspace(workspace, { enabled: shouldLoadDashboard });
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('created');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TASKS_PER_PAGE);
  const [expandedTaskId, setExpandedTaskId] = useState('');
  const [todayTaskIds, setTodayTaskIds] = useState([]);
  const [workingTaskId, setWorkingTaskId] = useState('');
  const [completedTodayTaskIds, setCompletedTodayTaskIds] = useState([]);
  const [carryOverTaskIds, setCarryOverTaskIds] = useState([]);
  const [carryOverHandled, setCarryOverHandled] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState('');
  const [todoDropActive, setTodoDropActive] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [guidanceById, setGuidanceById] = useState({});
  const [guidanceError, setGuidanceError] = useState(null);
  const [guidanceRetry, setGuidanceRetry] = useState(0);
  const planStorageKey = todayPlanStorageKey(name, now);
  const previousPlanStorageKey = todayPlanStorageKey(name, previousDay(now));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let storedPlan = normalizeStoredPlan(null);
      let previousTaskIds = [];
      try {
        storedPlan = normalizeStoredPlan(JSON.parse(window.localStorage.getItem(planStorageKey) || 'null'));
        if (!storedPlan.carryOverHandled) {
          previousTaskIds = normalizeStoredPlan(JSON.parse(window.localStorage.getItem(previousPlanStorageKey) || 'null')).taskIds;
        }
      } catch { /* Start with a clean daily plan when browser storage is unavailable or invalid. */ }
      setTodayTaskIds(storedPlan.taskIds);
      setWorkingTaskId(storedPlan.workingTaskId);
      setCompletedTodayTaskIds(storedPlan.completedTaskIds);
      setCarryOverTaskIds(previousTaskIds);
      setCarryOverHandled(storedPlan.carryOverHandled);
      setLoadedPlanKey(planStorageKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [planStorageKey, previousPlanStorageKey]);
  useEffect(() => {
    if (loadedPlanKey !== planStorageKey) return;
    try {
      window.localStorage.setItem(planStorageKey, JSON.stringify({
        taskIds: todayTaskIds, workingTaskId, completedTaskIds: completedTodayTaskIds, carryOverHandled,
      }));
    }
    catch { /* The daily plan still works for this page session when storage is unavailable. */ }
  }, [carryOverHandled, completedTodayTaskIds, loadedPlanKey, planStorageKey, todayTaskIds, workingTaskId]);
  const tasks = data?.tasks || [];
  const active = tasks.filter(task => !task.done);
  const filteredTasks = selectEmployeeTasks(tasks, { search, project, status, sort, direction: sortDirection }, now);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visible = filteredTasks.slice(pageStart, pageStart + pageSize);
  const visibleActiveIds = visible.filter(task => !task.done).map(task => task.id).join(',');
  const guidanceRunKey = `${data?.syncedAt || ''}:${visibleActiveIds}`;
  const activeGuidanceError = guidanceError?.key === guidanceRunKey ? guidanceError.message : '';
  const guidancePending = Boolean(data?.syncedAt && visibleActiveIds && !activeGuidanceError
    && visible.some(task => !task.done && guidanceById[task.id]?.syncedAt !== data.syncedAt));
  useEffect(() => {
    if (!isPersonal || !canViewTasks || !data?.syncedAt || !visibleActiveIds) return;
    const controller = new AbortController();
    const ids = visibleActiveIds.split(',');
    const timer = window.setTimeout(async () => {
      setGuidanceError(null);
      try {
        for (let start = 0; start < ids.length; start += 6) {
          const batch = ids.slice(start, start + 6);
          const response = await fetch('/api/employee/task-guidance', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds: batch }),
            credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          });
          if (!response.ok) throw new Error('AI task suggestions are unavailable.');
          const result = await response.json();
          if (!Array.isArray(result.guidance)
            || batch.some(id => !result.guidance.some(item => item.taskId === id))) {
            throw new Error('AI task suggestions are unavailable.');
          }
          if (!controller.signal.aborted) setGuidanceById(current => ({ ...current,
            ...Object.fromEntries(result.guidance.map(item => [item.taskId, { ...item, syncedAt: data.syncedAt }])),
          }));
        }
      } catch {
        if (!controller.signal.aborted) setGuidanceError({ key: guidanceRunKey,
          message: 'AI analysis is unavailable. Review task comments in Hubstaff before acting.' });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canViewTasks, data?.syncedAt, guidanceRetry, guidanceRunKey, isPersonal, visibleActiveIds]);
  const recent = [...tasks].filter(task => task.updatedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const completed = tasks.filter(task => task.done && task.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 4);
  const needsAttention = active.filter(task => isUrgentTask(task) || ['overdue', 'soon'].includes(dueState(task, now)))
    .sort((a, b) => attentionRank(a, now) - attentionRank(b, now)
      || (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity)).slice(0, 5);
  const workSummary = data?.workSummary;
  const activeTaskIds = new Set(active.map(task => task.id));
  const todayTasks = todayTaskIds.map(taskId => tasks.find(task => task.id === taskId)).filter(task => task && !task.done);
  const completedTodayTasks = completedTodayTaskIds.map(taskId => tasks.find(task => task.id === taskId)).filter(Boolean);
  const eligibleCarryOverIds = carryOverTaskIds.filter(taskId => activeTaskIds.has(taskId)
    && !todayTaskIds.includes(taskId) && !completedTodayTaskIds.includes(taskId));
  const addToToday = taskId => {
    setCompletedTodayTaskIds(current => current.filter(id => id !== taskId));
    setTodayTaskIds(current => current.includes(taskId) ? current : [...current, taskId]);
  };
  const removeFromToday = taskId => {
    setTodayTaskIds(current => current.filter(id => id !== taskId));
    setWorkingTaskId(current => current === taskId ? '' : current);
  };
  const completeTodayTask = taskId => {
    setTodayTaskIds(current => current.filter(id => id !== taskId));
    setCompletedTodayTaskIds(current => current.includes(taskId) ? current : [...current, taskId]);
    setWorkingTaskId(current => current === taskId ? '' : current);
  };
  const restoreTodayTask = taskId => {
    if (!activeTaskIds.has(taskId)) return;
    setCompletedTodayTaskIds(current => current.filter(id => id !== taskId));
    setTodayTaskIds(current => current.includes(taskId) ? current : [...current, taskId]);
  };
  const addCarryOverTasks = () => {
    setTodayTaskIds(current => [...current, ...eligibleCarryOverIds.filter(id => !current.includes(id))]);
    setCarryOverTaskIds([]);
    setCarryOverHandled(true);
  };
  const dismissCarryOver = () => { setCarryOverTaskIds([]); setCarryOverHandled(true); };
  const clearTodayPlan = () => {
    setTodayTaskIds([]);
    setWorkingTaskId('');
    setCompletedTodayTaskIds([]);
    setCarryOverTaskIds([]);
    setCarryOverHandled(true);
  };
  const moveTodayTask = (taskId, offset) => setTodayTaskIds(current => {
    const visibleIds = current.filter(id => activeTaskIds.has(id));
    const from = visibleIds.indexOf(taskId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= visibleIds.length) return current;
    [visibleIds[from], visibleIds[to]] = [visibleIds[to], visibleIds[from]];
    let visibleIndex = 0;
    return current.map(id => activeTaskIds.has(id) ? visibleIds[visibleIndex++] : id);
  });
  const dropTodayTask = (event, beforeTaskId = '') => {
    event.preventDefault();
    event.stopPropagation();
    const taskId = event.dataTransfer.getData('application/x-aoc-task-id') || event.dataTransfer.getData('text/plain');
    if (!active.some(task => task.id === taskId) || taskId === beforeTaskId) {
      setTodoDropActive(false);
      return;
    }
    setTodayTaskIds(current => {
      const next = current.filter(id => id !== taskId);
      const targetIndex = beforeTaskId ? next.indexOf(beforeTaskId) : -1;
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, taskId);
      return next;
    });
    setCompletedTodayTaskIds(current => current.filter(id => id !== taskId));
    setTodoDropActive(false);
    setDraggedTaskId('');
  };
  const counts = [
    ['active', 'Assigned to me', active.length],
    ['in_progress', 'In progress', active.filter(task => task.stage === 'in_progress').length],
    ['soon', 'Due in 3 days', active.filter(task => dueState(task, now) === 'soon').length],
    ['overdue', 'Overdue', active.filter(task => dueState(task, now) === 'overdue').length],
  ];
  const workspaceCopy = isTeam
    ? { title: 'Your team, in view.', detail: 'Review the people and team tools available to your position.' }
    : isSettings
      ? { title: 'Connections & settings.', detail: 'Manage the services connected to your employee workspace.' }
      : { title: 'Your work, in focus.', detail: 'Review your own assignments, priorities, and recent activity.' };

  return <main className={styles.main}>
    <section className={styles.intro}>
      <div><p className={styles.eyebrow}>{String(position || 'Team Member').toUpperCase()}</p><h1>{workspaceCopy.title}</h1>
        <p>Welcome, {name}. {workspaceCopy.detail}</p></div>
    </section>
    {connectionMessage && <p className={styles.notice} role="status">{connectionMessage}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {isPersonal && data?.truncated && <p className={styles.notice}>Showing a limited snapshot of your work. Some tasks or projects may be missing; counts reflect only this snapshot.</p>}
    {isPersonal && canOverview && <><section className={styles.stats} aria-label="My task counts">
      {counts.map(([key, title, count]) => <button key={key} type="button" onClick={() => { setStatus(key); setPage(1); }} aria-pressed={status === key}>
        <span>{title}</span><strong>{busy || !data ? '—' : count}</strong><small>View tasks →</small>
      </button>)}
    </section>
    <div className={styles.focusGrid}>
      <section className={styles.panel} aria-labelledby="week-title">
        <div className={styles.sectionHeading}><div><h2 id="week-title">Time & Activity</h2><p>Your tracked time and activity rate.</p></div>
          {workSummary?.timePartial && <span className={styles.readOnly}>Partial time data</span>}</div>
        <div className={styles.activityGroups}>
          <section className={styles.activityGroup} aria-labelledby="today-activity-title">
            <h3 id="today-activity-title">Today</h3>
            <div className={styles.weekStats}>
              <article><span>Worked Time</span><strong>{busy || !data ? '—' : displayHours(workSummary?.today?.trackedHours)}</strong><small>{workSummary?.timeAvailable === false ? 'Time data unavailable' : workSummary?.today?.date ? displayDate(workSummary.today.date) : 'Current day'}</small></article>
              <article><span>Avg. Activity</span><strong>{busy || !data ? '—' : displayPercent(workSummary?.today?.activityRate)}</strong><small>Activity rate</small></article>
            </div>
          </section>
          <section className={styles.activityGroup} aria-labelledby="weekly-activity-title">
            <h3 id="weekly-activity-title">This Week</h3>
            <div className={styles.weekStats}>
              <article><span>Worked this Week</span><strong>{busy || !data ? '—' : displayHours(workSummary?.week?.trackedHours)}</strong><small>{workSummary?.week ? displayDateRange(workSummary.week.start, workSummary.week.stop) : 'Current work week'}</small></article>
              <article><span>Weekly Activity</span><strong>{busy || !data ? '—' : displayPercent(workSummary?.week?.activityRate)}</strong><small>Activity rate</small></article>
            </div>
          </section>
        </div>
      </section>
      <section className={styles.panel} aria-labelledby="attention-title">
        <div className={styles.sectionHeading}><div><h2 id="attention-title">Needs attention</h2><p>Urgent priorities and upcoming deadlines.</p></div></div>
        {busy ? <div className={styles.attentionLoading}><i /><i /><i /></div>
          : needsAttention.length ? <ul className={styles.attentionList}>{needsAttention.map(task => {
            return <li key={task.id}><div><strong>{task.title}</strong><span>{attentionDetails(task, now)}</span></div>
              <a href="#assigned-tasks" onClick={() => { setSearch(task.title); setProject(task.projectId); setStatus('all'); setPage(1); setExpandedTaskId(task.id); }}>Review</a></li>;
          })}</ul> : <p className={styles.emptySmall}>Nothing urgent right now.</p>}
      </section>
    </div>
    </>}
    {isPersonal && canViewTasks && <div className={styles.grid}>
      {canViewTasks && <section className={`${styles.panel} ${styles.anchorSection}`} aria-labelledby="assigned-title" aria-busy={busy || guidancePending} id="assigned-tasks">
        <div className={styles.sectionHeading}><div><h2 id="assigned-title">My Assigned Tasks</h2><p>Your personal task list. Changes are managed in Hubstaff.</p></div>
          <span className={styles.readOnly}>Read only</span></div>
        {guidancePending && <p className={styles.guidanceProgress} role="status">Analyzing task conversations before showing recommendations…</p>}
        {activeGuidanceError && <p className={styles.guidanceError} role="status">{activeGuidanceError} <button type="button" onClick={() => { setGuidanceError(null); setGuidanceRetry(value => value + 1); }}>Retry analysis</button></p>}
        <div className={styles.filters}>
          <label className={styles.search}>Search tasks<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search tasks or projects" /></label>
          <label>Project<select aria-label="Project" value={project} onChange={event => { setProject(event.target.value); setPage(1); }}><option value="all">All projects ({active.length})</option>
            {(data?.projects || []).map(item => <option key={item.id} value={item.id}>{item.name} ({active.filter(task => task.projectId === item.id).length})</option>)}</select></label>
          <label>Status<select aria-label="Status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="active">Active tasks</option><option value="all">All tasks</option><option value="in_progress">In progress</option>
            <option value="soon">Due soon</option><option value="overdue">Overdue</option><option value="done">Completed</option></select></label>
          <label>Sort<select aria-label="Sort" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="created">Created date</option><option value="updated">Updated date</option><option value="due">Due date</option></select></label>
          <label>Order<select aria-label="Sort direction" value={sortDirection} onChange={event => { setSortDirection(event.target.value); setPage(1); }}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        </div>
        {busy ? <div className={styles.skeleton} role="status"><span className="sr-only">Loading your assigned tasks</span><i /><i /><i /></div>
          : !connected ? <div className={styles.empty}><h3>Bring your work together</h3><p>Connect your approved Hubstaff account to see your personal assignments.</p></div>
            : error ? <div className={styles.empty}><h3>Work is temporarily unavailable</h3><p>Check the connection message above, then refresh.</p></div>
              : !visible.length ? <div className={styles.empty}><h3>{tasks.length ? 'No tasks match these filters' : 'No assigned tasks yet'}</h3><p>{tasks.length ? 'Try another search, project, or status.' : 'Your assignments will appear here after they are added in Hubstaff.'}</p></div>
                : <ul className={styles.tasks}>{visible.map(task => {
                  const due = dueState(task, now);
                  const expanded = expandedTaskId === task.id;
                  const plannedToday = todayTaskIds.includes(task.id);
                  const detailsId = `employee-task-details-${task.id}`;
                  const dueLabel = due === 'overdue' ? 'Overdue' : due === 'soon' ? 'Due soon' : 'Due';
                  const dueStyle = due === 'overdue' ? styles.dueOverdue : due === 'soon' ? styles.dueSoon : styles.dueDefault;
                  const guidance = guidanceById[task.id]?.syncedAt === data?.syncedAt ? guidanceById[task.id] : null;
                  const guidanceLabel = guidance?.label && guidance?.badgeText;
                  if (!task.done && !guidance && !activeGuidanceError) {
                    return <li key={task.id} className={styles.taskAnalysisPlaceholder} role="status">
                      <span>Analyzing task conversation…</span>
                    </li>;
                  }
                  const badgeLabel = task.done ? 'Completed' : guidanceLabel || 'Analysis unavailable';
                  const badgeStyle = task.done || guidance?.label === 'review_for_close' ? styles.finished
                    : ['needs_reply', 'urgent_work'].includes(guidance?.label) ? styles.guidanceAction
                      : guidanceLabel ? styles.guidanceBadge : styles.todo;
                  return <li key={task.id} className={`${!task.done ? styles.draggableTask : ''} ${draggedTaskId === task.id ? styles.draggingTask : ''}`}
                    draggable={!task.done} onDragStart={event => {
                      event.dataTransfer.effectAllowed = plannedToday ? 'move' : 'copy';
                      event.dataTransfer.setData('application/x-aoc-task-id', task.id);
                      event.dataTransfer.setData('text/plain', task.id);
                      setDraggedTaskId(task.id);
                    }} onDragEnd={() => { setDraggedTaskId(''); setTodoDropActive(false); }}><div className={styles.taskRow}>
                    <div className={styles.taskMain}><h3>{task.title}</h3><div className={styles.taskContext}><p>{task.projectName}</p>
                      {task.priority && <span className={`${styles.priority} ${styles[`priority_${task.priority.level}`] || ''}`} aria-label={`Priority: ${task.priority.name}`}>{task.priority.name}</span>}</div>
                      {!task.done && !guidanceLabel && guidance?.reason && <p className={styles.guidanceWarning}>{guidance.reason}</p>}
                    </div>
                    <div className={styles.taskMeta}>
                      <span className={`${styles.badge} ${!task.done && guidanceLabel ? styles.guidanceBadge : ''} ${badgeStyle}`}
                        aria-label={task.done ? 'Hubstaff status: Completed' : guidanceLabel ? `AI next action: ${badgeLabel}` : 'AI analysis unavailable'}
                        title={guidance?.reason || (task.done ? 'Hubstaff marks this task completed.' : 'Check task comments in Hubstaff before acting.')}>{badgeLabel}</span>
                      {task.dueAt && <div className={`${styles.taskDue} ${dueStyle}`} aria-label={`Due date: ${dueLabel}, ${displayDate(task.dueAt)}`}>
                        <small>{dueLabel}</small><span aria-hidden="true">—</span><span>{displayDate(task.dueAt)}</span></div>}
                      {!task.done && <button className={styles.taskPlanButton} type="button" disabled={plannedToday} onClick={() => addToToday(task.id)}>{plannedToday ? 'In today’s plan' : 'Add to today’s plan'}</button>}
                      <button className={styles.taskDetailsButton} type="button" aria-controls={detailsId} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'View'} details for ${task.title}`} onClick={() => setExpandedTaskId(expanded ? '' : task.id)}>{expanded ? 'Hide details' : 'Details'}</button>
                    </div>
                  </div>
                    {expanded && <div className={styles.taskDetails} id={detailsId} role="region" aria-label={`${task.title} details`}>
                      <p>{task.description || 'No task description was provided.'}</p>
                      {guidance?.reason && <p className={styles.guidanceReason}>{guidance.label ? 'AI suggestion' : 'Analysis unavailable'}: {guidance.reason} {guidance.label && 'Verify in Hubstaff before replying or closing.'}</p>}
                      <dl><div><dt>Project</dt><dd>{task.projectName}</dd></div><div><dt>Status</dt><dd>{task.status}</dd></div>
                        <div><dt>Created</dt><dd>{task.createdAt ? displayDate(task.createdAt) : 'Not available'}</dd></div>
                        <div><dt>Updated</dt><dd>{task.updatedAt ? displayDate(task.updatedAt) : 'Not available'}</dd></div>
                        <div><dt>Due</dt><dd>{displayDate(task.dueAt)}</dd></div></dl>
                      {task.href && <a href={task.href} target="_blank" rel="noreferrer">Open in Hubstaff <span aria-hidden="true">↗</span></a>}
                    </div>}
                  </li>;
                })}</ul>}
        {data && !busy && <div className={styles.listFooter}>
          <p>{filteredTasks.length ? `Showing ${pageStart + 1}-${pageStart + visible.length} of ${filteredTasks.length} matching tasks` : 'No matching tasks'}</p>
          <div className={styles.pageControls}>
            <label className={styles.pageSize}>Tasks per page
              <select aria-label="Tasks per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
                {PAGE_SIZE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            {pageCount > 1 && <nav className={styles.pagination} aria-label="Assigned task pages">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
              <span>Page {currentPage} of {pageCount}</span>
              <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
            </nav>}
          </div>
        </div>}
      </section>}
      <aside className={styles.sidebar}>
        {canViewTasks && <section className={`${styles.panel} ${styles.todoPanel}`} aria-labelledby="today-plan-title"
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = todayTaskIds.includes(draggedTaskId) ? 'move' : 'copy'; setTodoDropActive(true); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTodoDropActive(false); }}
          onDrop={event => dropTodayTask(event)}>
          <div className={styles.sectionHeading}><div><p className={styles.todoEyebrow}>TODAY’S PLAN</p><h2 id="today-plan-title">To Do</h2><p>Drag active tasks here and arrange the order you’ll tackle them.</p></div>
            <span className={styles.todoCount}>{todayTasks.length}</span></div>
          {eligibleCarryOverIds.length > 0 && <div className={styles.carryOverPrompt} role="status">
            <strong>Continue yesterday’s plan?</strong>
            <p>{eligibleCarryOverIds.length} unfinished {eligibleCarryOverIds.length === 1 ? 'task is' : 'tasks are'} still available.</p>
            <div><button type="button" onClick={addCarryOverTasks}>Add to today’s plan</button><button type="button" onClick={dismissCarryOver}>Not today</button></div>
          </div>}
          <div className={`${styles.todoDropZone} ${todoDropActive ? styles.todoDropActive : ''}`}>
            {todayTasks.length ? <ol className={styles.todoList}>{todayTasks.map((task, index) => <li key={task.id} draggable className={workingTaskId === task.id ? styles.todoCurrent : ''}
              onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-aoc-task-id', task.id); event.dataTransfer.setData('text/plain', task.id); setDraggedTaskId(task.id); }}
              onDragEnd={() => { setDraggedTaskId(''); setTodoDropActive(false); }}
              onDragOver={event => { event.preventDefault(); event.stopPropagation(); }} onDrop={event => dropTodayTask(event, task.id)}>
              <span className={styles.todoSequence} aria-hidden="true">{index + 1}</span>
              <div className={styles.todoTaskCopy}><strong>{task.title}</strong><span>{workingTaskId === task.id ? 'Working now' : task.projectName}</span></div>
              <div className={styles.todoItemControls}>
                <button className={`${styles.todoFocusButton} ${workingTaskId === task.id ? styles.todoFocusActive : ''}`} type="button"
                  onClick={() => setWorkingTaskId(current => current === task.id ? '' : task.id)}
                  aria-label={workingTaskId === task.id ? `Stop working on ${task.title}` : `Start working on ${task.title}`}>{workingTaskId === task.id ? 'Working now' : 'Start'}</button>
                <div className={styles.todoActions}>
                <button type="button" disabled={index === 0} onClick={() => moveTodayTask(task.id, -1)} aria-label={`Move ${task.title} up`}>↑</button>
                <button type="button" disabled={index === todayTasks.length - 1} onClick={() => moveTodayTask(task.id, 1)} aria-label={`Move ${task.title} down`}>↓</button>
                <button className={styles.todoDoneButton} type="button" onClick={() => completeTodayTask(task.id)} aria-label={`Mark ${task.title} done today`}>✓</button>
                <button type="button" onClick={() => removeFromToday(task.id)} aria-label={`Remove ${task.title} from today`}>×</button>
                </div>
              </div>
            </li>)}</ol> : <div className={styles.todoEmpty}><span aria-hidden="true">＋</span><strong>Build today’s sequence</strong><p>Drag a task from the list or use “Add to today’s plan.”</p></div>}
          </div>
          {completedTodayTasks.length > 0 && <section className={styles.doneToday} aria-labelledby="done-today-title">
            <div><h3 id="done-today-title">Done today</h3><span>{completedTodayTasks.length}</span></div>
            <ul>{completedTodayTasks.map(task => <li key={task.id}><span aria-hidden="true">✓</span><div><strong>{task.title}</strong><small>{task.projectName}</small></div>
              {activeTaskIds.has(task.id) && <button type="button" onClick={() => restoreTodayTask(task.id)}>Undo</button>}</li>)}</ul>
          </section>}
          <div className={styles.todoFooter}><p className={styles.todoStorageNote}>Saved in this browser for today only.</p>
            {(todayTaskIds.length > 0 || completedTodayTaskIds.length > 0) && <button type="button" onClick={clearTodayPlan}>Clear plan</button>}</div>
        </section>}
      </aside>
    </div>}
    {isSettings && canConnectHubstaff && <div className={`${styles.grid} ${styles.singleColumnGrid}`}>
      <section className={`${styles.panel} ${styles.settingsPanel}`} id="hubstaff-connection">
        <div className={styles.sectionHeading}><div><h2>Hubstaff connection</h2><p>Connect the approved personal account used for your work data.</p></div>
          <span className={data?.connection.connected && !error ? styles.connectionReady : styles.connectionPending}>
            {data?.connection.connected && !error ? 'Connected' : 'Setup needed'}
          </span></div>
        <p className={styles.health}><span className={data?.connection.connected && !error ? styles.healthy : styles.pending} />{busy ? 'Checking connection…' : error ? 'Needs attention' : data?.connection.connected ? 'Connected and ready' : connected ? 'Ready to verify' : 'Not connected'}</p>
        <p>{data?.connection.name || 'Your approved personal Hubstaff account'}</p>
        <small>{data?.syncedAt ? `Last synchronized ${new Date(data.syncedAt).toLocaleString()}` : 'No successful synchronization recorded yet.'}</small>
        {children}
      </section>
    </div>}
    {isTeam && (canViewTeam || canViewTeamTasks) && <div className={`${styles.bottomGrid} ${canViewTeam !== canViewTeamTasks ? styles.singleColumnGrid : ''}`}>
      {canViewTeam && <section className={`${styles.panel} ${styles.anchorSection}`} id="team-directory">
        <div className={styles.sectionHeading}><div><h2>Team directory</h2><p>Active employees and their current portal positions.</p></div>
          <span className={styles.readOnly}>{data?.teamMembers?.length || 0} active</span></div>
        {busy && !data ? <div className={styles.skeleton} role="status"><span className="sr-only">Loading team directory</span><i /><i /></div>
          : data?.teamMembers?.length ? <ul className={styles.teamMembers}>{data.teamMembers.map(member => <li key={member.id}>
            <span>{member.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
            <div><strong>{member.name}</strong><small>{member.position}</small></div>
            <b className={member.connected ? styles.teamConnected : styles.teamPending}>{member.connected ? 'Connected' : 'Setup needed'}</b>
          </li>)}</ul> : <p className={styles.emptySmall}>No active employees are available.</p>}
      </section>}
      {canViewTeamTasks && <section className={`${styles.panel} ${styles.anchorSection}`} id="team-tasks">
        <div className={styles.sectionHeading}><div><h2>Team tasks</h2><p>Organization-wide task status and assignment.</p></div><span className={styles.plannedBadge}>Planned</span></div>
        <div className={styles.stagedPanel}><strong>Access is reserved for this position</strong>
          <p>Team task reads and assignment actions will be enabled when an organization-level Hubstaff workflow is configured. Personal employee tokens are never combined here.</p></div>
      </section>}
    </div>}
    {isPersonal && canViewActivity && <div className={styles.bottomGrid} id="activity">
      <section className={`${styles.panel} ${styles.anchorSection}`}><h2>Recent task activity</h2><p>Latest updates to your assigned tasks.</p>
        {recent.length ? <ul className={styles.activity}>{recent.map(task => <li key={task.id}><div><strong>{task.title}</strong><span>{task.projectName} · {task.status}</span></div><time>{displayDate(task.updatedAt)}</time></li>)}</ul> : <p className={styles.emptySmall}>No recent activity to show.</p>}</section>
      <section className={styles.panel}><h2>Recently completed</h2><p>Your most recent finished assignments.</p>
        {completed.length ? <ul className={styles.activity}>{completed.map(task => <li key={task.id}><div><strong>{task.title}</strong><span>{task.projectName}</span></div><time>{displayDate(task.completedAt)}</time></li>)}</ul> : <p className={styles.emptySmall}>Completed tasks with a completion date appear here.</p>}</section>
    </div>}
  </main>;
}
