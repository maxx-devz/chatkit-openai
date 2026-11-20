"use client";

import Link, {useLinkStatus} from "next/link";
import styles from "./workspace-loading.module.css";

function PendingHint() {
  const {pending}=useLinkStatus();
  return <><span aria-hidden="true" className={styles.linkHint} data-pending={pending}/>{pending && <span aria-hidden="true" className={styles.progress}/>}</>;
}

export default function NavigationLink({children,...props}) {
  return <Link {...props}>{children}<PendingHint/></Link>;
}
