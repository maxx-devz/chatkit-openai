"use client";
import Link from "next/link";
import {useEffect,useId,useRef,useState} from "react";
import {useCredits} from "./use-credits";
import styles from "./header-credits.module.css";
import {balancePresentation,creditNumber} from "@/lib/credits-presentation";

export const CREDIT_LINKS=[
  ["Credits Overview","overview"],["Token Usage","tokens"],["Usage History","history"],
  ["Credit Transactions","transactions"],["Pricing Details","pricing"],
];
export default function HeaderCredits({clientId,active=false}) {
  const {data,error}=useCredits(clientId,{summary:true});
  const [open,setOpen]=useState(false),[pinned,setPinned]=useState(false),root=useRef(null),toggle=useRef(null),id=useId();
  const balance=balancePresentation(data,error);
  function close(){setOpen(false);setPinned(false);}
  useEffect(()=>{
    const outside=event=>{if(!root.current?.contains(event.target))close();};
    document.addEventListener("pointerdown",outside);
    return ()=>document.removeEventListener("pointerdown",outside);
  },[]);
  const links=()=>[...(root.current?.querySelectorAll('[role="menuitem"]') || [])];
  function keyDown(event) {
    if(event.key==="Escape") {event.preventDefault();close();toggle.current?.focus();}
    if(event.key==="ArrowDown" || event.key==="ArrowUp") {
      event.preventDefault();setOpen(true);
      requestAnimationFrame(()=>{
        const items=links(),current=items.indexOf(document.activeElement);
        const next=event.key==="ArrowDown"?(current+1)%items.length:(current<0?items.length-1:(current-1+items.length)%items.length);
        items[next]?.focus();
      });
    }
    if(open && ["Home","End"].includes(event.key)) {
      event.preventDefault();const items=links();items[event.key==="Home"?0:items.length-1]?.focus();
    }
  }
  return <div ref={root} className={styles.root} onKeyDown={keyDown}
    onMouseEnter={()=>{if(window.matchMedia("(hover: hover)").matches)setOpen(true);}}
    onMouseLeave={()=>{if(!pinned && !root.current?.contains(document.activeElement))close();}}
    onFocus={event=>{if(!event.currentTarget.contains(event.relatedTarget) || event.target.getAttribute("href")==="/credits")setOpen(true);}}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close();}}>
    <div className={styles.control}>
      <Link href="/credits" prefetch={false} className={styles.balance}
        aria-current={active?"page":undefined}
        title={balance.detail}>
        <span aria-hidden="true">💎</span><span>Credits: {balance.label}</span>
      </Link>
      <button type="button" ref={toggle} aria-label="AI Credits navigation" aria-haspopup="menu"
        aria-expanded={open} aria-controls={id} onClick={()=>{if(open && pinned)close();else {setOpen(true);setPinned(true);}}}>Details</button>
    </div>
    {open && <div className={styles.dropdown}>
      <p className={styles.status} role="status"><strong>{balance.label}</strong><br/>{balance.detail}</p>
      {data?.ready && <p className={styles.summary}>{data.period} · UTC<br/>Allocated: {creditNumber(data.allocatedCredits)}<br/>
        {data.incomplete?"Known usage subtotal":"Credits used"}: {creditNumber(data.creditsUsed)}</p>}
      <nav id={id} role="menu" aria-label="AI Credits">
      {CREDIT_LINKS.map(([label,section])=><Link key={section} role="menuitem" href={"/credits#"+section}
        prefetch={false} onClick={close}>{label}</Link>)}
      </nav>
    </div>}
  </div>;
}
