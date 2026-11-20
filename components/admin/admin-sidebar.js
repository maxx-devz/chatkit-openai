'use client';

import Image from 'next/image';
import Link from '@/components/portal-ui/navigation-link';
import { useEffect,useRef,useState } from 'react';

import aocLogo from '@/aoc-logo.png';
import styles from './admin-dashboard.module.css';

const ICONS = {
  overview: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  clients: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  spark: 'M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z',
  shield: 'M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM8.5 12l2.2 2.2 4.8-5',
  activity: 'M3 12h4l2.5-6 4.5 12 2.5-6H21',
};

const NAV_ITEMS = [
  ['overview', 'Overview', '/admin', 'overview'],
  ['clients', 'Clients', '/admin?view=clients', 'clients'],
  ['activity', 'AI Usage', '/admin?view=usage', 'usage'],
  ['activity', 'Plans & Credits', '/admin/credits', 'credits'],
  ['shield', 'Audit Log', '/admin/audit', 'audit'],
  ['spark', 'AI Assistant', '/admin?view=assistant', 'assistant'],
  ['spark', 'Assistant Settings', '/admin/settings', 'builder'],
  ['shield', 'Source Connections', '/admin/sources', 'sources'],
  ['shield', 'Documents & Journey', '/admin/client-documents', 'documents'],
  ['shield', 'Access & Security', '/admin?view=security', 'security'],
];

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

function initials(value) {
  return String(value || 'AOC').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase();
}

export default function AdminSidebar({ admin, active = 'overview' }) {
  const [open, setOpen] = useState(false);
  const toggle=useRef(null),aside=useRef(null);
  useEffect(()=>{if(!open)return;aside.current?.querySelector('button')?.focus();
    const key=event=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus();}
      if(event.key==='Tab'){const items=[...aside.current.querySelectorAll('a,button')],first=items[0],last=items.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[open]);
  return <>
    <button ref={toggle} type="button" className={styles.mobileNavButton} aria-label="Open administrator menu"
      aria-controls="admin-sidebar" aria-expanded={open} onClick={() => setOpen(true)}>
      <span aria-hidden="true">☰</span>
    </button>
    {open && <button type="button" className={styles.mobileNavBackdrop}
      aria-label="Close administrator menu" onClick={() => setOpen(false)} />}
    <aside ref={aside} id="admin-sidebar" role={open?'dialog':undefined} aria-modal={open || undefined} aria-label={open?'Administrator navigation':undefined} className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
      <button type="button" className={styles.mobileCloseButton} aria-label="Close administrator menu"
        onClick={() => setOpen(false)}>×</button>
      <div className={styles.brand}>
        <Image src={aocLogo} alt="Always Open Commerce" priority />
        <span>Administrator Portal</span>
      </div>
      <nav aria-label="Administrator portal">
        {NAV_ITEMS.map(([icon, label, href, id]) => <Link key={id} href={href} prefetch={false} title={label}
          className={active === id ? styles.activeNav : undefined}
          aria-current={active === id ? 'page' : undefined} onClick={() => setOpen(false)}>
          <Icon name={icon} />{label}
        </Link>)}
      </nav>
      <div className={styles.sidebarStatus}>
        <span><i /> Private admin workspace</span>
        <p>Manage client access, approved content and AI reporting.</p>
      </div>
      <div className={styles.adminIdentity}>
        <span>{initials(admin?.name)}</span>
        <div><strong>{admin?.name || 'AOC Administrator'}</strong>
          <small>{admin?.username || admin?.role || ''}</small></div>
      </div>
    </aside>
  </>;
}
