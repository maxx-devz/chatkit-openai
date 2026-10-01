import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import SignOutButton from '@/components/auth/sign-out-button';
import EmployeeDashboard from '@/components/employee/employee-dashboard';
import EmployeeShell from '@/components/employee/employee-shell';
import HubstaffConnection from '@/components/employee/hubstaff-connection';
import { resolveEmployeeContext } from '@/lib/employee-data';
import { connectionMessages } from '@/lib/employee-view';
import styles from '@/components/employee/employee-dashboard.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My work | AOC Employee Portal', robots: { index: false, follow: false } };

export default async function EmployeePage({ searchParams }) {
  let profile;
  try { ({ profile } = await resolveEmployeeContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Employee access unavailable</h1>
      <p>This account needs active employee access. Please contact your AOC administrator.</p>
      <Link href="/">Return to your portal</Link><SignOutButton /></main>;
  }
  const params = await searchParams;
  const connectionCode = typeof params?.connection === 'string' ? params.connection : '';
  const message = Object.hasOwn(connectionMessages, connectionCode) ? connectionMessages[connectionCode] : '';
  return <EmployeeShell name={profile.name}>
    <EmployeeDashboard name={profile.name} connected={profile.connected} connectionMessage={message}>
      <HubstaffConnection connected={profile.connected} />
    </EmployeeDashboard>
  </EmployeeShell>;
}
