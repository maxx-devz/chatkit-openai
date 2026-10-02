import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import SignOutButton from '@/components/auth/sign-out-button';
import EmployeeDashboard from '@/components/employee/employee-dashboard';
import HubstaffConnection from '@/components/employee/hubstaff-connection';
import { resolveEmployeeContext } from '@/lib/employee-data';
import { EMPLOYEE_PANELS, EMPLOYEE_WORKSPACES } from '@/lib/employee-positions';
import { connectionMessages } from '@/lib/employee-view';
import styles from '@/components/employee/employee-dashboard.module.css';

function workspaceIsAvailable(profile, workspace) {
  return EMPLOYEE_PANELS.some((panel) => panel.workspace === workspace
    && profile.panels.includes(panel.id));
}

function firstAvailableWorkspace(profile) {
  return EMPLOYEE_WORKSPACES.find((workspace) => workspaceIsAvailable(profile, workspace.id));
}

export default async function EmployeePortalPage({ workspace, searchParams }) {
  let profile;
  try { ({ profile } = await resolveEmployeeContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Employee access unavailable</h1>
      <p>This account needs active employee access. Please contact your AOC administrator.</p>
      <Link href="/">Return to your portal</Link><SignOutButton /></main>;
  }

  if (!workspaceIsAvailable(profile, workspace)) {
    const fallback = firstAvailableWorkspace(profile);
    if (fallback) redirect(fallback.path);
    return <main className={styles.unavailable}><h1>No employee workspace assigned</h1>
      <p>Ask an AOC administrator to enable at least one employee portal panel.</p>
      <SignOutButton /></main>;
  }

  const params = searchParams ? await searchParams : {};
  const connectionCode = workspace === 'settings' && typeof params?.connection === 'string'
    ? params.connection
    : '';
  const message = Object.hasOwn(connectionMessages, connectionCode)
    ? connectionMessages[connectionCode]
    : '';

  return <EmployeeDashboard name={profile.name} position={profile.position}
      panelAccess={profile.panels} workspace={workspace}
      connected={profile.connected} connectionMessage={message}>
    {workspace === 'settings' && profile.panels.includes('hubstaff')
      ? <HubstaffConnection connected={profile.connected} />
      : null}
  </EmployeeDashboard>;
}
