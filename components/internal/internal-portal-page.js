import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import SignOutButton from '@/components/auth/sign-out-button';
import InternalUserDashboard from '@/components/internal/internal-user-dashboard';
import HubstaffConnection from '@/components/internal/hubstaff-connection';
import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { canAccessInternalWorkspace } from '@/lib/internal-panel-access';
import { internalPanelPreviewData, resolveInternalPanelPreview } from '@/lib/internal-user-preview';
import { INTERNAL_USER_PANELS, INTERNAL_USER_WORKSPACES } from '@/lib/internal-user-positions';
import { connectionMessages } from '@/lib/internal-user-view';
import styles from '@/components/internal/internal-user-dashboard.module.css';

function firstAvailableWorkspace(profile) {
  return INTERNAL_USER_WORKSPACES.find((workspace) => canAccessInternalWorkspace(profile, workspace.id))
    || (canAccessInternalWorkspace(profile, 'roles') ? { path: '/internal/roles' } : null)
    || (canAccessInternalWorkspace(profile, 'internalSettings') ? { path: '/internal/internal-settings' } : null);
}

export default async function InternalUserPortalPage({ workspace, searchParams }) {
  let profile;
  let authUser;
  let requestHeaders;
  try {
    requestHeaders = await headers();
    ({ profile, authUser } = await resolveInternalUserContext(requestHeaders));
  }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect('/login');
    return <main className={styles.unavailable}><h1>Internal user access unavailable</h1>
      <p>This account needs active internal user access. Please contact your AOC administrator.</p>
      <Link href="/">Return to your portal</Link><SignOutButton /></main>;
  }

  const params = searchParams ? await searchParams : {};
  const previewPanel = resolveInternalPanelPreview(params, workspace, process.env.NODE_ENV, requestHeaders.get('host'));
  if (previewPanel) {
    return <>
      <section className={styles.previewBanner} aria-label="Development panel preview">
        <strong>Development preview: {previewPanel.label}</strong>
        <p>Sample data only. Your account permissions are unchanged; live APIs remain protected.</p>
        <nav aria-label="Preview another panel">
          {INTERNAL_USER_PANELS.filter(panel => INTERNAL_USER_WORKSPACES.some(item => item.id === panel.workspace)).map(panel => {
            const path = INTERNAL_USER_WORKSPACES.find(item => item.id === panel.workspace)?.path;
            return <Link key={panel.id} href={`${path}?debug_panel=${panel.id}`}>{panel.label}</Link>;
          })}
        </nav>
      </section>
      <InternalUserDashboard name="Preview Internal User" position={profile.position}
        panelAccess={[previewPanel.id]} workspace={workspace}
        connected={previewPanel.id !== 'hubstaff'} previewData={internalPanelPreviewData()} />
    </>;
  }

  if (!canAccessInternalWorkspace(profile, workspace)) {
    const fallback = firstAvailableWorkspace(profile);
    if (fallback) redirect(fallback.path);
    return <main className={styles.unavailable}><h1>No internal workspace assigned</h1>
      <p>Ask an AOC administrator to enable at least one internal portal panel.</p>
      <SignOutButton /></main>;
  }

  const connectionCode = workspace === 'settings' && typeof params?.connection === 'string'
    ? params.connection
    : '';
  const message = Object.hasOwn(connectionMessages, connectionCode)
    ? connectionMessages[connectionCode]
    : '';

  return <InternalUserDashboard name={profile.name} username={authUser.username || ''} position={profile.position}
      panelAccess={profile.panels} workspace={workspace}
      connected={profile.connected} connectionMessage={message}>
    {workspace === 'settings' && profile.panels.includes('hubstaff')
      ? <HubstaffConnection connected={profile.connected} />
      : null}
  </InternalUserDashboard>;
}
