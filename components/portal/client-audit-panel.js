'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './audit-view.module.css';

const label = action => String(action || '').replaceAll(/[._]/g, ' ');
const tokens = value => value === null || value === undefined ? 'Unknown' : Number(value).toLocaleString();
const date = value => new Date(value).toLocaleString();

export default function ClientAuditPanel({ clientId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async ({ eventPage = 1, usagePage = 1, asOf = '' } = {}) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ eventPage: String(eventPage), usagePage: String(usagePage) });
      if (asOf) params.set('asOf', asOf);
      const response = await fetch(`/api/client/audit?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The audit log could not be loaded.');
      setData(result);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { Promise.resolve().then(() => load()); }, [clientId, load]);
  const pagination = data?.pagination;
  return <section className={styles.section} id="client-audit" aria-labelledby="client-audit-title">
    <h2 id="client-audit-title">Client Admin Audit Log</h2>
    <p>Changes and AI usage for this client only. Prompts, responses, and credentials are never shown.</p>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {!data && !error && <p role="status">Loading audit history…</p>}
    {data && <>
      <section className={styles.section} aria-labelledby="client-activity-title">
        <h2 id="client-activity-title">Account & document activity</h2>
        <div className={styles.scroll}><table className={styles.table}><thead><tr>
          <th>When</th><th>User</th><th>Action</th><th>Target</th>
        </tr></thead><tbody>{data.events.rows.map(event => <tr key={`${event.kind}-${event.id}`}>
          <td>{date(event.occurred_at)}</td><td>{event.actor_name}</td><td>{label(event.action)}</td>
          <td>{event.target_name}</td>
        </tr>)}</tbody></table></div>
        {!data.events.rows.length && <p>No activity recorded yet.</p>}
        <div className={styles.controls}><span>Page {pagination.eventPage}</span><div>
          <button disabled={loading || pagination.eventPage === 1} onClick={() => load({ ...pagination, eventPage: pagination.eventPage - 1 })}>Newer</button>{' '}
          <button disabled={loading || !data.events.hasMore} onClick={() => load({ ...pagination, eventPage: pagination.eventPage + 1 })}>Older</button>
        </div></div>
      </section>
      <section className={styles.section} aria-labelledby="client-usage-title">
        <h2 id="client-usage-title">AI token usage</h2>
        <div className={styles.scroll}><table className={styles.table}><thead><tr>
          <th>When</th><th>User</th><th>Action</th><th>Result</th><th>Model</th>
          <th>Input</th><th>Output</th><th>Total</th>
        </tr></thead><tbody>{data.usage.rows.map(event => <tr key={event.request_id}>
          <td>{date(event.started_at)}</td><td>{event.actor_name}</td><td>{label(event.action)}</td>
          <td>{event.status}</td><td>{event.model || 'Unknown'}</td>
          <td>{tokens(event.input_tokens)}</td><td>{tokens(event.output_tokens)}</td><td>{tokens(event.total_tokens)}</td>
        </tr>)}</tbody></table></div>
        {!data.usage.rows.length && <p>No AI actions recorded yet.</p>}
        <div className={styles.controls}><span>Page {pagination.usagePage}</span><div>
          <button disabled={loading || pagination.usagePage === 1} onClick={() => load({ ...pagination, usagePage: pagination.usagePage - 1 })}>Newer</button>{' '}
          <button disabled={loading || !data.usage.hasMore} onClick={() => load({ ...pagination, usagePage: pagination.usagePage + 1 })}>Older</button>
        </div></div>
      </section>
      <div className={styles.controls}><button disabled={loading} onClick={() => load()}>Show latest</button></div>
    </>}
  </section>;
}
