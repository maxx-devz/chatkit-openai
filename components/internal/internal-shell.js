'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import aocLogo from '@/aoc-logo.png';
import SignOutButton from '@/components/auth/sign-out-button';
import RefreshIcon from './refresh-icon';
import { canAccessInternalWorkspace } from '@/lib/internal-panel-access';
import { visibleInternalSubnav } from '@/lib/internal-navigation';
import { availableInternalRolePanels } from '@/lib/internal-role-panels';
import { useInternalUserWorkspaceStore } from './internal-workspace-provider';
import styles from './internal-user-dashboard.module.css';

const ICON_PATHS = {
  overview: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  tasks: 'M7 4h10M9 2h6v4H9zM5 5h14v16H5zM9 11h6M9 15h6',
  activity: 'M4 19V9m5 10V5m5 14v-7m5 7V7M2 19h20',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  teamTasks: 'M7 4h10M9 2h6v4H9zM5 5h14v16H5zM9 11h6M9 15h6',
  shield: 'M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM8.5 12l2.2 2.2 4.8-5',
  connection: 'M9 15l6-6M7.5 12.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 11.5l2-2a3.5 3.5 0 0 0-5-5l-2 2',
  sync: 'M20 7v5h-5M4 17v-5h5M5.8 9A7 7 0 0 1 18.6 7M18.2 15A7 7 0 0 1 5.4 17',
};

function InternalUserIcon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

function initials(name) {
  return String(name || 'InternalUser').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase() || 'AOC';
}

function workspaceFromPath(pathname, rolePanelBasePath) {
  if (pathname?.startsWith('/internal/audit')) return 'audit';
  if (pathname?.startsWith('/internal/internal-settings')) return 'internalSettings';
  if (pathname?.startsWith(rolePanelBasePath)) return 'roles';
  if (pathname?.startsWith('/internal/team')) return 'team';
  if (pathname?.startsWith('/internal/settings')) return 'settings';
  return 'personal';
}

export default function InternalUserShell({ children, name, position, panelAccess = [], permissions = [], roles = [],
  connected = false, rolePanelBasePath = '/internal/roles' }) {
  const pathname = usePathname();
  const workspace = workspaceFromPath(pathname, rolePanelBasePath);
  const { entries, loadWorkspace } = useInternalUserWorkspaceStore();
  const [refreshStatus, setRefreshStatus] = useState({ workspace: '', message: '', error: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsNavState, setSettingsNavState] = useState({ pathname: '', open: false });
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const profile = { panels: panelAccess, permissions, roles };
  const canOpenPersonal = canAccessInternalWorkspace(profile, 'personal');
  const canOpenTeam = canAccessInternalWorkspace(profile, 'team');
  const canOpenSettings = canAccessInternalWorkspace(profile, 'settings');
  const rolePanels = availableInternalRolePanels(profile);
  const canManageInternalUsers = canAccessInternalWorkspace(profile, 'internalSettings');
  const internalSettingsLinks = canManageInternalUsers ? visibleInternalSubnav(profile) : [];
  const settingsNavOpen = settingsNavState.pathname === pathname
    ? settingsNavState.open : workspace === 'internalSettings';
  const canReadAudit = permissions.includes('platform.audit.read');
  const activeRolePanel = rolePanels.find(panel => pathname === `${rolePanelBasePath}/${panel.id}`);
  const refreshing = entries[workspace]?.busy === true;
  const canRefresh = (workspace === 'personal' && canOpenPersonal) || (workspace === 'team' && canOpenTeam);
  const refreshLabel = workspace === 'team' ? 'Team' : 'My Work';
  const workspaceTitles = {
    personal: 'My Work',
    team: 'Team',
    roles: activeRolePanel?.label || 'Role Panel',
    settings: 'Settings',
    internalSettings: internalSettingsLinks.find(link => link.href === pathname)?.label || 'Internal Settings',
    audit: 'Audit Log',
  };
  useEffect(() => {
    if (!menuOpen) return undefined;
    sidebarRef.current?.querySelector('button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...sidebarRef.current.querySelectorAll('a, button:not(:disabled)')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);
  async function refreshHubstaff() {
    setRefreshStatus({ workspace, message: '', error: false });
    try {
      await loadWorkspace(workspace, { force: true });
      setRefreshStatus({ workspace, message: `${refreshLabel} data checked.`, error: false });
    } catch {
      setRefreshStatus({ workspace, message: `${refreshLabel} refresh failed.`, error: true });
    }
  }
  return <div className={styles.shell}>
    {menuOpen && <button className={styles.menuBackdrop} aria-label="Close navigation" type="button"
      onClick={() => setMenuOpen(false)} />}
    <aside id="internal-sidebar" ref={sidebarRef} className={`${styles.portalSidebar} ${menuOpen ? styles.mobileOpen : ''}`}
      role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen ? 'true' : undefined} aria-label={menuOpen ? 'Internal portal navigation' : undefined}>
      <div className={styles.brand}>
        <Image src={aocLogo} alt="Always Open Commerce" priority />
        <span>Internal Portal</span>
        <button className={styles.closeMenu} type="button" aria-label="Close menu" onClick={() => {
          setMenuOpen(false);
          menuButtonRef.current?.focus();
        }}>×</button>
      </div>
      <nav className={styles.internalUserNav} aria-label="Internal portal">
        {canOpenPersonal && <Link className={workspace === 'personal' ? styles.activeNav : ''} href="/internal"
          aria-label="My Work" onClick={() => setMenuOpen(false)}>
          <InternalUserIcon name="overview" /><span>My Work</span></Link>}
        {canOpenTeam && <Link className={workspace === 'team' ? styles.activeNav : ''} href="/internal/team"
          aria-label="Team" onClick={() => setMenuOpen(false)}>
          <InternalUserIcon name="team" /><span>Team</span></Link>}
        {rolePanels.length > 0 && <p className={styles.roleNavHeading}>My Workspace</p>}
        {rolePanels.map(panel => <Link key={panel.id}
          className={activeRolePanel?.id === panel.id ? styles.activeNav : ''}
          href={`${rolePanelBasePath}/${panel.id}`} aria-label={panel.label} title={panel.label}
          prefetch={false}
          onClick={() => setMenuOpen(false)}>
          <span className={styles.roleMonogram} aria-hidden="true">{panel.label.split(/[\s/]+/).map(part => part[0]).slice(0, 2).join('')}</span>
          <span>{panel.label}</span>
        </Link>)}
        {canOpenSettings && <Link className={workspace === 'settings' ? styles.activeNav : ''} href="/internal/settings"
          aria-label="Settings" onClick={() => setMenuOpen(false)}>
          <InternalUserIcon name="connection" /><span>Settings</span></Link>}
        {internalSettingsLinks.length > 0 && <div className={styles.navGroup}>
          <button type="button" className={`${styles.navGroupToggle} ${workspace === 'internalSettings' ? styles.activeNav : ''}`}
            aria-label="Internal Settings" aria-expanded={settingsNavOpen} aria-controls="internal-settings-subnav"
            onClick={() => setSettingsNavState({ pathname, open: !settingsNavOpen })}>
            <InternalUserIcon name="shield" /><span>Internal Settings</span>
            <svg className={`${styles.navGroupChevron} ${settingsNavOpen ? styles.navGroupChevronOpen : ''}`}
              viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <div id="internal-settings-subnav" className={styles.navChildren} hidden={!settingsNavOpen}>
            {internalSettingsLinks.map(link => <Link key={link.id}
              className={`${styles.navChild} ${pathname === link.href ? styles.activeNav : ''}`}
              href={link.href} aria-current={pathname === link.href ? 'page' : undefined}
              aria-label={link.label} title={link.label} prefetch={false} onClick={() => setMenuOpen(false)}>
              <InternalUserIcon name={link.icon} /><span>{link.label}</span></Link>)}
          </div>
        </div>}
        {canReadAudit && <Link className={workspace === 'audit' ? styles.activeNav : ''} href="/internal/audit"
          aria-label="Audit Log" onClick={() => setMenuOpen(false)}>
          <InternalUserIcon name="activity" /><span>Audit Log</span></Link>}
      </nav>
      <div className={styles.sidebarStatus}>
        <span><i /> Role-based access</span>
        <p>Your panels and workspace assignments are managed separately.</p>
      </div>
      <div className={styles.sidebarIdentity}>
        <span>{initials(name)}</span>
        <div><strong>{name}</strong><small>{position || 'Team Member'}</small></div>
      </div>
    </aside>
    <div className={styles.portalMain}>
      <header className={styles.header}>
        <div className={styles.headerLeading}>
          <button ref={menuButtonRef} className={styles.menuButton} type="button" aria-label="Open menu"
            aria-controls="internal-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <span /><span /><span />
          </button>
          <div className={styles.headerCopy}><p>{position || 'Internal workspace'}</p><strong>{workspaceTitles[workspace] || 'Internal workspace'}</strong></div>
        </div>
        <div className={styles.headerTools}>
          {canRefresh && <div className={styles.refreshControl}>
            <button className={styles.headerRefresh} disabled={refreshing || workspace === 'personal' && !connected}
              aria-label={`Refresh ${refreshLabel} data`}
              title={workspace === 'team' ? 'Check the latest AOC members and work status'
                : connected ? 'Check the latest Hubstaff tasks and activity'
                  : 'Connect Hubstaff in Settings to refresh data'}
              onClick={refreshHubstaff} type="button">
              <RefreshIcon className={`${styles.refreshIcon} ${refreshing ? styles.refreshSpinning : ''}`} />
              <span className={styles.refreshLabel}>{refreshing ? 'Refreshing…' : 'Refresh data'}</span>
            </button>
            {refreshStatus.workspace === workspace && refreshStatus.message
              && <span className={refreshStatus.error ? styles.refreshError : styles.refreshSuccess}
                role={refreshStatus.error ? 'alert' : 'status'}>{refreshStatus.message}</span>}
          </div>}
          <div className={styles.account}><span>{name}</span><SignOutButton className={styles.signOut} /></div>
        </div>
      </header>
      {children}
    </div>
  </div>;
}
