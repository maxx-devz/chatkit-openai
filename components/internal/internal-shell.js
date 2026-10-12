'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import aocLogo from '@/aoc-logo.png';
import SignOutButton from '@/components/auth/sign-out-button';
import { useInternalUserWorkspaceStore } from './internal-workspace-provider';
import styles from './internal-user-dashboard.module.css';

const ICON_PATHS = {
  overview: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  tasks: 'M7 4h10M9 2h6v4H9zM5 5h14v16H5zM9 11h6M9 15h6',
  activity: 'M4 19V9m5 10V5m5 14v-7m5 7V7M2 19h20',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  teamTasks: 'M7 4h10M9 2h6v4H9zM5 5h14v16H5zM9 11h6M9 15h6',
  connection: 'M9 15l6-6M7.5 12.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 11.5l2-2a3.5 3.5 0 0 0-5-5l-2 2',
};

function InternalUserIcon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

function initials(name) {
  return String(name || 'InternalUser').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase() || 'AOC';
}

function workspaceFromPath(pathname) {
  if (pathname?.startsWith('/internal/team')) return 'team';
  if (pathname?.startsWith('/internal/settings')) return 'settings';
  return 'personal';
}

export default function InternalUserShell({ children, name, position, panelAccess = [], connected = false }) {
  const pathname = usePathname();
  const workspace = workspaceFromPath(pathname);
  const { entries, loadWorkspace } = useInternalUserWorkspaceStore();
  const [refreshStatus, setRefreshStatus] = useState('');
  const panels = new Set(panelAccess);
  const canOpenPersonal = ['overview', 'my_tasks', 'activity'].some(panel => panels.has(panel));
  const canOpenTeam = ['team_directory', 'team_tasks'].some(panel => panels.has(panel));
  const refreshing = entries.personal?.busy === true;
  const workspaceTitles = {
    personal: 'My Work',
    team: 'Team Workspace',
    settings: 'Settings',
  };
  async function refreshHubstaff() {
    setRefreshStatus('');
    try {
      await loadWorkspace('personal', { force: true });
      setRefreshStatus('Hubstaff data updated.');
    } catch {
      setRefreshStatus('Hubstaff refresh failed.');
    }
  }
  return <div className={styles.shell}>
    <aside className={styles.portalSidebar}>
      <div className={styles.brand}>
        <Image src={aocLogo} alt="Always Open Commerce" priority />
        <span>Internal Portal</span>
      </div>
      <nav className={styles.internalUserNav} aria-label="Internal portal">
        {canOpenPersonal && <Link className={workspace === 'personal' ? styles.activeNav : ''} href="/internal">
          <InternalUserIcon name="overview" /><span>My Work</span></Link>}
        {canOpenTeam && <Link className={workspace === 'team' ? styles.activeNav : ''} href="/internal/team">
          <InternalUserIcon name="team" /><span>Team Workspace</span></Link>}
        {panels.has('hubstaff') && <Link className={workspace === 'settings' ? styles.activeNav : ''} href="/internal/settings">
          <InternalUserIcon name="connection" /><span>Settings</span></Link>}
      </nav>
      <div className={styles.sidebarStatus}>
        <span><i /> Position-based access</span>
        <p>Your workspace panels are managed by an AOC administrator.</p>
      </div>
      <div className={styles.sidebarIdentity}>
        <span>{initials(name)}</span>
        <div><strong>{name}</strong><small>{position || 'Team Member'}</small></div>
      </div>
    </aside>
    <div className={styles.portalMain}>
      <header className={styles.header}>
        <div className={styles.headerCopy}><p>{position || 'Internal workspace'}</p><strong>{workspaceTitles[workspace] || 'Internal workspace'}</strong></div>
        <div className={styles.headerTools}>
          {canOpenPersonal && <div className={styles.refreshControl}>
            <button className={styles.headerRefresh} disabled={refreshing || !connected}
              title={connected ? 'Load the latest Hubstaff tasks and activity' : 'Connect Hubstaff in Settings to refresh data'}
              onClick={refreshHubstaff} type="button">
              {refreshing ? 'Refreshing…' : 'Refresh Hubstaff data'}
            </button>
            {refreshStatus && <span className={refreshStatus.includes('failed') ? styles.refreshError : styles.refreshSuccess}
              role={refreshStatus.includes('failed') ? 'alert' : 'status'}>{refreshStatus}</span>}
          </div>}
          <div className={styles.account}><span>{name}</span><SignOutButton className={styles.signOut} /></div>
        </div>
      </header>
      {children}
    </div>
  </div>;
}
