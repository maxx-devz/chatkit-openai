import styles from "./workspace-loading.module.css";
export default function WorkspaceLoading() {
  return <div className={styles.compact} role="status" aria-live="polite" aria-busy="true"><span className={styles.mark} aria-hidden="true"/>Loading…</div>;
}
