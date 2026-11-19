import Link from "next/link";
import styles from "./client-documents-prototype.module.css";

const stages = [
  "Inquiry & fit", "Audit order & payment", "Discover your process",
  "Audit & build decision", "Implementation readiness", "Build & test", "Launch & handover",
];

// Presentation only: no fabricated records, status, Google grant or API adapter.
// Real documents and milestone decisions will be connected in separate steps.
export default function ClientDocumentsPrototype({ admin = false }) {
  return <section className={styles.prototype} aria-labelledby="documents-prototype-title">
    <div className={styles.notice}><span className={styles.badge}>PROTOTYPE</span>
      <p>Layout preview only. Document delivery and verified journey status are not connected here yet.</p>
    </div>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>AI COMMERCE</p><h2 id="documents-prototype-title">Your documents & journey</h2>
        <p>One place for approved engagement documents and your next verified step.</p></div>
      <span className={styles.private}>Private client workspace</span>
    </div>
    <section className={styles.card} aria-labelledby="journey-preview-title">
      <div className={styles.sectionTitle}><h3 id="journey-preview-title">Your journey</h3><span>Status not connected</span></div>
      <p className={styles.explanation}>These seven stages show the proposed layout. No stage has been marked current or complete.</p>
      <ol className={styles.stages}>{stages.map((name, index) => <li key={name}>
        <span className={styles.number} aria-hidden="true">{index + 1}</span><strong>{name}</strong><small>Unconfirmed</small>
      </li>)}</ol>
      <div className={styles.next}><strong>Next required action</strong><p>This will appear after authorized staff record the relevant milestone and its supporting approval.</p></div>
    </section>
    <section className={styles.card} aria-labelledby="official-documents-title">
      <div className={styles.sectionTitle}><h3 id="official-documents-title">Official engagement documents</h3><span>Integration pending</span></div>
      <div className={styles.empty}><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h11l6 6v20H8zM19 3v7h6M12 16h9M12 21h9"/></svg>
        <h4>Your approved documents will appear here</h4>
        <p>Once your secure Drive location is verified, this area will show approved estimates, orders, invoices, receipts, reports, plans and handover records as applicable.</p>
        <p>Each entry will identify its document type, issued version and journey stage. View and download controls will be added with the protected delivery service.</p>
      </div>
      <div className={styles.rules}><p>Existing document emails continue. Drive keeps the original approved files.</p>
        <p>Publishing a document does not confirm payment, approve work or advance your journey.</p></div>
    </section>
    {admin && <section className={styles.card} aria-labelledby="admin-preview-title">
      <h3 id="admin-preview-title">Planned administrator flow</h3>
      <ol className={styles.adminSteps}><li>Select the existing client account.</li><li>Assign its approved client-facing Drive folder once.</li>
        <li>Release an existing approved Drive file for that client; no second upload.</li><li>Record milestones separately using verified delivery and Billing evidence.</li></ol>
      <p><strong>Planned automation:</strong> the portal will retrieve approved files from the assigned Drive location. Files remain in Drive; no duplicate upload into the dashboard is needed. Automatic publication must use a verified release rule, not merely a file appearing in a folder.</p>
      <p>Google sign-in and consent will use the existing secure portal flow. No connection, publication or milestone is created by this preview.</p>
      <p>The reference uses seven operational stages and five simplified document-template steps. Their display mapping still needs confirmation before the live version.</p>
    </section>}
  </section>;
}

export function ClientDocumentsDashboardPrototype() {
  return <section className={`${styles.prototype} ${styles.card}`} aria-labelledby="dashboard-documents-preview-title">
    <div className={styles.sectionTitle}><h2 id="dashboard-documents-preview-title">Your documents</h2><span className={styles.badge}>PROTOTYPE</span></div>
    <p>Approved files assigned to your account will appear here after an administrator publishes them.</p>
    <p>Document delivery is not connected in this layout preview. No files or access permissions have been created.</p>
    <Link href="/?view=documents&journeyPreview=1">View document library preview</Link>
  </section>;
}
