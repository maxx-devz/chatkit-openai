'use client';

import { useEffect, useState } from 'react';
import styles from './internal-integration-settings.module.css';

function testLabel(lastTest) {
  if (!lastTest) return 'Not tested yet';
  const time = lastTest.checkedAt ? new Date(lastTest.checkedAt).toLocaleString() : 'recently';
  return lastTest.status === 'succeeded' ? `Passed · ${time}` : `Failed · ${time}`;
}

export default function InternalIntegrationSettings() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/internal/integration-settings', { cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Integration settings could not be loaded.');
      if (live) setData(result);
    }).catch(error => { if (live) setMessage(error.message); });
    return () => { live = false; };
  }, []);

  async function testConnection() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/internal/integration-settings', { method: 'POST', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection test failed.');
      setData(result);
      setMessage('Hubstaff organization and AOC team access verified.');
    } catch (error) {
      setMessage(error.message);
      // Reload the safe run summary after a failed test, too.
      try {
        const response = await fetch('/api/internal/integration-settings', { cache: 'no-store' });
        if (response.ok) setData(await response.json());
      } catch { /* Keep the original test error. */ }
    } finally { setBusy(false); }
  }

  const hubstaff = data?.hubstaff;
  return <section className={styles.section} aria-labelledby="integration-settings-title">
    <header className={styles.heading}><span className={styles.headingIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 7V3m6 4V3M7 7h10v5a5 5 0 0 1-10 0V7Zm5 10v4" />
      </svg></span><div><p className={styles.eyebrow}>INTEGRATION SETTINGS</p>
      <h2 id="integration-settings-title">Connections</h2></div></header>
    <p className={styles.note}>View organization-level integration setup. Credentials stay in server-side deployment settings;
      personal Hubstaff connections remain in each user&apos;s own Settings.</p>
    {!data && !message && <p className={styles.loading}>Loading integrations…</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {hubstaff && <div className={styles.content}>
      <article className={styles.card}>
        <div className={styles.cardHeader}><div><span className={styles.provider}>LIVE SOURCE</span>
          <h3>Hubstaff</h3><p>Organization team directory, leave, and shift data. Personal tasks use each user&apos;s own connection.</p></div>
          <span className={`${styles.badge} ${hubstaff.status === 'ready_to_test' ? styles.ready : styles.setup}`}>
            {hubstaff.status === 'ready_to_test' ? 'Ready to test' : 'Setup needed'}</span></div>
        <dl className={styles.details}>
          <div><dt>Organization token</dt><dd>{hubstaff.tokenConfigured ? 'Configured' : 'Missing'}</dd></div>
          <div><dt>AOC member team</dt><dd>{hubstaff.teamConfigured ? `Team ID ${hubstaff.teamId}` : 'Missing'}</dd></div>
          <div><dt>Shift schedule source</dt><dd>{hubstaff.schedulesVerified ? 'Verified' : 'Not verified'}</dd></div>
          <div><dt>Last connection test</dt><dd>{testLabel(hubstaff.lastTest)}</dd></div>
        </dl>
        <div className={styles.cardFooter}>
          <p>A test reads the organization and AOC team member list. It does not change or schedule a sync.
            Run it again after changing deployment credentials.</p>
          {data.canTest && <button type="button" onClick={testConnection} disabled={busy || hubstaff.status !== 'ready_to_test'}>
            {busy ? 'Testing…' : 'Test connection'}</button>}
        </div>
        {!data.auditReady && <p className={styles.warning}>Apply the integration audit migration before testing this connection.</p>}
      </article>
      <div className={styles.planned}><h3>Planned integrations</h3><p>Not connected to the Internal Portal yet.</p>
        <div className={styles.plannedList}>{data.planned.map(integration => <div key={integration.id}>
          <span>{integration.label}</span><span className={`${styles.badge} ${styles.plannedBadge}`}>Planned</span>
        </div>)}</div></div>
    </div>}
  </section>;
}
