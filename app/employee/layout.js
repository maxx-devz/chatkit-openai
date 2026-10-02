import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import SignOutButton from '@/components/auth/sign-out-button';
import EmployeeShell from '@/components/employee/employee-shell';
import { EmployeeWorkspaceProvider } from '@/components/employee/employee-workspace-provider';
import { resolveEmployeeContext } from '@/lib/employee-data';
import styles from '@/components/employee/employee-dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({ children }) {
  let profile;
  try { ({ profile } = await resolveEmployeeContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Employee access unavailable</h1>
      <p>This account needs active employee access. Please contact your AOC administrator.</p>
      <Link href="/">Return to your portal</Link><SignOutButton /></main>;
  }

  return <EmployeeWorkspaceProvider>
    <EmployeeShell name={profile.name} position={profile.position}
      panelAccess={profile.panels} connected={profile.connected}>
      {children}
    </EmployeeShell>
  </EmployeeWorkspaceProvider>;
}
