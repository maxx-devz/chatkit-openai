import styles from './internal-role-panels.module.css';

export function InternalRolePanelDetail({ panel }) {
  return <main className={styles.main}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>MY WORKSPACE · PHASE 0</p>
      <h1>{panel.label}</h1>
      <p>This panel is reserved for {panel.label} work. No live business data or actions are available here yet.</p>
    </div>
    <section className={styles.placeholder} aria-label={`${panel.label} planned areas`}>
      <div className={styles.heading}>
        <h2>Planned areas</h2>
        <span className={styles.badge}>Not connected</span>
      </div>
      <div className={styles.grid}>
        {panel.sections.map(section => <article className={styles.area} key={section}>
          <h3>{section}</h3>
          <p>Available after its data source, record scope, and allowed fields are approved.</p>
        </article>)}
      </div>
    </section>
  </main>;
}
