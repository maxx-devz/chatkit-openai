import Image from 'next/image';
import aocLogo from '@/aoc-logo.png';
import SignOutButton from '@/components/auth/sign-out-button';
import styles from './employee-dashboard.module.css';

const ICON_PATHS = {
  overview: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  tasks: 'M7 4h10M9 2h6v4H9zM5 5h14v16H5zM9 11h6M9 15h6',
  activity: 'M4 19V9m5 10V5m5 14v-7m5 7V7M2 19h20',
  connection: 'M9 15l6-6M7.5 12.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 11.5l2-2a3.5 3.5 0 0 0-5-5l-2 2',
};

function EmployeeIcon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

function initials(name) {
  return String(name || 'Employee').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase() || 'AOC';
}

export default function EmployeeShell({ children, name }) {
  return <div className={styles.shell}>
    <aside className={styles.portalSidebar}>
      <div className={styles.brand}>
        <Image src={aocLogo} alt="Always Open Commerce" priority />
        <span>Employee Portal</span>
      </div>
      <nav className={styles.employeeNav} aria-label="Employee portal">
        <a className={styles.activeNav} href="#overview"><EmployeeIcon name="overview" /><span>Overview</span></a>
        <a href="#assigned-tasks"><EmployeeIcon name="tasks" /><span>My tasks</span></a>
        <a href="#activity"><EmployeeIcon name="activity" /><span>Activity</span></a>
        <a href="#hubstaff-connection"><EmployeeIcon name="connection" /><span>Hubstaff</span></a>
      </nav>
      <div className={styles.sidebarStatus}>
        <span><i /> Read-only workspace</span>
        <p>Task updates remain securely managed in Hubstaff.</p>
      </div>
      <div className={styles.sidebarIdentity}>
        <span>{initials(name)}</span>
        <div><strong>{name}</strong><small>Employee account</small></div>
      </div>
    </aside>
    <div className={styles.portalMain}>
      <header className={styles.header}>
        <div className={styles.headerCopy}><p>Employee workspace</p><strong>My work overview</strong></div>
        <div className={styles.account}><span>{name}</span><SignOutButton className={styles.signOut} /></div>
      </header>
      {children}
    </div>
  </div>;
}
