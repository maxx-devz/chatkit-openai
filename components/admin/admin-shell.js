"use client";
import {useEffect,useRef} from "react";
import AdminSidebar from "./admin-sidebar";
import SignOutButton from "@/components/auth/sign-out-button";
import {useAdminDirty} from "./admin-draft-provider";
import styles from "./admin-dashboard.module.css";
export default function AdminShell({admin,active,title,description,children,navigation,platform=false,scopeLabel,workspaceName,branding,loginHref}) {
  const dirty=useAdminDirty();
  const shell=useRef(null),header=useRef(null);
  useEffect(()=>{const update=()=>{if(shell.current && header.current)shell.current.style.setProperty('--admin-header-height',header.current.getBoundingClientRect().height+'px');};
    update();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;observer?.observe(header.current);
    window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};},[]);
  return <div ref={shell} className={styles.shell} style={branding?{"--admin-navy":branding.palette.primary,"--admin-blue":branding.palette.primary,"--admin-ink":branding.palette.text,background:branding.palette.background}:undefined}><AdminSidebar admin={admin} active={active} navigation={navigation} platform={platform} scopeLabel={scopeLabel} workspaceName={workspaceName} branding={branding}/><div className={styles.main}>
    <header ref={header} className={styles.topbar}><div><p>{scopeLabel || (platform?"AOC platform operations":"AOC administration")}</p><h1>{title}</h1><span>{description}</span></div>
      <div className={styles.topbarActions}><span className={styles.secureBadge}>{scopeLabel?"Authorized agency workspace":platform?"Authorized platform workspace":"Authorized admin"}</span>
        <div onClickCapture={event=>{if(dirty && !window.confirm("Sign out and discard unsaved admin edits?")){event.preventDefault();event.stopPropagation();}}}>
          <SignOutButton className={styles.signOut} loginHref={loginHref}/></div></div></header>
    <main className={styles.content}>{children}</main>
  </div></div>;
}
