import styles from './internal-role-panels.module.css';

export function InternalRolePanelDetail({ panel }) {
  return <main className={styles.main}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>MY WORKSPACE · PREVIEW</p>
      <h1>{panel.label}</h1>
      <p>{panel.description || `A proposed view for ${panel.label} work.`} No live data is connected to this page yet.</p>
    </div>
    <section className={styles.placeholder} aria-label={`${panel.label} planned areas`}>
      <div className={styles.heading}>
        <h2>What you will see here</h2>
        <span className={styles.badge}>Planned · no live data</span>
      </div>
      <div className={styles.grid}>
        {panel.sections.map(section => {
          const item = typeof section === 'string'
            ? { title: section, description: 'Details will appear when this source is connected.' }
            : section;
          return <article className={styles.area} key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            {item.source && <small className={styles.areaSource}>Planned source: {item.source}</small>}
          </article>;
        })}
      </div>
    </section>
  </main>;
}
