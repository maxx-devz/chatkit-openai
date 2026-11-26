"use client";

import Link, { useLinkStatus } from "next/link";
import styles from "./workspace-loading.module.css";

function PendingHint({ hideLinkHint }) {
  const { pending } = useLinkStatus();

  return (
    <>
      {!hideLinkHint && (
        <span
          aria-hidden="true"
          className={styles.linkHint}
          data-pending={pending}
        />
      )}

      {pending && (
        <span
          aria-hidden="true"
          className={styles.progress}
        />
      )}
    </>
  );
}

export default function NavigationLink({
  children,
  hideLinkHint = false,
  ...props
}) {
  return (
    <Link {...props}>
      {children}
      <PendingHint hideLinkHint={hideLinkHint} />
    </Link>
  );
}