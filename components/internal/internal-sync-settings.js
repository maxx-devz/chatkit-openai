'use client';

import { useEffect, useState } from 'react';
import styles from './internal-sync-settings.module.css';

export default function InternalSyncSettings() {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    fetch('/api/internal/sync-settings', { cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync settings could not be loaded.');
      if (live) setData(result);
    }).catch(error => { if (live) setMessage(error.message); });
    return () => { live = false; };
  }, []);

  async function save(feed) {
    const intervalMinutes = Number(drafts[feed.id] ?? feed.intervalMinutes);
    if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      setMessage('Enter a whole number from 1 to 1440 minutes.');
      return;
    }
    setBusy(feed.id);
    setMessage('');
    try {
      const response = await fetch('/api/internal/sync-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed: feed.id, intervalMinutes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Interval could not be saved.');
      setData(result);
      setDrafts(current => { const next = { ...current }; delete next[feed.id]; return next; });
      setMessage(`${feed.label} interval saved.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(''); }
  }

  return <section className={styles.section} aria-labelledby="sync-settings-title">
    <header className={styles.heading}><span className={styles.headingIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.8 9A7 7 0 0 1 18.6 7L20 12M4 12l1.4 5A7 7 0 0 0 18.2 15" />
      </svg></span><div><p className={styles.eyebrow}>INTEGRATION &amp; SYNC</p>
      <h2 id="sync-settings-title">Data refresh intervals</h2></div></header>
    <p className={styles.note}>Set each live feed&apos;s freshness interval in minutes. Data refreshes when someone opens
      its workspace after the interval expires; this is not a background schedule.</p>
    {!data && !message && <p className={styles.loading}>Loading sync settings…</p>}
    {data && !data.schemaReady && <p className={styles.warning}>The sync database migration has not been applied.
      These defaults are displayed, but live data is not yet stored in the shared cache.</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {data && <div className={styles.feedList}>{data.feeds.map(feed => <div className={styles.feed} key={feed.id}>
      <div className={styles.feedSummary}><span className={styles.workspace}>{feed.workspace}</span>
        <h3>{feed.label}</h3><p>Last refreshed: {feed.lastRefreshedAt
          ? new Date(feed.lastRefreshedAt).toLocaleString() : 'Not yet cached'}</p></div>
      <div className={styles.control}><label htmlFor={`sync-${feed.id}`}>Refresh every</label>
        <div className={styles.inputGroup}><input id={`sync-${feed.id}`} type="number" min="1" max="1440" step="1"
          value={drafts[feed.id] ?? feed.intervalMinutes}
          onChange={event => setDrafts(current => ({ ...current, [feed.id]: event.target.value }))}
          disabled={!data.canEdit || !data.schemaReady || Boolean(busy)} /><span>minutes</span></div>
        {data.canEdit && <button type="button" onClick={() => save(feed)}
          disabled={!data.schemaReady || Boolean(busy) || String(drafts[feed.id] ?? feed.intervalMinutes) === String(feed.intervalMinutes)}>
          {busy === feed.id ? 'Saving…' : 'Save'}</button>}</div>
    </div>)}</div>}
    {data && !data.canEdit && <p className={styles.note}>You can view these intervals but cannot edit them.</p>}
  </section>;
}
