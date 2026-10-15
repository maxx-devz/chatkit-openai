import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadPlatformAudit } from '@/lib/platform-audit';
import styles from '@/components/internal/internal-user-dashboard.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit Log | AOC Internal Portal', robots: { index: false, follow: false } };

function time(value) {
  return value ? new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : '—';
}

function actionLabel(value) {
  return String(value).replaceAll('internal_admin', 'protected_role').replaceAll('_', ' ').replaceAll('.', ' / ');
}

export default async function InternalAuditPage() {
  let audit;
  try { audit = await loadPlatformAudit(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Audit Log unavailable</h1>
      <p>{error?.publicDetails?.code === 'audit_unavailable'
        ? 'The integration audit migration has not been applied to this environment.'
        : 'This account does not have access to the audit log.'}</p></main>;
  }
  return <main className={styles.main}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>PORTAL OPERATIONS</p>
      <h1>Audit Log</h1><p>Recent integration runs, panel reads, role views, and internal access changes. Times are UTC.</p></div></section>
    <div className={styles.auditGrid}>
      <section className={styles.panel}><h2>Integration runs</h2>
        <div className={styles.auditScroll}><table className={styles.auditTable}><thead><tr>
          <th>Started</th><th>Source / operation</th><th>Environment</th><th>Status</th><th>Records</th><th>Retries</th><th>Error</th><th>Request ID</th>
        </tr></thead><tbody>{audit.integrationRuns.map(run => <tr key={String(run.id)}>
          <td>{time(run.started_at)}</td><td>{run.source} / {run.operation}</td><td>{run.environment}</td>
          <td>{run.status}</td><td>{run.records_processed}</td><td>{run.retry_count}</td>
          <td>{run.error_code || '—'}</td><td>{run.request_id}</td>
        </tr>)}</tbody></table></div>
        {audit.integrationRuns.length === 0 && <p>No integration runs recorded yet.</p>}
      </section>
      <section className={styles.panel}><h2>Portal activity</h2>
        <div className={styles.auditScroll}><table className={styles.auditTable}><thead><tr>
          <th>When</th><th>Action</th><th>Actor ID</th><th>Target ID</th>
        </tr></thead><tbody>{audit.accessEvents.map(event => <tr key={String(event.id)}>
          <td>{time(event.occurred_at)}</td><td>{actionLabel(event.action)}</td>
          <td>{event.actor_user_id || 'Terminal'}</td><td>{event.target_user_id || '—'}</td>
        </tr>)}</tbody></table></div>
        {audit.accessEvents.length === 0 && <p>No portal activity recorded yet.</p>}
      </section>
    </div>
  </main>;
}
