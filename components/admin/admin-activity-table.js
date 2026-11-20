"use client";
import {Fragment,useId,useState} from 'react';
import styles from './admin-activity.module.css';
const outcomes={succeeded:'Completed',failed:'Failed',denied:'Access denied',cancelled:'Cancelled',info:'Additional sign-in step',blocked:'Validation blocked',started:'Outcome not recorded'};
const readable=value=>String(value||'').replace(/^admin[.]/,'').replaceAll(/[_.]/g,' ');
const fieldNames={name:'Client name',slug:'Client identifier',username:'Client username',portalEnabled:'Portal enabled',aiEnabled:'AI enabled',price:'Monthly portal price (USD)',credits:'AI credits',paid:'Payment received (USD)',cost:'Provider cost (USD)',status:'Status',activate:'Activate billing month',paymentConfirmed:'Payment confirmation recorded',websiteDomain:'Website domain',hubstaffProject:'Hubstaff project',provider:'AI provider',model:'AI model',version:'Saved version',revision:'Revision',period:'UTC billing month'};
const fieldLabel=key=>fieldNames[key]||readable(key);
const label=row=>readable(row.operation);
const message=row=>row.outcome==='started'?'Request started; final outcome not recorded.':row.summary||'Activity recorded.';
const explanation=row=>row.outcome==='started'?'A request started but no final outcome was recorded. It may still be running or was interrupted; check the affected record before retrying.':row.summary||'Activity recorded.';
export default function AdminActivityTable({rows,busy}){
 const [expanded,setExpanded]=useState(()=>new Set()),prefix=useId();
 function toggle(id){setExpanded(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 return <>
  <p className={styles.tableHint}>Select a row to show its details. Select it again to close.</p>
  <div className={styles.tableScroll} role="region" aria-label="Scrollable admin activity" tabIndex={0}>
   <table className={styles.activityTable} aria-label="Admin activity" aria-busy={busy}>
    <thead><tr><th scope="col">Activity</th><th scope="col">When</th><th scope="col">Client</th><th scope="col">Administrator</th><th scope="col">Result</th><th scope="col">Message</th></tr></thead>
    <tbody>{rows.map(row=>{
     const open=expanded.has(row.request_id),id=prefix+'-'+row.request_id,name=label(row);
     return <Fragment key={row.request_id}>
      <tr className={styles.activityRow} data-activity-row data-outcome={row.outcome} data-expanded={open}
       onClick={event=>{if(!event.target.closest('button,a,input,select,textarea'))toggle(row.request_id);}}>
       <th scope="row"><button type="button" className={styles.rowToggle} aria-expanded={open} aria-controls={id}
        aria-label={`${open?'Collapse':'Expand'} details: ${name}`} onClick={()=>toggle(row.request_id)}>
        <svg viewBox="0 0 20 20" aria-hidden="true" data-open={open}><path d="m7 4 6 6-6 6"/></svg><span>{name}</span>
       </button><small className={styles.activitySource}>{row.method} · {row.origin==='auth'?'Account security':'Submitted action'}</small></th>
       <td className={styles.activityWhen}>{new Date(row.occurred_at).toLocaleString()}</td>
       <td>{row.client_name}</td><td>{row.actor_name}</td>
       <td><span className={styles.badge}>{outcomes[row.outcome]||row.outcome}</span>{row.http_status&&<small className={styles.httpStatus}>HTTP {row.http_status}</small>}</td>
       <td><span className={styles.shortMessage}>{message(row)}</span></td>
      </tr>
      <tr className={styles.detailRow} id={id} hidden={!open}><td colSpan={6}>
       <div className={styles.expandedContent} role="region" aria-label={`Details: ${name}`}>
        <p className={styles.detailExplanation}>{explanation(row)}</p>
        <dl className={styles.diagnosticList}>
         <dt>Reference</dt><dd>{row.request_id}</dd><dt>Request</dt><dd>{row.method} {row.route}</dd>
         <dt>Result</dt><dd>{row.http_status?`HTTP ${row.http_status}`:'No HTTP result'}{row.duration_ms!=null?` · ${row.duration_ms} ms`:''}</dd>
         {row.error_code&&<><dt>Error code</dt><dd>{row.error_code}</dd></>}{row.source_location&&<><dt>Code location</dt><dd>{row.source_location}</dd></>}
         {!!row.details?.fields?.length&&<><dt>Submitted fields</dt><dd>{row.details.fields.join(', ')} (sensitive values excluded)</dd></>}
         {!!Object.keys(row.details?.values||{}).length&&<><dt>Submitted values</dt><dd><dl className={styles.valueList}>{Object.entries(row.details.values).map(([key,value])=><div key={key}><dt>{fieldLabel(key)}</dt><dd>{value===null?'Cleared':typeof value==='boolean'?(value?'Yes':'No'):String(value)}</dd></div>)}</dl></dd></>}
         <dt>Confirmed saved</dt><dd>{row.details?.duplicate?'This request was already recorded. No new change was made.':Object.keys(row.details?.saved_values||{}).length?<dl className={styles.valueList}>{Object.entries(row.details.saved_values).map(([key,value])=><div key={key}><dt>{fieldLabel(key)}</dt><dd>{value===null?'Cleared':typeof value==='boolean'?(value?'Yes':'No'):String(value)}</dd></div>)}</dl>:row.outcome==='succeeded'?'The request completed; this operation did not return individual saved values.':'No committed values were confirmed. A submitted value is not proof it was saved.'}</dd>
         {!!row.details?.omitted_fields?.length&&<><dt>Excluded fields</dt><dd>{row.details.omitted_fields.map(readable).join(', ')} (values not recorded)</dd></>}
         {row.details?.values_omitted_for_size&&<><dt>Log size limit</dt><dd>Some values were omitted to keep this record bounded.</dd></>}
         {row.details?.field_type&&<><dt>Control type</dt><dd>{row.details.field_type}</dd></>}{row.details?.requested_client_id&&<><dt>Requested client</dt><dd>{row.details.requested_client_id}</dd></>}
        </dl>
       </div>
      </td></tr>
     </Fragment>;
    })}</tbody>
   </table>
  </div>
 </>;
}
