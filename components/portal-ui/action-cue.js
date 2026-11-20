import styles from "./portal-theme.module.css";
const paths={
 danger:"M12 3 2 21h20L12 3Zm0 6v5m0 3h.01",
 warning:"M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm0 5v5m0 3h.01",
 edit:"m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4",
 add:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v8m-4-4h8",
 info:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 7v6m0-9h.01",
};
export default function ActionCue({tone="info",children}) {
 return <span className={styles.actionCue} data-action-cue={tone}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[tone]||paths.info}/></svg>{children}</span>;
}
