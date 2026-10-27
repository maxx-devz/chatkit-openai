import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AdminSidebar from '@/components/admin/admin-sidebar';
import { loadAocAdminAudit } from '@/lib/admin-audit-data';
import adminStyles from '@/components/admin/admin-dashboard.module.css';
import styles from '@/components/portal/audit-view.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AOC Admin Audit Log' };

const readable = value => String(value || '').replaceAll(/[._]/g, ' ');
const date = value => value ? new Date(value).toLocaleString() : '—';
const tokens = value => value === null || value === undefined ? 'Unknown' : Number(value).toLocaleString();

function pageHref(pagination, kind, nextPage, anchor) {
  const params = new URLSearchParams({ asOf: pagination.asOf,
    eventPage: String(pagination.eventPage), integrationPage: String(pagination.integrationPage),
    usagePage: String(pagination.usagePage) });
  if (pagination.clientId) params.set('clientId', pagination.clientId);
  params.set(kind, String(nextPage));
  return `/admin/audit?${params}#${anchor}`;
}

function Pagination({ pagination, kind, hasMore, anchor }) {
  const page = pagination[kind];
  return <nav className={styles.controls} aria-label={`${anchor} pages`}>
    <span>Page {page}</span><span>
      {page > 1 ? <Link href={pageHref(pagination, kind, page - 1, anchor)}>Newer</Link> : 'Newer'}
      {' · '}
      {hasMore ? <Link href={pageHref(pagination, kind, page + 1, anchor)}>Older</Link> : 'Older'}
    </span>
  </nav>;
}

export default async function AocAuditPage({ searchParams }) {
  let audit;
  try { audit = await loadAocAdminAudit(await headers(), await searchParams); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.page}><div className={styles.content}>
      <Link href="/admin">← Back to AOC Admin</Link><h1>Audit Log unavailable</h1>
      <p>{error?.code === '42P01' || error?.code === '42703'
        ? 'Run the admin audit migration for this environment before opening the log.'
        : 'This account cannot open the AOC Admin Audit Log, or the audit data is unavailable.'}</p>
    </div></main>;
  }
  const p = audit.pagination;
  return <div className={adminStyles.shell}>
    <AdminSidebar admin={audit.admin} active="audit" />
    <div className={adminStyles.main}><main className={styles.page}><div className={styles.content}>
    <header className={styles.top}><div><Link href="/admin">← Back to AOC Admin</Link>
      <h1>AOC Admin Audit Log</h1><p>Administrative changes, integration runs, and AI token usage. No prompts, replies, or credentials.</p>
    </div><Link href="/admin/audit">Show latest</Link></header>
    <form className={styles.filter} action="/admin/audit" method="get">
      <label>Client<select name="clientId" defaultValue={p.clientId || ''}>
        <option value="">All clients and platform</option>
        {audit.clients.map(client => <option key={client.id} value={client.id}>{client.display_name}</option>)}
      </select></label><button type="submit">Filter</button>
    </form>
    <section className={styles.section} id="admin-actions"><h2>Admin actions</h2>
      <p>Client and AI configuration changes, protected access changes, and audit reads.</p>
      <div className={styles.scroll}><table className={styles.table}><thead><tr>
        <th>When</th><th>Client</th><th>Actor</th><th>Action</th><th>Target</th>
      </tr></thead><tbody>{audit.events.rows.map(event => <tr key={`${event.kind}-${event.id}`}>
        <td>{date(event.occurred_at)}</td><td>{event.client_name}</td><td>{event.actor_name}</td>
        <td>{readable(event.action)}</td><td>{event.target_id || event.target_type}</td>
      </tr>)}</tbody></table></div>
      {!audit.events.rows.length && <p>No matching actions.</p>}
      <Pagination pagination={p} kind="eventPage" hasMore={audit.events.hasMore} anchor="admin-actions" />
    </section>
    <section className={styles.section} id="integration-runs"><h2>Integration runs</h2>
      <p>Actual AOC and client-portal provider requests. Internal-only runs remain in Internal Audit.</p>
      <div className={styles.scroll}><table className={styles.table}><thead><tr>
        <th>Started</th><th>Client</th><th>Service</th><th>Operation</th><th>Result</th><th>Records</th><th>Error code</th>
      </tr></thead><tbody>{audit.integrations.rows.map(run => <tr key={run.id}>
        <td>{date(run.started_at)}</td><td>{run.client_name}</td><td>{run.source}</td>
        <td>{readable(run.operation)}</td><td>{run.status}</td><td>{run.records_processed}</td>
        <td>{run.error_code || '—'}</td>
      </tr>)}</tbody></table></div>
      {!audit.integrations.rows.length && <p>No matching integration runs.</p>}
      <Pagination pagination={p} kind="integrationPage" hasMore={audit.integrations.hasMore} anchor="integration-runs" />
    </section>
    <section className={styles.section} id="ai-usage"><h2>AI token usage</h2>
      <p>One entry per user action. Token counts are provider-reported; unavailable counts show Unknown.</p>
      <div className={styles.scroll}><table className={styles.table}><thead><tr>
        <th>When</th><th>Client</th><th>User</th><th>Action</th><th>Result</th><th>Provider</th>
        <th>Model</th><th>Input</th><th>Output</th><th>Total</th>
      </tr></thead><tbody>{audit.usage.rows.map(event => <tr key={event.request_id}>
        <td>{date(event.started_at)}</td><td>{event.client_name}</td><td>{event.actor_name}</td>
        <td>{readable(event.action)}</td><td>{event.status}</td><td>{event.provider || 'Unknown'}</td>
        <td>{event.model || 'Unknown'}</td><td>{tokens(event.input_tokens)}</td>
        <td>{tokens(event.output_tokens)}</td><td>{tokens(event.total_tokens)}</td>
      </tr>)}</tbody></table></div>
      {!audit.usage.rows.length && <p>No matching AI actions.</p>}
      <Pagination pagination={p} kind="usagePage" hasMore={audit.usage.hasMore} anchor="ai-usage" />
    </section>
    </div></main></div>
  </div>;
}
