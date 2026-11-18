"use client";
import Link from "next/link";
import {useAdminCredits} from "./use-admin-credits";
import {balancePresentation,creditNumber} from "@/lib/credits-presentation";
import styles from "./credits.module.css";
export default function AdminCreditSummary({clientId,period="",link=true}) {
  const {data,error,refresh}=useAdminCredits(clientId,period);
  return <section className={styles.adminSummary} aria-label="Client reporting credits">
    <div className={styles.heading}><h3>Reporting credits</h3><button type="button" onClick={refresh}>Refresh snapshot</button></div>
    {error?<p role="alert">{error}</p>:!data?<p role="status">Loading reporting credits…</p>:!data.ready?<p>{data.setupMessage}</p>:<>
      <p>{data.period} · UTC · read-only snapshot</p><div className={styles.metrics}>
        <div><small>Allocated credits</small><strong>{data.allocatedCredits==null?"Not assigned":creditNumber(data.allocatedCredits)}</strong></div>
        <div><small>{data.incomplete?"Known usage subtotal":"Credits used"}</small><strong>{creditNumber(data.creditsUsed)}</strong></div>
        <div><small>Available balance</small><strong>{data.needsPreparation?"Not prepared":data.partialHistory?"Not confirmed":balancePresentation(data).label}</strong></div>
      </div>
      {data.incomplete && <p>Remaining credits are not confirmed: {data.needsPreparation?"this period's reporting snapshot has not been prepared.":"some usage costs are missing or pending."} No missing cost is treated as zero.</p>}
      {data.partialHistory && <p>Tracking began after this month started. Earlier activity is not included in these figures.</p>}
      {data.fetchedAt && <small>Snapshot updated {new Date(data.fetchedAt).toLocaleString()} · your local time.</small>}
    </>}
    <p>Credits are reporting-only. No portal monthly request limit is enforced.</p>
    {link && <Link href={'/admin/credits?client='+clientId+(period?'&month='+period:'')} prefetch={false}>Review pricing & adjust this client’s allowance</Link>}
  </section>;
}
