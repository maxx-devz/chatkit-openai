'use client';

import { useEffect, useMemo, useState } from 'react';
import InternalDataFreshness from './internal-data-freshness';
import RefreshIcon from './refresh-icon';
import styles from './internal-hr-workspace.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function initialMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function moveMonth(month, offset) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value - 1 + offset, 1));
  return next.toISOString().slice(0, 7);
}

function monthLabel(month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T12:00:00Z`));
}

function dayLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

function hours(seconds) {
  return `${(Number(seconds || 0) / 3600).toFixed(1)} h`;
}

const nameSort = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function CollectionControls({ label, count, page, setPage, pageSize, setPageSize, sort, setSort, sorts }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(page, pages);
  return <div className={styles.collectionControls} aria-label={`${label} display controls`}>
    <label>Sort by <select aria-label={`${label} sort by`} value={sort}
      onChange={event => { setSort(event.target.value); setPage(1); }}>
      {sorts.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
    <label>Rows <select aria-label={`${label} rows per page`} value={pageSize}
      onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
      {[10, 20, 50].map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <span>{count ? `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, count)} of ${count}` : '0 results'}</span>
    <button type="button" disabled={safePage <= 1} onClick={() => setPage(value => value - 1)}
      aria-label={`Previous ${label} page`}>Previous</button>
    <button type="button" disabled={safePage >= pages} onClick={() => setPage(value => value + 1)}
      aria-label={`Next ${label} page`}>Next</button>
  </div>;
}

function pageOf(items, page, pageSize) {
  return items.slice((Math.min(page, Math.max(1, Math.ceil(items.length / pageSize))) - 1) * pageSize,
    Math.min(page, Math.max(1, Math.ceil(items.length / pageSize))) * pageSize);
}

function Calendar({ month, requests, peopleById }) {
  const [year, value] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
  const events = new Map();
  for (const request of requests) {
    for (const day of request.days) {
      if (!events.has(day.date)) events.set(day.date, []);
      events.get(day.date).push({ id: request.id, name: peopleById.get(request.personId)?.name || 'AOC member' });
    }
  }
  return <section className={styles.card} aria-label="Leave calendar">
    <div className={styles.sectionHeading}><div><h2>Leave calendar</h2>
      <p>Approved leave only for {monthLabel(month)}. Pending requests are shown in Leave requests.</p></div></div>
    <div className={styles.calendarScroll}><div className={styles.calendar}>
      {WEEKDAYS.map(day => <strong className={styles.calendarWeekday} key={day}>{day}</strong>)}
      {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`;
        const dayEvents = events.get(date) || [];
        return <div className={styles.calendarDay} key={date}>
          <strong>{index + 1}</strong>
          {dayEvents.slice(0, 3).map((event, eventIndex) => <span key={`${event.id}-${eventIndex}`}
            className={styles.approvedEvent} title={`${event.name} · approved`}>{event.name}</span>)}
          {dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}
        </div>;
      })}
    </div></div>
  </section>;
}

export default function InternalHrWorkspace({ panels = [] }) {
  const [month, setMonth] = useState(initialMonth);
  const [refresh, setRefresh] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [requestSort, setRequestSort] = useState('date_asc');
  const [requestPage, setRequestPage] = useState(1);
  const [requestPageSize, setRequestPageSize] = useState(10);
  const [balanceSort, setBalanceSort] = useState('name_asc');
  const [balancePage, setBalancePage] = useState(1);
  const [balancePageSize, setBalancePageSize] = useState(10);
  const [peopleSort, setPeopleSort] = useState('name_asc');
  const [peoplePage, setPeoplePage] = useState(1);
  const [peoplePageSize, setPeoplePageSize] = useState(10);
  const [result, setResult] = useState({ key: '', data: null, error: '' });
  const requestKey = `${month}:${refresh}`;
  const data = result.key === requestKey ? result.data : null;
  const error = result.key === requestKey ? result.error : '';
  const busy = result.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/internal/hr?month=${encodeURIComponent(month)}${refresh ? '&refresh=1' : ''}`, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'HR data is temporarily unavailable.');
      return body;
    }).then(body => { setResult({ key: requestKey, data: body, error: '' }); })
      .catch(problem => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, data: null,
          error: problem.message || 'HR data is temporarily unavailable.' });
      });
    return () => controller.abort();
  }, [month, refresh, requestKey]);

  const peopleById = useMemo(() => new Map((data?.people || []).map(person => [person.id, person])), [data]);
  const requests = data?.leaveRequests || [];
  const visibleRequests = (statusFilter === 'all' ? requests
    : requests.filter(request => request.status === statusFilter)).toSorted((first, second) => {
    if (requestSort === 'name_asc') return nameSort.compare(peopleById.get(first.personId)?.name || '',
      peopleById.get(second.personId)?.name || '') || first.days[0].date.localeCompare(second.days[0].date);
    const dateOrder = first.days[0].date.localeCompare(second.days[0].date);
    return requestSort === 'date_desc' ? -dateOrder : dateOrder;
  });
  const balancesByPerson = new Map();
  for (const balance of data?.balances || []) {
    if (!balancesByPerson.has(balance.personId)) balancesByPerson.set(balance.personId, []);
    balancesByPerson.get(balance.personId).push(balance);
  }
  const balancePeople = [...balancesByPerson].map(([personId, balances]) => ({
    personId, name: peopleById.get(personId)?.name || 'AOC member', balances,
    total: balances.reduce((sum, balance) => sum + balance.amountSeconds, 0),
  })).toSorted((first, second) => balanceSort === 'total_desc' ? second.total - first.total
    || nameSort.compare(first.name, second.name) : balanceSort === 'total_asc'
      ? first.total - second.total || nameSort.compare(first.name, second.name)
      : nameSort.compare(first.name, second.name));
  const people = (data?.people || []).toSorted((first, second) => peopleSort === 'schedule_first'
    ? Number(second.scheduleCoverage === 'On file') - Number(first.scheduleCoverage === 'On file')
      || nameSort.compare(first.name, second.name)
    : peopleSort === 'missing_first'
      ? Number(first.scheduleCoverage === 'On file') - Number(second.scheduleCoverage === 'On file')
        || nameSort.compare(first.name, second.name)
      : nameSort.compare(first.name, second.name));
  const hasPanel = panel => panels.includes(panel) && (data?.visiblePanels?.includes(panel) !== false);
  return <main className={styles.main}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>MY WORKSPACE · HR</p>
      <h1>People & leave</h1>
      <p>Read-only AOC member, leave, balance, and schedule information from Hubstaff. Approve or correct requests in Hubstaff.</p>
    </div>
    <div className={styles.toolbar}>
      <button type="button" onClick={() => setMonth(value => moveMonth(value, -1))} aria-label="Previous month">←</button>
      <label>Month <input type="month" min="2000-01" max="2099-12" value={month}
        onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} /></label>
      <button type="button" onClick={() => setMonth(value => moveMonth(value, 1))} aria-label="Next month">→</button>
      <button type="button" className={styles.refresh} disabled={busy}
        onClick={() => setRefresh(value => value + 1)}>
        <RefreshIcon className={styles.refreshIcon} /><span>Refresh HR data</span>
      </button>
    </div>
    {busy && <p className={styles.loading} role="status">Loading HR data…</p>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {data && <>
      <div className={styles.meta}>
        {data.freshness?.hrRecords
          ? <InternalDataFreshness freshness={data.freshness.hrRecords} />
          : <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>}
        {hasPanel('hr_schedule_coverage') && !data.scheduleVerified
          && <span>Schedule records are not verified for staffing decisions.</span>}
      </div>
      {hasPanel('hr_overview') && data.summary && <section aria-label="HR overview" className={styles.summary}>
        <article><span>AOC members</span><strong>{data.summary.members}</strong></article>
        <article><span>{data.summary.awayToday === null ? 'Approved requests' : 'Away today'}</span>
          <strong>{data.summary.awayToday === null ? data.summary.approvedRequests : data.summary.awayToday}</strong></article>
        <article><span>Awaiting action</span><strong>{data.summary.pendingRequests}</strong></article>
        <article><span>Schedules on file</span>
          <strong>{data.summary.scheduleCoverage} / {data.summary.members}</strong></article>
      </section>}
      {hasPanel('hr_leave_calendar') && <Calendar month={data.month}
        requests={data.calendarRequests || requests.filter(request => request.status === 'approved')}
        peopleById={peopleById} />}
      {hasPanel('hr_leave_requests') && <section className={styles.card} aria-labelledby="hr-requests-heading">
        <div className={styles.sectionHeading}><div><h2 id="hr-requests-heading">Leave requests</h2>
          <p>Dates, policy, status, and reason are visible only to the HR role.</p></div>
          <label>Status <select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setRequestPage(1); }}>
            <option value="all">All</option><option value="submitted">Submitted</option>
            <option value="approved">Approved</option><option value="denied">Denied</option>
          </select></label></div>
        <CollectionControls label="Leave requests" count={visibleRequests.length} page={requestPage} setPage={setRequestPage}
          pageSize={requestPageSize} setPageSize={setRequestPageSize} sort={requestSort} setSort={setRequestSort}
          sorts={[{ value: 'date_asc', label: 'Earliest first' }, { value: 'date_desc', label: 'Latest first' },
            { value: 'name_asc', label: 'Employee name' }]} />
        {visibleRequests.length ? <ul className={styles.requestList}>{pageOf(visibleRequests, requestPage, requestPageSize).map(request => <li key={request.id}>
          <div className={styles.requestTop}><div><strong>{peopleById.get(request.personId)?.name || 'AOC member'}</strong>
            <span>{request.policy} · {request.days.map(day => dayLabel(day.date)).join(', ')}</span></div>
            <span className={`${styles.status} ${styles[request.status]}`}>{request.status}</span></div>
          <details><summary>Leave details</summary><p><strong>Reason:</strong> {request.reason || 'No reason provided'}</p>
            <ul>{request.days.map(day => <li key={day.date}>{dayLabel(day.date)} · {hours(day.amountSeconds)}</li>)}</ul>
          </details>
        </li>)}</ul> : <p className={styles.empty}>No {statusFilter === 'all' ? '' : `${statusFilter} `}leave requests for this month.</p>}
      </section>}
      {hasPanel('hr_leave_balances') && <section className={styles.card} aria-labelledby="hr-balances-heading">
        <div className={styles.sectionHeading}><div><h2 id="hr-balances-heading">Leave balances</h2>
          <p>Each employee appears once, with all {data.month.slice(0, 4)} policy balances shown together.</p></div></div>
        <CollectionControls label="Leave balances" count={balancePeople.length} page={balancePage} setPage={setBalancePage}
          pageSize={balancePageSize} setPageSize={setBalancePageSize} sort={balanceSort} setSort={setBalanceSort}
          sorts={[{ value: 'name_asc', label: 'Employee name' }, { value: 'total_desc', label: 'Highest total' },
            { value: 'total_asc', label: 'Lowest total' }]} />
        {balancePeople.length ? <div className={styles.tableScroll}><table><thead><tr>
          <th>Employee</th><th>Policy balances</th></tr></thead><tbody>
          {pageOf(balancePeople, balancePage, balancePageSize).map(person => <tr key={person.personId}>
            <td>{person.name}</td><td><div className={styles.balancePolicies}>{person.balances.map((balance, index) =>
              <span key={`${balance.policy}-${index}`}><strong>{balance.policy}</strong> {hours(balance.amountSeconds)}</span>)}</div></td>
          </tr>)}
        </tbody></table></div> : <p className={styles.empty}>No leave balances were returned for AOC members.</p>}
      </section>}
      {hasPanel('hr_schedule_coverage') && <section className={styles.card} aria-labelledby="hr-people-heading">
        <div className={styles.sectionHeading}><div><h2 id="hr-people-heading">People & schedule coverage</h2>
          <p>Find members whose Hubstaff schedule needs review for {monthLabel(data.month)}. A missing record does not mean they are off shift.</p></div></div>
        <div className={styles.coverageSummary}>
          <span><strong>{people.filter(person => person.scheduleCoverage === 'On file').length}</strong> with schedule records</span>
          <span><strong>{people.filter(person => person.scheduleCoverage !== 'On file').length}</strong> need schedule review</span>
        </div>
        <CollectionControls label="People and schedules" count={people.length} page={peoplePage} setPage={setPeoplePage}
          pageSize={peoplePageSize} setPageSize={setPeoplePageSize} sort={peopleSort} setSort={setPeopleSort}
          sorts={[{ value: 'name_asc', label: 'Employee name' }, { value: 'missing_first', label: 'Needs review first' },
            { value: 'schedule_first', label: 'Schedules first' }]} />
        <ul className={styles.peopleList}>{pageOf(people, peoplePage, peoplePageSize).map(person => <li key={person.id}>
          <div><strong>{person.name}</strong><small>{person.portalPosition || 'No portal position'}
            {person.portalAccountMapped ? ' · Portal account' : ''}</small></div>
          <span className={person.scheduleCoverage === 'On file' ? styles.covered : styles.missing}>
            {person.scheduleCoverage === 'On file' ? 'Schedule on file' : 'Needs review'}</span>
          {person.schedules.length > 0 && <details><summary>View schedule on file</summary>
            <ul>{person.schedules.map((schedule, index) => <li key={`${schedule.startDate}-${index}`}>
              {schedule.weekdays.length ? schedule.weekdays.join(', ') : 'One-time'} · {schedule.startTime}
              {' · '}{hours(schedule.durationSeconds)} · {schedule.useTimeZone === 'user' ? 'member time zone' : schedule.useTimeZone || 'time zone unspecified'}
            </li>)}</ul>
          </details>}
        </li>)}</ul>
      </section>}
    </>}
  </main>;
}
