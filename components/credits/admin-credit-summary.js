"use client";
import Link from "@/components/portal-ui/navigation-link";
import {useAdminCredits} from "./use-admin-credits";
import CreditBreakdown from "./credit-breakdown";
import styles from "./credits.module.css";
export default function AdminCreditSummary({clientId,period="",link=true}) {
  const {data,error,refresh}=useAdminCredits(clientId,period);
  return <section className={styles.adminSummary} aria-label="Client reporting credits">
    <div className={styles.heading}><h3>Reporting credits</h3><button type="button" onClick={refresh}>Refresh snapshot</button></div>
    {error?<p role="alert">{error}</p>:!data?<p role="status">Loading reporting credits…</p>:!data.ready?<p>{data.setupMessage}</p>:<>
      <p>{data.period} · UTC · read-only snapshot</p><CreditBreakdown data={data}/>
      {data.allocatedCredits===null && <p className={styles.notice}><strong>Next: assign this client’s monthly allowance.</strong> Saving pricing sets the fee and conversion rate; it does not add a client balance.</p>}
      {data.incomplete && <p>Remaining credits are not confirmed: {data.needsPreparation?"this period's reporting snapshot has not been prepared.":"some usage costs are missing or pending."} No missing cost is treated as zero.</p>}
      {data.partialHistory && <p>Tracking began after this month started. Earlier activity is not included in these figures.</p>}
      {data.fetchedAt && <small>Snapshot updated {new Date(data.fetchedAt).toLocaleString()} · your local time.</small>}
    </>}
    <p>Credits are reporting-only. No portal monthly request limit is enforced.</p>
    {link && <Link href={'/admin/credits?client='+clientId+(period?'&month='+period:'')+'#allowance-adjustments'} prefetch={false}>Set or manage this client’s allowance</Link>}
  </section>;
}
