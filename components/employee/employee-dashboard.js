'use client';

import { useCallback, useEffect, useState } from 'react';
import { dueState, selectEmployeeTasks } from '@/lib/employee-view';
import styles from './employee-dashboard.module.css';

function displayDate(value) {
  if (!value) return 'No due date';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
}

export default function EmployeeDashboard({ name, connected, connectionMessage, children }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(connected);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('due');
  const [now, setNow] = useState(() => new Date());
  const refresh = useCallback(async (signal) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/employee/dashboard', { cache: 'no-store', signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your work could not be loaded. Please try again.');
      if (!signal?.aborted) { setData(result); setNow(new Date()); }
    } catch (failure) {
      if (!signal?.aborted) {
        setData(null);
        setError(failure.message === 'Failed to fetch' ? 'Connection interrupted. Please try again.' : failure.message);
      }
    } finally { if (!signal?.aborted) setBusy(false); }
  }, []);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => refresh(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [connected, refresh]);
  const tasks = data?.tasks || [];
  const active = tasks.filter(task => !task.done);
  const visible = selectEmployeeTasks(tasks, { search, project, status, sort }, now);
  const recent = [...tasks].filter(task => task.updatedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const completed = tasks.filter(task => task.done && task.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 4);
  const counts = [
    ['active', 'Assigned to me', active.length],
    ['in_progress', 'In progress', active.filter(task => task.stage === 'in_progress').length],
    ['soon', 'Due in 3 days', active.filter(task => dueState(task, now) === 'soon').length],
    ['done', 'Completed', tasks.filter(task => task.done).length],
  ];

  return <main className={styles.main}>
    <section className={styles.intro}>
      <div><p className={styles.eyebrow}>MY WORKSPACE</p><h1>Your work, in focus.</h1>
        <p>Welcome, {name}. Here is the work assigned to you across your projects.</p></div>
      <button className={styles.primary} disabled={busy || !connected} onClick={() => refresh()} type="button">{busy ? 'Refreshing…' : 'Refresh Hubstaff data'}</button>
    </section>
    {connectionMessage && <p className={styles.notice} role="status">{connectionMessage}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {data?.truncated && <p className={styles.notice}>Showing a limited snapshot of your work. Some tasks or projects may be missing; counts reflect only this snapshot.</p>}
    <section className={styles.stats} aria-label="My task counts">
      {counts.map(([key, title, count]) => <button key={key} type="button" onClick={() => setStatus(key)} aria-pressed={status === key}>
        <span>{title}</span><strong>{busy || !data ? '—' : count}</strong><small>View tasks →</small>
      </button>)}
    </section>
    <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="assigned-title" aria-busy={busy}>
        <div className={styles.sectionHeading}><div><h2 id="assigned-title">My Assigned Tasks</h2><p>Your personal task list. Changes are managed in Hubstaff.</p></div>
          <span className={styles.readOnly}>Read only</span></div>
        <div className={styles.filters}>
          <label className={styles.search}>Search tasks<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasks or projects" /></label>
          <label>Project<select aria-label="Project" value={project} onChange={event => setProject(event.target.value)}><option value="all">All projects</option>
            {(data?.projects || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="active">Active tasks</option><option value="all">All tasks</option><option value="in_progress">In progress</option>
            <option value="soon">Due soon</option><option value="overdue">Overdue</option><option value="done">Completed</option></select></label>
          <label>Sort<select aria-label="Sort" value={sort} onChange={event => setSort(event.target.value)}><option value="due">Due date</option><option value="recent">Recent update</option></select></label>
        </div>
        {busy ? <div className={styles.skeleton} role="status"><span className="sr-only">Loading your assigned tasks</span><i /><i /><i /></div>
          : !connected ? <div className={styles.empty}><h3>Bring your work together</h3><p>Connect your approved Hubstaff account to see your personal assignments.</p></div>
            : error ? <div className={styles.empty}><h3>Work is temporarily unavailable</h3><p>Check the connection message above, then refresh.</p></div>
              : !visible.length ? <div className={styles.empty}><h3>{tasks.length ? 'No tasks match these filters' : 'No assigned tasks yet'}</h3><p>{tasks.length ? 'Try another search, project, or status.' : 'Your assignments will appear here after they are added in Hubstaff.'}</p></div>
                : <ul className={styles.tasks}>{visible.map(task => {
                  const due = dueState(task, now);
                  return <li key={task.id}><div className={styles.taskMain}><span className={`${styles.taskMark} ${task.done ? styles.finished : ''}`} aria-hidden="true">{task.done ? '✓' : '·'}</span>
                    <div><h3>{task.title}</h3><p>{task.projectName}</p></div></div>
                    <div className={styles.taskMeta}><span className={`${styles.badge} ${task.done ? styles.finished : task.stage === 'in_progress' ? styles.progress : ''}`}>{task.status}</span>
                      <span className={due === 'overdue' ? styles.overdue : ''}>{due === 'overdue' ? 'Overdue · ' : due === 'soon' ? 'Due soon · ' : ''}{displayDate(task.dueAt)}</span></div>
                  </li>;
                })}</ul>}
        {data && !busy && <p className={styles.listFooter}>{visible.length} of {tasks.length} assigned tasks shown</p>}
      </section>
      <aside className={styles.sidebar}>
        <section className={styles.panel}><h2>Hubstaff connection</h2>
          <p className={styles.health}><span className={data?.connection.connected && !error ? styles.healthy : styles.pending} />{busy ? 'Checking connection…' : error ? 'Needs attention' : data?.connection.connected ? 'Connected' : connected ? 'Ready to verify' : 'Not connected'}</p>
          <p>{data?.connection.name || 'Your approved personal Hubstaff account'}</p>
          <small>{data?.syncedAt ? `Last synchronized ${new Date(data.syncedAt).toLocaleString()}` : 'No successful synchronization in this view yet.'}</small>
          {children}
        </section>
        <section className={styles.panel}><h2>My projects & workload</h2>
          <p>{data ? `${active.length} active assignments across ${data.projects.length} accessible projects.` : 'Connect and refresh to see your workload.'}</p>
          <ul className={styles.projects}>{(data?.projects || []).map(item => <li key={item.id}><button type="button" onClick={() => { setProject(item.id); setStatus('active'); }}><span>{item.name}{item.archived ? ' (archived)' : ''}</span><strong>{active.filter(task => task.projectId === item.id).length}</strong></button></li>)}</ul>
        </section>
      </aside>
    </div>
    <div className={styles.bottomGrid}>
      <section className={styles.panel}><h2>Recent task activity</h2><p>Latest updates to your assigned tasks.</p>
        {recent.length ? <ul className={styles.activity}>{recent.map(task => <li key={task.id}><div><strong>{task.title}</strong><span>{task.projectName} · {task.status}</span></div><time>{displayDate(task.updatedAt)}</time></li>)}</ul> : <p className={styles.emptySmall}>No recent activity to show.</p>}</section>
      <section className={styles.panel}><h2>Recently completed</h2><p>Your most recent finished assignments.</p>
        {completed.length ? <ul className={styles.activity}>{completed.map(task => <li key={task.id}><div><strong>{task.title}</strong><span>{task.projectName}</span></div><time>{displayDate(task.completedAt)}</time></li>)}</ul> : <p className={styles.emptySmall}>Completed tasks with a completion date appear here.</p>}</section>
    </div>
  </main>;
}
