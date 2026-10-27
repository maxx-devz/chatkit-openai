'use client';

import styles from './internal-data-freshness.module.css';

export default function InternalDataFreshness({ freshness, label = '' }) {
  if (!freshness || !['cache', 'hubstaff'].includes(freshness.source)) return null;
  const date = new Date(freshness.refreshedAt);
  if (!Number.isFinite(date.valueOf())) return null;
  return <span className={styles.note}>
    <span className={`${styles.dot} ${freshness.source === 'cache' ? styles.cached : styles.hubstaff}`}
      aria-hidden="true" />
    {label && <span>{label}: </span>}
    <span>{freshness.source === 'cache' ? 'Saved copy' : 'Fetched from Hubstaff'}</span>
    <span aria-hidden="true"> · </span>
    <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>
  </span>;
}
