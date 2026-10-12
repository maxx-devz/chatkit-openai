import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import SignOutButton from '@/components/auth/sign-out-button';
import InternalUserDashboard from '@/components/internal/internal-user-dashboard';
import HubstaffConnection from '@/components/internal/hubstaff-connection';
import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { INTERNAL_USER_PANELS, INTERNAL_USER_WORKSPACES } from '@/lib/internal-user-positions';
import { connectionMessages } from '@/lib/internal-user-view';
import styles from '@/components/internal/internal-user-dashboard.module.css';

function workspaceIsAvailable(profile, workspace) {
  return INTERNAL_USER_PANELS.some((panel) => panel.workspace === workspace
    && profile.panels.includes(panel.id));
}

function firstAvailableWorkspace(profile) {
  return INTERNAL_USER_WORKSPACES.find((workspace) => workspaceIsAvailable(profile, workspace.id));
}

export default async function InternalUserPortalPage({ workspace, searchParams }) {
  let profile;
  try { ({ profile } = await resolveInternalUserContext(await headers())); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Internal user access unavailable</h1>
      <p>This account needs active internal user access. Please contact your AOC administrator.</p>
      <Link href="/">Return to your portal</Link><SignOutButton /></main>;
  }

  if (!workspaceIsAvailable(profile, workspace)) {
    const fallback = firstAvailableWorkspace(profile);
    if (fallback) redirect(fallback.path);
    return <main className={styles.unavailable}><h1>No internal workspace assigned</h1>
      <p>Ask an AOC administrator to enable at least one internal portal panel.</p>
      <SignOutButton /></main>;
  }

  const params = searchParams ? await searchParams : {};
  const connectionCode = workspace === 'settings' && typeof params?.connection === 'string'
    ? params.connection
    : '';
  const message = Object.hasOwn(connectionMessages, connectionCode)
    ? connectionMessages[connectionCode]
    : '';

  return <InternalUserDashboard name={profile.name} position={profile.position}
      panelAccess={profile.panels} workspace={workspace}
      connected={profile.connected} connectionMessage={message}>
    {workspace === 'settings' && profile.panels.includes('hubstaff')
      ? <HubstaffConnection connected={profile.connected} />
      : null}
  </InternalUserDashboard>;
}
