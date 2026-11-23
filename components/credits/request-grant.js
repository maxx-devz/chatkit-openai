import {creditNumber} from '@/lib/credits-presentation';
import styles from './credits.module.css';
export function hasRecordedGrant(row){return /^[1-9][0-9]*$/.test(String(row.granted_credits??''));}
export function requestDecision(row){return row.status==='approved'?'Closed':row.status==='declined'?'Declined':row.status==='pending'?'Awaiting review':row.status;}
export default function RequestGrant({row}) {
 if(hasRecordedGrant(row))return <div className={styles.grantResult}><strong>{creditNumber(row.granted_credits)} credits added</strong>{row.granted_period&&<small>{row.granted_period} · UTC billing month</small>}</div>;
 return <span>{row.status==='declined'?'None — declined':row.status==='pending'?'Not added yet':'Amount not recorded'}</span>;
}
