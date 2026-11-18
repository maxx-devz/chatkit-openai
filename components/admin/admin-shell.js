"use client";
import {useEffect,useRef} from "react";
import AdminSidebar from "./admin-sidebar";
import SignOutButton from "@/components/auth/sign-out-button";
import {useAdminDirty} from "./admin-draft-provider";
import styles from "./admin-dashboard.module.css";
export default function AdminShell({admin,active,title,description,children}) {
  const dirty=useAdminDirty();
  const shell=useRef(null),header=useRef(null);
  useEffect(()=>{const update=()=>{if(shell.current && header.current)shell.current.style.setProperty('--admin-header-height',header.current.getBoundingClientRect().height+'px');};
    update();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;observer?.observe(header.current);
    window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};},[]);
  return <div ref={shell} className={styles.shell}><AdminSidebar admin={admin} active={active}/><div className={styles.main}>
    <header ref={header} className={styles.topbar}><div><p>AOC administration</p><h1>{title}</h1><span>{description}</span></div>
      <div className={styles.topbarActions}><span className={styles.secureBadge}>Authorized admin</span>
        <div onClickCapture={event=>{if(dirty && !window.confirm("Sign out and discard unsaved admin edits?")){event.preventDefault();event.stopPropagation();}}}>
          <SignOutButton className={styles.signOut}/></div></div></header>
    <main className={styles.content}>{children}</main>
  </div></div>;
}
