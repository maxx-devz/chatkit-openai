import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import InternalIntegrationSettings from '@/components/internal/internal-integration-settings';
import { requireInternalUserPermission } from '@/lib/internal-user-data';
import styles from '@/components/internal/internal-user-dashboard.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrations | AOC Internal Portal', robots: { index: false, follow: false } };

export default async function InternalIntegrationsPage() {
  try { await requireInternalUserPermission(await headers(), 'internal_users.read'); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Integrations unavailable</h1>
      <p>You need Internal Settings access to view integrations.</p></main>;
  }
  return <main className={styles.main}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>INTERNAL SETTINGS</p>
      <h1>Integrations</h1><p>Review organization connections and test Hubstaff access.</p></div></section>
    <InternalIntegrationSettings />
  </main>;
}
