'use client';

import { useEffect, useMemo, useState } from 'react';
import InternalDataFreshness from './internal-data-freshness';
import RefreshIcon from './refresh-icon';
import styles from './internal-pm-workspace.module.css';

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function CollectionControls({ label, count, page, setPage, size, setSize }) {
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(page, pages);
  return <div className={styles.controls} aria-label={`${label} display controls`}>
    <label>Rows <select aria-label={`${label} rows per page`} value={size}
      onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>
      {[10, 20, 50].map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <span>{count ? `${(current - 1) * size + 1}-${Math.min(current * size, count)} of ${count}` : '0 results'}</span>
    <button type="button" disabled={current <= 1} onClick={() => setPage(value => value - 1)}
      aria-label={`Previous ${label} page`}>Previous</button>
    <button type="button" disabled={current >= pages} onClick={() => setPage(value => value + 1)}
      aria-label={`Next ${label} page`}>Next</button>
  </div>;
}

function pageOf(items, page, size) {
  const safePage = Math.min(page, Math.max(1, Math.ceil(items.length / size)));
  return items.slice((safePage - 1) * size, safePage * size);
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf())
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
    : '—';
}

export default function InternalPmWorkspace({ panels = [] }) {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ key: '', data: null, error: '' });
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [projectSort, setProjectSort] = useState('name');
  const [projectPage, setProjectPage] = useState(1);
  const [projectSize, setProjectSize] = useState(10);
  const [taskFilter, setTaskFilter] = useState('open');
  const [taskSort, setTaskSort] = useState('due');
  const [taskPage, setTaskPage] = useState(1);
  const [taskSize, setTaskSize] = useState(10);
  const requestKey = `${selectedProjectId}:${refresh}`;
  const data = result.key === requestKey ? result.data : null;
  const catalog = data || result.data;
  const error = result.key === requestKey ? result.error : '';
  const busy = result.key !== requestKey;
  const canShow = panel => panels.includes(panel) && catalog?.visiblePanels?.includes(panel) !== false;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('project_id', selectedProjectId);
    if (refresh) params.set('refresh', '1');
    fetch(`/api/internal/project-management?${params}`, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Project Management data is unavailable.');
      return body;
    }).then(body => setResult({ key: requestKey, data: body, error: '' }))
      .catch(problem => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: null,
          error: problem.message || 'Project Management data is unavailable.' });
      });
    return () => controller.abort();
  }, [requestKey, selectedProjectId, refresh]);

  const folderNames = useMemo(() => new Map((catalog?.folders || [])
    .map(folder => [folder.id, folder.name])), [catalog]);
  const projects = useMemo(() => (catalog?.projects || []).filter(project => {
    if (folderFilter !== 'all' && (folderNames.has(project.folderId) ? project.folderId : 'other') !== folderFilter) {
      return false;
    }
    return project.name.toLowerCase().includes(search.trim().toLowerCase());
  }).toSorted((a, b) => projectSort === 'folder'
    ? collator.compare(folderNames.get(a.folderId) || 'Other', folderNames.get(b.folderId) || 'Other')
      || collator.compare(a.name, b.name) : collator.compare(a.name, b.name)),
  [catalog, folderFilter, folderNames, projectSort, search]);
  const selectedProject = catalog?.projects?.find(project => project.id === selectedProjectId);
  const tasks = data?.tasks || [];
  const visibleTasks = tasks.filter(task => taskFilter === 'all'
    || taskFilter === 'completed' && task.done
    || taskFilter === 'open' && !task.done).toSorted((a, b) => taskSort === 'title'
    ? collator.compare(a.title, b.title)
    : taskSort === 'updated' ? (b.updatedAt || '').localeCompare(a.updatedAt || '')
      : Number(!a.dueOn) - Number(!b.dueOn)
        || (a.dueOn || '').localeCompare(b.dueOn || '') || collator.compare(a.title, b.title));

  function selectProject(value) {
    setSelectedProjectId(value);
    setTaskPage(1);
  }

  return <main className={styles.main}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>MY WORKSPACE · PROJECT MANAGEMENT</p>
      <h1>Projects & tasks</h1>
      <p>Read-only work from the AOC Hubstaff Tasks organization. Project changes and task updates remain in Hubstaff Tasks.</p>
    </div>
    <div className={styles.toolbar}>
      <span>{catalog?.organizationName || 'AOC projects'}</span>
      <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}
        aria-label="Refresh Project Management data"><RefreshIcon className={styles.refreshIcon} /> Refresh data</button>
    </div>
    {busy && <p className={styles.loading} role="status">Loading projects and tasks…</p>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {catalog && <>
      <div className={styles.freshness}>
        <InternalDataFreshness freshness={catalog.freshness?.catalog} label="Projects" />
        {data?.freshness?.projectTasks && <InternalDataFreshness freshness={data.freshness.projectTasks} label="Tasks" />}
      </div>
      {canShow('pm_projects') && <section className={styles.card} id="pm-projects" aria-labelledby="pm-projects-heading">
        <div className={styles.heading}><div><h2 id="pm-projects-heading">Projects</h2>
          <p>Browse shared projects by Hubstaff Tasks folder.</p></div>
          <div className={styles.counts}><span>{catalog.folders.length} folders</span><span>{catalog.projects.length} projects</span></div>
        </div>
        <div className={styles.filters}>
          <label>Search <input type="search" value={search} placeholder="Project name"
            onChange={event => { setSearch(event.target.value); setProjectPage(1); }} /></label>
          <label>Folder <select value={folderFilter} onChange={event => { setFolderFilter(event.target.value); setProjectPage(1); }}>
            <option value="all">All folders</option>
            {catalog.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            {catalog.projects.some(project => !folderNames.has(project.folderId)) && <option value="other">Other / unfiled</option>}
          </select></label>
          <label>Sort by <select value={projectSort} onChange={event => { setProjectSort(event.target.value); setProjectPage(1); }}>
            <option value="name">Project name</option><option value="folder">Folder name</option>
          </select></label>
        </div>
        <CollectionControls label="Projects" count={projects.length} page={projectPage} setPage={setProjectPage}
          size={projectSize} setSize={setProjectSize} />
        {projects.length ? <div className={styles.tableScroll}><table><thead><tr><th>Project</th><th>Folder</th>
          {canShow('pm_project_tasks') && <th>Tasks</th>}</tr></thead><tbody>
          {pageOf(projects, projectPage, projectSize).map(project => <tr key={project.id}>
            <td><strong>{project.name}</strong></td><td>{folderNames.get(project.folderId) || 'Other / unfiled'}</td>
            {canShow('pm_project_tasks') && <td><button type="button" className={styles.openProject}
              onClick={() => selectProject(project.id)}>View tasks</button></td>}
          </tr>)}</tbody></table></div> : <p className={styles.empty}>No projects match these filters.</p>}
      </section>}
      {canShow('pm_project_tasks') && <section className={styles.card} id="pm-tasks" aria-labelledby="pm-tasks-heading">
        <div className={styles.heading}><div><h2 id="pm-tasks-heading">Project tasks</h2>
          <p>Assignments, stage, status, and due date for one selected project.</p></div></div>
        <div className={styles.filters}><label>Project <select aria-label="Select project tasks"
          value={selectedProjectId} onChange={event => selectProject(event.target.value)}>
          <option value="">Choose a project</option>
          {catalog.projects.map(project => <option key={project.id} value={project.id}>
            {folderNames.get(project.folderId) || 'Other / unfiled'} · {project.name}</option>)}
        </select></label></div>
        {!selectedProjectId && <p className={styles.empty}>Choose a project to see its tasks.</p>}
        {selectedProjectId && data && <>
          <p className={styles.selected}>Showing {selectedProject?.name || 'selected project'} · {tasks.length} tasks loaded</p>
          {data.truncated && <p className={styles.warning}>This project has more tasks than the current read limit. Refine the project in Hubstaff Tasks to see the full list.</p>}
          <div className={styles.filters}>
            <label>Status <select value={taskFilter} onChange={event => { setTaskFilter(event.target.value); setTaskPage(1); }}>
              <option value="open">Open</option><option value="completed">Completed</option><option value="all">All</option>
            </select></label>
            <label>Sort by <select value={taskSort} onChange={event => { setTaskSort(event.target.value); setTaskPage(1); }}>
              <option value="due">Due date</option><option value="updated">Recently updated</option>
              <option value="title">Task name</option>
            </select></label>
          </div>
          <CollectionControls label="Project tasks" count={visibleTasks.length} page={taskPage} setPage={setTaskPage}
            size={taskSize} setSize={setTaskSize} />
          {visibleTasks.length ? <div className={styles.tableScroll}><table><thead><tr>
            <th>Task</th><th>Stage</th><th>Assignees</th><th>Due</th><th>Status</th></tr></thead><tbody>
            {pageOf(visibleTasks, taskPage, taskSize).map(task => <tr key={task.id}>
              <td><strong>{task.title}</strong></td><td>{task.stage || '—'}</td>
              <td>{task.assignees.length ? task.assignees.join(', ') : 'Unassigned'}</td>
              <td>{dateLabel(task.dueOn)}</td><td><span className={task.done ? styles.done : styles.open}>
                {task.done ? 'Completed' : task.status || 'Open'}</span></td>
            </tr>)}</tbody></table></div> : <p className={styles.empty}>No {taskFilter === 'all' ? '' : `${taskFilter} `}tasks in this project.</p>}
        </>}
      </section>}
    </>}
  </main>;
}
