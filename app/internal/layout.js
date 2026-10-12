import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import SignOutButton from '@/components/auth/sign-out-button';
import InternalUserShell from '@/components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '@/components/internal/internal-workspace-provider';
import { resolveInternalUserContext } from '@/lib/internal-user-data';
import styles from '@/components/internal/internal-user-dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function InternalUserLayout({ children }) {
  let profile;
  try { ({ profile } = await resolveInternalUserContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Internal user access unavailable</h1>
      <p>This account needs active internal user access. Please contact your AOC administrator.</p>
      <Link href="/">Return to your portal</Link><SignOutButton /></main>;
  }

  return <InternalUserWorkspaceProvider>
    <InternalUserShell name={profile.name} position={profile.position}
      panelAccess={profile.panels} connected={profile.connected}>
      {children}
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
