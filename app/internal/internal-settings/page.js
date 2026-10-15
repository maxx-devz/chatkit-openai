import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import InternalSettingsControls from '@/components/internal/internal-settings-controls';
import { loadAdminInternalUsers } from '@/lib/admin-data';
import styles from '@/components/internal/internal-user-dashboard.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Internal Settings | AOC Internal Portal', robots: { index: false, follow: false } };

export default async function InternalSettingsPage() {
  let data;
  try { data = await loadAdminInternalUsers(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Internal Settings unavailable</h1>
      <p>You need permission to view internal accounts.</p></main>;
  }
  return <main className={styles.main}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>INTERNAL SETTINGS</p>
      <h1>Internal user access</h1><p>{data.canManage
        ? 'Manage accounts, positions, panels, and approved Hubstaff mappings.'
        : 'View internal accounts, positions, panels, and approved Hubstaff mappings.'}</p></div></section>
    <InternalSettingsControls initialInternalUsers={data.internalUsers} schemaReady={data.schemaReady}
      readOnly={!data.canManage} canManageOwnAccount={data.canManageOwnAccount}
      canManageRoles={data.canManageRoles} canResetPasswords={data.canResetPasswords}
      isInternalAdmin={data.isInternalAdmin} viewerId={data.viewerId} />
  </main>;
}
