import {balancePresentation,creditNumber} from "@/lib/credits-presentation";
import {usd} from "@/lib/ai-spending-format";
import styles from "./credits.module.css";

export default function CreditBreakdown({data}) {
  const unassigned=data.allocatedCredits===null;
  const balance=balancePresentation(data);
  return <div>
    <div className={styles.metrics+(data.pricing?.pricingType==="fixed"?" "+styles.feeMetrics:"")} aria-label="Credit breakdown">
      <article className={styles.metric}><span>Monthly allowance</span><strong>{unassigned?"Not assigned":creditNumber(data.allocatedCredits)}</strong><small>Set separately for each client and month.</small></article>
      <article className={styles.metric}><span>{data.incomplete?"Known AI usage credits":"AI usage credits"}</span><strong>{creditNumber(data.aiUsageCredits)}</strong><small>Provider usage and any percentage markup. Excludes the fixed monthly fee.{data.incomplete?" Some costs are pending or missing.":""}</small></article>
      {data.pricing?.pricingType==="fixed" && <article className={styles.metric}><span>Monthly AOC fee · credits</span><strong>{creditNumber(data.fixedFeeCredits)}</strong><small>{data.fixedFeeUsd==null?"Fee breakdown unavailable.":<>{usd(data.fixedFeeUsd)} × {creditNumber(data.pricing.creditsPerUsd)} credits per US$1. This is a service fee, not AI activity.</>}</small></article>}
      <article className={styles.metric}><span>Remaining allowance</span><strong>{!unassigned && data.partialHistory?"Not confirmed":balance.label}</strong><small>{!unassigned && data.partialHistory?"Earlier activity is outside the recorded tracking period.":balance.detail}</small></article>
    </div>
    {data.pricing && <p>{data.incomplete?"Known reporting deductions (subtotal)":"Total reporting deductions"}: <strong>{creditNumber(data.creditsUsed)} credits</strong>. AI usage{data.pricing.pricingType==="fixed"?" + monthly AOC fee":" including percentage markup"}.{unassigned?" No allowance has been assigned or payment collected.":" Deducted from the reporting allowance; no payment is collected."}</p>}
  </div>;
}
