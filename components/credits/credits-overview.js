"use client";
import {useEffect,useRef,useState} from "react";
import {useCredits} from "./use-credits";
import ClientPlanView from "./client-plan-view";
import CreditBreakdown from "./credit-breakdown";
import {usd,unpricedReason} from "@/lib/ai-spending-format";
import {creditNumber,creditActivity,usageBasis} from "@/lib/credits-presentation";
import styles from "./credits.module.css";

const utcDate=value=>new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(value));
const utcTime=value=>new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(value))+" UTC";
const tokens=value=>value==null?"Not reported":new Intl.NumberFormat("en-US").format(Number(value));
function Metric({label,value,detail}) {return <article className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;}

export default function CreditsOverview({clientId,canRequest=false}) {
  const [period,setPeriod]=useState(()=>new Date().toISOString().slice(0,7));
  const [group,setGroup]=useState("day"),[offset,setOffset]=useState(0),[asOf,setAsOf]=useState("");
  const root=useRef(null);
  const {data,error,refresh}=useCredits(clientId,{period,group,offset,asOf});
  const changePeriod=value=>{if(!value)return;setPeriod(value);setOffset(0);setAsOf("");};
  const refreshAll=()=>{setOffset(0);setAsOf("");refresh();};
  useEffect(()=>{
    const reveal=()=>{const id=window.location.hash.slice(1);
      if(!["tokens","history","transactions","pricing"].includes(id))return;
      const section=root.current?.querySelector("#"+id);
      if(section){section.open=true;section.scrollIntoView({block:"start"});}
    };
    reveal();window.addEventListener("hashchange",reveal);
    return()=>window.removeEventListener("hashchange",reveal);
  },[data?.ready]);
  if(data?.mode==="subscription" && data.configured)return <ClientPlanView data={data} clientId={clientId} canRequest={canRequest} refresh={refreshAll}/>;
  return <div ref={root} className={styles.page}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>AI CREDITS</p><h1>Credits & usage</h1>
      <p>Your monthly reporting allowance and recorded AI usage.</p></div>
      <div className={styles.actions}><label>Billing month (UTC)<input type="month" value={period}
        max={new Date().toISOString().slice(0,7)} onChange={event=>changePeriod(event.target.value)}/></label>
        <button type="button" onClick={refreshAll}>Refresh usage</button></div>
    </div>
    <nav className={styles.tabs} aria-label="AI Credits sections">
      {[["overview","Credits Overview"],["history","Usage History"],["transactions","Credit Transactions"],["pricing","Pricing Details"],["tokens","Token Usage"]]
        .map(([id,label])=><a key={id} href={"#"+id}>{label}</a>)}
    </nav>
    {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={refreshAll}>Try again</button></p>}
    {!data && !error && <p role="status">Checking your credits and usage…</p>}
    {data && !data.ready && <p role="status">{data.setupMessage}</p>}
    {data?.ready && <>
      <section id="overview" className={styles.section} aria-labelledby="credits-overview-title">
        <div className={styles.heading}><h2 id="credits-overview-title">Credits Overview</h2>
          <span className={styles.badge}>{data.incomplete?"Incomplete usage":data.estimatedEvents?"Includes estimates":"Recorded usage"}</span></div>
        <p>{utcDate(data.range.start)} – {utcDate(new Date(Date.parse(data.range.end)-1))} · UTC calendar month<br/>
          <small>Updated <time dateTime={data.fetchedAt}>{utcTime(data.fetchedAt)}</time>. Refreshes automatically while this page is visible.</small></p>
        <CreditBreakdown data={data}/>
        {data.incomplete && <div className={styles.notice} role="status">
          <strong>We cannot confirm your remaining balance yet.</strong>
          <p>{data.unpricedEvents>0 || data.missingTurns>0
            ?"Some AI activity did not include complete cost details. Allocated credits and known usage are shown, but additional costs may still be missing. Ask your AOC contact to review the provider records."
            :"Recent usage is waiting to be processed. Refresh shortly to check the updated balance."}</p>
          <p>Refreshing checks saved records; it does not generate an AI reply or repair missing provider records.</p>
        </div>}
        {data.usageResetAt && <p className={styles.notice}>AI usage reporting was reset on {utcTime(data.usageResetAt)}. Assigned credits were kept; only usage after that cutoff counts.</p>}
        {data.partialHistory && <p className={styles.notice}>Tracking began {data.trackingStartedAt?utcTime(data.trackingStartedAt):"at an unknown time"}. Earlier activity is not included; figures cover recorded usage only.</p>}
        {Number(data.overageCredits)>0 && <p>Recorded deductions exceed this reporting allowance by {creditNumber(data.overageCredits)} credits. This does not trigger payment or block AI access.</p>}
        <p>Credits are reporting-only. They measure provider usage and the configured AOC service fee; they are not a prepaid wallet or an invoice.</p>
      </section>

      <details id="history" className={styles.section}>
        <summary>Usage History</summary>
        <div className={styles.heading}><p>Recorded usage in {period} · UTC</p><label>Group by
          <select value={group} onChange={event=>setGroup(event.target.value)}><option value="day">Day</option><option value="month">Month</option></select></label></div>
        <div className={styles.table}><table><caption>Known API cost subtotals; missing costs remain unresolved</caption>
          <thead><tr><th>Period (UTC)</th><th>API activities</th><th>Known API cost</th><th>Missing costs</th></tr></thead>
          <tbody>{data.history.map(row=><tr key={row.day}><td>{group==="month"?row.day.slice(0,7):row.day}</td><td>{row.events}</td>
            <td>{usd(row.known_usd)}</td><td>{row.unpriced}</td></tr>)}</tbody>
        </table></div>
        {!data.history.length && <p>No API activity recorded for this period.</p>}
        <div className={styles.table}><table><caption>Recorded billing periods · totals retain each period’s pricing</caption>
          <thead><tr><th>Month (UTC)</th><th>Known total deductions</th><th>Known API cost</th><th>Known AOC fee</th><th>Coverage</th></tr></thead>
          <tbody>{data.months.map(row=><tr key={row.period}><td><button type="button" onClick={()=>changePeriod(row.period)}>{row.period}</button></td>
            <td>{row.used==null?"Not calculated":creditNumber(row.used)}</td><td>{usd(row.api_usd)}</td><td>{usd(row.fee_usd)}</td>
            <td>{Number(row.unpriced)>0 || Number(row.missing)>0 || Number(row.pending)>0?"Incomplete · subtotal":Number(row.estimates)>0?"Includes estimates":"Recorded usage"}</td></tr>)}</tbody>
        </table></div>
      </details>

      <details id="transactions" className={styles.section}>
        <summary>Credit Transactions</summary>
        <p>Newest activity first. All dates below are UTC. Usage deductions are reporting entries.</p>
        <div className={styles.table}><table><caption>Allowance additions, usage and adjustments</caption>
          <thead><tr><th>Activity date (UTC)</th><th>Description</th><th>Credits</th><th>Provider cost</th><th>AOC fee</th><th>Basis</th></tr></thead>
          <tbody>{data.transactions.map((row,index)=>{const allowance=["allocation","adjustment"].includes(row.kind);return <tr key={offset+index}>
            <td>{utcTime(row.occurred_at)}</td><td>{creditActivity(row)}{row.activity && <small className={styles.activity}>{row.activity}</small>}</td>
            <td>{row.credits==null?"Cost pending":creditNumber(row.credits)}</td><td>{allowance?"Not applicable":usd(row.api_cost_usd)}</td>
            <td>{allowance?"Not applicable":usd(row.aoc_fee_usd)}</td><td>{usageBasis(row)}</td></tr>;})}</tbody>
        </table></div>
        {!data.transactions.length && <p>No credit transactions recorded for this period.</p>}
        <div className={styles.actions}><button type="button" disabled={offset===0} onClick={()=>setOffset(value=>Math.max(0,value-50))}>Newer transactions</button>
          <span>Page {Math.floor(offset/50)+1}</span>
          <button type="button" disabled={!data.hasMoreTransactions || offset>=10000} onClick={()=>{setAsOf(data.transactionAsOf);setOffset(value=>value+50);}}>Older transactions</button></div>
        {offset>0 && <p><small>Transaction snapshot: {utcTime(data.transactionAsOf)}. Refresh usage to include newer entries.</small></p>}
      </details>

      <details id="pricing" className={styles.section}>
        <summary>Pricing Details & allowance rules</summary>
        {data.pricing?<><p>1 USD = <strong>{creditNumber(data.pricing.creditsPerUsd)} credits</strong>. AOC fee:
          <strong> {data.pricing.pricingType==="fixed"?usd(data.pricing.aocFee)+" once per billing month":creditNumber(data.pricing.aocFee)+"% of provider usage cost"}</strong>.</p>
          {data.pricingExample && <p className={styles.notice}><strong>Illustrative example</strong>{data.pricing.pricingType==="fixed"?" · one billing month":""}: {usd(data.pricingExample.apiCostUsd)} of provider usage
            {" "}+ {usd(data.pricingExample.aocFeeUsd)} AOC fee = {usd(data.pricingExample.totalClientCostUsd)}, or <strong>{creditNumber(data.pricingExample.creditsUsed)} credits</strong>. This example is not an extra charge.</p>}
          <p>Total reporting cost = recorded provider cost + AOC fee. Total credit deductions = total reporting cost × credits per USD.</p>
          <details><summary>Pricing version for this period</summary><p>Version {data.pricing.id}, effective from {data.pricing.effectivePeriod}. Opened periods keep their saved version; later pricing changes do not reprice this history.</p></details>
          </>:<p>AOC pricing is not configured for this month. Provider usage can still be viewed; a credit total cannot yet be calculated.</p>}
        <ul>
          <li>Allowances are assigned by AOC for each UTC calendar month. Unused credits remain in that month’s history and are not automatically carried into the next month. No automatic allowance renewal is configured.</li>
          <li>The portal has no monthly AI request cap. Reporting credits do not stop AI access or collect a payment. Provider availability and quotas still apply.</li>
          <li>No purchasing, payment collection or in-portal allowance request is available. Ask your existing AOC contact for help reviewing usage or the assigned allowance.</li>
        </ul>
        <p>Commercial expiry, rollover, purchasing and billing policies have not been established by this reporting feature.</p>
      </details>

      <details id="tokens" className={styles.section}>
        <summary>Token Usage & technical cost details</summary>
        <div className={styles.metrics}>
          <Metric label="Input tokens" value={tokens(data.inputTokens)}/>
          <Metric label="Output tokens" value={tokens(data.outputTokens)}/>
          <Metric label="Cached input tokens" value={tokens(data.cachedTokens)} detail="Included in input; not added twice."/>
          <Metric label="Known OpenAI cost" value={usd(data.openaiCostUsd)}/>
          <Metric label="Known OpenRouter cost" value={usd(data.openrouterCostUsd)}/>
          <Metric label="Known tool cost" value={usd(data.toolCostUsd)}/>
          <Metric label="Known AOC fee" value={usd(data.aocFeeUsd)}/>
          <Metric label="Total reporting cost" value={data.totalClientCostUsd==null?"Not confirmed":usd(data.totalClientCostUsd)}/>
        </div>
        <p>Published-rate calculations are estimates, not provider invoices. Cached-input and applicable tool charges follow each recorded pricing snapshot. Official provider rates are separate from AOC pricing.</p>
        <p>{data.unpricedEvents} activities with missing costs · {data.missingTurns} requests without cost records · {data.pendingUsageEvents} activities awaiting credit processing.</p>
        {!!data.unpricedBreakdown?.length && <ul>{data.unpricedBreakdown.map(row=><li key={row.kind+row.status+row.reason}>{row.events} {row.status==="failed"?"unsuccessful":row.status==="cancelled"?"cancelled":"recorded"} {row.kind==="hosted_tool"?"tool activities":"AI activities"}: {unpricedReason(row.reason)}.</li>)}</ul>}
        {data.missingTokenEvents>0 && <p>Some responses did not report a complete token breakdown.</p>}
        <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">Official OpenAI pricing</a>
      </details>
    </>}
  </div>;
}
