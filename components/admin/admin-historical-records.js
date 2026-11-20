import {historicalAuditDetails} from '@/lib/admin-history-details';
import styles from '@/components/portal/audit-view.module.css';
export default function AdminHistoricalRecords({rows,footer}){
 return <section className={styles.section} id="admin-actions" aria-labelledby="historical-admin-title"><h2 id="historical-admin-title">Historical admin records</h2>
  <p>What the administrator did, the affected record and the recorded request result. Missing response details are shown honestly.</p>
  <div className={styles.scroll} tabIndex={0} role="region" aria-label="Historical admin records table"><table className={`${styles.table} ${styles.historyTable}`}><thead><tr>
   <th scope="col">When</th><th scope="col">Client</th><th scope="col">Administrator</th><th scope="col">Action</th><th scope="col">Affected record</th><th scope="col">HTTP status</th><th scope="col">Log details · What happened</th>
  </tr></thead><tbody>{rows.map(event=>{const detail=historicalAuditDetails(event);return <tr key={`${event.kind}-${event.id}`}>
   <td>{event.occurred_at?new Date(event.occurred_at).toLocaleString():'Not recorded'}</td><td>{event.client_name}</td><td>{event.actor_name}</td>
   <td><strong>{detail.action}</strong></td><td>{detail.target}</td>
   <td><span className={styles.historyStatus} data-tone={detail.tone}>{detail.http}</span><small className={styles.historyOutcome}>{detail.outcome}</small></td>
   <td className={styles.historyMessage}><p>{detail.description}</p><p className={styles.historyExplanation}>{detail.message}</p>
    {detail.request&&<details className={styles.historyDiagnostics}><summary>View request log</summary><dl>
     <dt>Reference</dt><dd>{detail.request.request_id}</dd><dt>Request</dt><dd>{detail.request.method} {detail.request.route}</dd>
     {detail.request.duration_ms!=null&&<><dt>Duration</dt><dd>{detail.request.duration_ms} ms</dd></>}
     {detail.request.error_code&&<><dt>Error code</dt><dd>{detail.request.error_code}</dd></>}
     {detail.request.source_location&&<><dt>Code location</dt><dd>{detail.request.source_location}</dd></>}
    </dl></details>}
   </td>
  </tr>;})}</tbody></table></div>
  {!rows.length&&<p>No matching actions.</p>}{footer}
 </section>;
}
