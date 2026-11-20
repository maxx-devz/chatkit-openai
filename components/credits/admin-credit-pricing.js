"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import Link from "@/components/portal-ui/navigation-link";
import {usd} from "@/lib/ai-spending-format";
import {creditNumber} from "@/lib/credits-presentation";
import {normalizeCreditDecimal} from "@/lib/credits-pricing";
import {activePricingChanged} from "@/lib/admin-credit-pricing";
import {useAdminDraft} from "@/components/admin/admin-draft-provider";
import {useAdminCredits} from "./use-admin-credits";
import CreditBreakdown from "./credit-breakdown";
import styles from "./credits.module.css";

const currentMonth=()=>new Date().toISOString().slice(0,7);
const monthLabel=period=>new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(period+"-01T00:00:00Z"));
const effectiveDate=period=>monthLabel(period)+" · starts on day 1 at 00:00 UTC";
function editorBaseline(data) {
  const chosen=data?.scheduled?.find(row=>row.effectivePeriod===data.editorPeriod) || data?.current;
  return {pricingType:chosen?.pricingType || "percentage",
    percentageFee:chosen?.pricingType==="percentage"?normalizeCreditDecimal(chosen.aocFee):"",
    fixedFee:chosen?.pricingType==="fixed"?normalizeCreditDecimal(chosen.aocFee):"",
    creditsPerUsd:chosen?normalizeCreditDecimal(chosen.creditsPerUsd):"1000"};
}
function PriceSummary({title,policy}) {
  return <article className={styles.metric}><span>{title}</span>{policy?<><strong>{policy.pricingType==="percentage"?creditNumber(policy.aocFee)+"% markup":usd(policy.aocFee)+" / month"}</strong>
    <small>US$1 = {creditNumber(policy.creditsPerUsd)} reporting credits<br/>{effectiveDate(policy.effectivePeriod)}</small></>:<p>None configured</p>}</article>;
}
export default function AdminCreditPricing({adminId="admin"}) {
  const params=useSearchParams(),router=useRouter();
  const [data,setData]=useState(null),[error,setError]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState("");
  const [apiCost,setApiCost]=useState("1"),[preview,setPreview]=useState(null),[adjustmentPreview,setAdjustmentPreview]=useState(null);
  const pricingKey=useRef("");
  const clientId=params.get("client") || data?.clients[0]?.id || "",period=params.get("month") || data?.currentPeriod || currentMonth();
  const client=data?.clients.find(item=>item.id===clientId);
  const {value:fields,update:setFields,clear:clearPricing,clearIfUnchanged:clearSavedPricing,dirty}=useAdminDraft("pricing:"+adminId,editorBaseline(data));
  const {value:adjustment,update:setAdjustment,clearIfUnchanged:clearSavedAdjustment}=useAdminDraft("allowance:"+adminId+":"+clientId+":"+period,{direction:"add",amount:"",reason:"",idempotencyKey:""});
  const report=useAdminCredits(clientId,period);
  const editorPeriod=data?.editorPeriod || currentMonth();
  const fixedPricing=fields.pricingType==="fixed";
  const conversionRate=Number(fields.creditsPerUsd);
  const conversionReady=Number.isFinite(conversionRate) && conversionRate>0 && conversionRate<=1000000;
  const pricingPayload={pricingType:fields.pricingType,aocFee:fields.pricingType==="percentage"?fields.percentageFee:fields.fixedFee,creditsPerUsd:fields.creditsPerUsd};
  const activeDirty=activePricingChanged(fields,editorBaseline(data));
  const firstAllowance=report.data?.ready && report.data.allocatedCredits===null;
  const signedAmount=!firstAllowance && adjustment.direction==="subtract"?"-"+adjustment.amount:adjustment.amount;
  const adjustmentScope=JSON.stringify({clientId,period,amount:signedAmount,reason:adjustment.reason});
  const scopedPreview=adjustmentPreview?.scope===adjustmentScope?adjustmentPreview:null;
  async function load() {
    const response=await fetch("/api/admin/credits",{cache:"no-store",credentials:"same-origin"});
    const value=await response.json();if(!response.ok)throw Error(value.error || "Pricing could not load.");
    setData(value);return value;
  }
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    fetch("/api/admin/credits",{cache:"no-store",credentials:"same-origin",signal:controller.signal})
      .then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error);return value;})
      .then(value=>{if(active)setData(value);}).catch(failure=>{if(active)setError(failure.message);});
    return()=>{active=false;controller.abort();};
  },[]);
  async function request(payload) {
    const response=await fetch("/api/admin/credits",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const value=await response.json();if(!response.ok)throw Error(value.error || "The request could not finish.");return value;
  }
  function updateField(key,value) {setFields(previous=>({...previous,[key]:value}));setPreview(null);pricingKey.current="";setStatus("");}
  function updateAdjustment(key,value) {setAdjustment(previous=>({...previous,[key]:value,idempotencyKey:""}));setAdjustmentPreview(null);setStatus("");}
  async function pricing(action) {
    if(busy || !data)return;setBusy(action);setError("");setStatus("");
    try {
      if(action==="preview")setPreview(await request({...pricingPayload,action,apiCostUsd:apiCost}));
      else {pricingKey.current ||= crypto.randomUUID();
        const result=await request({...pricingPayload,action,effectivePeriod:editorPeriod,expectedVersion:data.versions[0]?.id || "",idempotencyKey:pricingKey.current});
        pricingKey.current="";clearSavedPricing(fields);setPreview(null);await load();
        setStatus("Pricing version saved for "+result.pricing.effectivePeriod+". Existing client-period calculations were preserved.");}
    }catch(failure){setError(failure.message);}finally{setBusy("");}
  }
  async function allowance(action) {
    if(busy || !client || !report.data?.ready)return;setBusy(action);setError("");setStatus("");
    try {
      const idempotencyKey=adjustment.idempotencyKey || crypto.randomUUID();
      if(!adjustment.idempotencyKey)setAdjustment(previous=>({...previous,idempotencyKey}));
      const payload={clientId,period,amount:signedAmount,reason:adjustment.reason,idempotencyKey,action};
      if(action==="adjustment_preview")setAdjustmentPreview({...await request(payload),scope:adjustmentScope});
      else {
        if(!scopedPreview)throw Error("Preview the proposed adjustment before recording it.");
        const result=await request(payload);
        clearSavedAdjustment({...adjustment,idempotencyKey});setAdjustmentPreview(null);report.refresh();
        if(typeof BroadcastChannel!=="undefined"){const channel=new BroadcastChannel("aoc-credits-updated");channel.postMessage({clientId});channel.close();}
        setStatus((result.duplicate?"This adjustment was already recorded":"Reporting allowance updated")+" for "+client.name+" · "+period+". No payment or access setting changed.");
      }
    }catch(failure){setError(failure.message);}finally{setBusy("");}
  }
  const select=(id,month)=>{setAdjustmentPreview(null);setError("");setStatus("");router.push("/admin/credits?"+new URLSearchParams({client:id,month}));};
  return <div className={styles.page+" "+styles.adminPage}>
    <p className={styles.notice}><strong>1. Set pricing. 2. Assign each client’s allowance.</strong> Pricing sets the service fee and credits per dollar; it does not add credits to any client. Credits are reporting-only. The portal has no monthly AI request cap. No payment collection or credit-based access restriction is enabled.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{status && <p role="status" className={styles.notice}>{status}</p>}
    {!data && !error && <p role="status">Loading pricing configuration…</p>}
    <section className={styles.section} aria-label="Current and scheduled pricing">
      <div className={styles.metrics}><PriceSummary title={"Current pricing · "+(data?.currentPeriod || currentMonth())} policy={data?.current}/>
        <PriceSummary title="Scheduled pricing" policy={data?.scheduled?.[0]}/></div>
      {!!data?.scheduled?.length && <p>Scheduled changes apply to later periods. Opened client periods retain their saved pricing version.</p>}
    </section>
    <section className={styles.section}>
      <h2>{data?.versions.length?"Edit scheduled pricing":"Configure reporting pricing"} · {monthLabel(editorPeriod)} UTC</h2>
      <p>{data?.versions.length?"This editor and Save affect the next UTC month; the Current pricing card is unchanged.":"The first saved version establishes this month's reporting baseline."} Official provider prices are separate from AOC fees.</p>
      <div className={styles.pricingWorkspace}>
        <form onSubmit={event=>{event.preventDefault();void pricing("pricing");}}>
          <div className={styles.form}>
            <label>Pricing type<select value={fields.pricingType} disabled={Boolean(busy) || !data} onChange={event=>updateField("pricingType",event.target.value)}>
              <option value="percentage">Percentage markup</option><option value="fixed">Fixed monthly fee</option></select></label>
            {fields.pricingType==="percentage"?<label>AOC markup (%)<input type="number" required min="0" max="1000" step="any" value={fields.percentageFee} disabled={Boolean(busy) || !data} onChange={event=>updateField("percentageFee",event.target.value)}/></label>
              :<label>Monthly AOC fee (USD)<input type="number" required min="0" max="1000000" step="any" placeholder="Enter a monthly fee in USD" value={fields.fixedFee} disabled={Boolean(busy) || !data} onChange={event=>updateField("fixedFee",event.target.value)}/></label>}
            <label>How many credits per $1 (USD)?<input type="number" required min="0.000000000001" max="1000000" step="any" aria-describedby="credits-conversion-help" value={fields.creditsPerUsd} disabled={Boolean(busy) || !data} onChange={event=>updateField("creditsPerUsd",event.target.value)}/></label>
          </div>
          <p id="credits-conversion-help"><strong>{conversionReady?<>US$1 of total reporting cost = {creditNumber(fields.creditsPerUsd)} reporting credits.</>:"Enter how many reporting credits equal US$1 of total reporting cost."}</strong>{" "}{fixedPricing?"Provider usage costs plus the fixed monthly AOC fee are converted at this rate.":"Provider usage costs plus the AOC percentage markup are converted at this rate."}{" "}The client’s monthly credit allowance is set separately below.</p>
          <p>{fixedPricing?"Enter a fixed amount in USD. This fee applies once per client each billing month, in addition to provider usage costs.":"Enter the percentage added to provider usage costs. For example, 20 means a 20% AOC markup."}</p>
          {dirty && <p role="status">{activeDirty?'Unsaved pricing edits':'Alternate fee draft retained; active pricing values match the saved version.'}</p>}
          <div className={styles.actions}>{dirty && <button type="button" disabled={Boolean(busy)} onClick={()=>{clearPricing();setPreview(null);pricingKey.current="";}}>Discard pricing edits</button>}
            <button type="submit" className={styles.primary} disabled={Boolean(busy) || !data || (data.versions.length>0 && !activeDirty)}>Save pricing for {editorPeriod}</button></div>
        </form>
        <aside className={styles.previewCard} aria-label="Pricing preview"><h3>{fixedPricing?"Monthly fee preview":"Percentage markup preview"} · {editorPeriod}</h3>
          <label>{fixedPricing?"Example monthly provider cost (USD)":"Example provider cost (USD)"}<input type="number" min="0" max="1000000" step="any" value={apiCost} disabled={Boolean(busy)}
            onChange={event=>{setApiCost(event.target.value);setPreview(null);}}/></label>
          <button type="button" disabled={Boolean(busy) || !data} onClick={()=>void pricing("preview")}>Calculate pricing preview</button>
          {preview && <dl aria-label="Calculated pricing preview"><div><dt>{fixedPricing?"Monthly provider cost":"Provider cost"}</dt><dd>{usd(preview.apiCostUsd)}</dd></div><div><dt>{fixedPricing?"Monthly AOC fee":"AOC markup amount"}</dt><dd>{usd(preview.aocFeeUsd)}</dd></div>
            <div><dt>{fixedPricing?"Monthly reporting total":"Total reporting cost"}</dt><dd>{usd(preview.totalClientCostUsd)}</dd></div><div><dt>Credits for this example</dt><dd>{creditNumber(preview.creditsUsed)}</dd></div></dl>}
          <p>This is arithmetic only. It does not call an AI provider, change current prices or adjust a client balance.</p>
        </aside>
      </div>
    </section>
    <section className={styles.section} id="allowance-adjustments">
      <h2>Assign or adjust a client allowance</h2><p>Choose a client and month, enter the credits and a reason, then preview and confirm. This does not change pricing or collect a payment.</p>
      <div className={styles.form}><label>Selected client<select value={clientId} disabled={Boolean(busy) || !data} onChange={event=>select(event.target.value,period)}>
        {!data?.clients.length && <option value="">No clients available</option>}{data?.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>UTC billing month<input type="month" value={period} max={currentMonth()} disabled={Boolean(busy)} onChange={event=>{if(event.target.value)select(clientId,event.target.value);}}/></label></div>
      <h3>{client?.name || "Choose an available client"} · {period} UTC</h3>
      {report.error && <p role="alert">{report.error}</p>}
      {!report.data && client && !report.error && <p role="status">Loading client allowance…</p>}
      {report.data && !report.data.ready && <p role="status">{report.data.setupMessage}</p>}
      {report.data?.ready && <><CreditBreakdown data={report.data}/>
        {firstAllowance && <p className={styles.notice}><strong>No allowance assigned yet.</strong> Enter the monthly credit allowance below. The fixed AOC fee, if configured, is reported separately from AI usage and is included in total deductions.</p>}
        {!firstAllowance && (report.data.incomplete || report.data.partialHistory) && <p className={styles.notice}>The full remaining balance cannot be confirmed. Missing or unprepared usage and activity before tracking began stay unknown; an allowance adjustment does not resolve those missing costs.</p>}
      </>}
      {data && !data.reasonsReady && <p className={styles.notice}>Adjustment audit reasons need an additive schema update. Review the configured database, then run <code>npm run credits:migrate</code>. Existing entries and balances are preserved; recording new adjustments is disabled until this is ready.</p>}
      <form onSubmit={event=>{event.preventDefault();void allowance("allocation");}}>
        <div className={styles.form}>
          {!firstAllowance && <label>Adjustment direction<select value={adjustment.direction} disabled={Boolean(busy)} onChange={event=>updateAdjustment("direction",event.target.value)}><option value="add">Add credits</option><option value="subtract">Subtract credits</option></select></label>}
          <label>{firstAllowance?"Monthly allowance (credits)":"Amount · credits"}<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]+"
  maxLength={300}
  placeholder="Enter numbers only"
  required
  value={adjustment.amount ?? ""}
  disabled={Boolean(busy)}
  onChange={(event) => {
    const value = event.target.value;
    if (/^[0-9]*$/.test(value)) {
      updateAdjustment("amount", value);
    }
  }}
/></label>
          <label>Reason · admin audit trail<input type="text" maxLength={300} placeholder="e.g. Approved monthly AI allowance" required value={adjustment.reason} disabled={Boolean(busy)} onChange={event=>updateAdjustment("reason",event.target.value)}/></label>
        </div>
        <p>Use a short business reason. Do not include credentials or private prompts. Legacy entries without a reason remain unchanged.</p>
        <div className={styles.actions}><button type="button" disabled={Boolean(busy) || !report.data?.ready || !adjustment.amount || !adjustment.reason.trim()} onClick={()=>void allowance("adjustment_preview")}>{firstAllowance?"Preview allowance":"Preview allowance adjustment"}</button>
          <button type="submit" className={styles.primary} disabled={Boolean(busy) || !data?.reasonsReady || !scopedPreview || !adjustment.reason.trim()}>{firstAllowance?"Assign allowance":"Record "+(adjustment.direction==="add"?"addition":"subtraction")} for {period}</button></div>
        {scopedPreview && <p role="status" className={styles.notice}>Proposed {scopedPreview.change} credits · allocated allowance after: <strong>{creditNumber(scopedPreview.allocatedAfter)}</strong>.
          {" "}Remaining balance after: <strong>{scopedPreview.availableAfter==null?"Not confirmed":creditNumber(scopedPreview.availableAfter)}</strong>. This updates reporting only and does not charge a payment.</p>}
      </form>
      <details className={styles.auditDetails}><summary>Recent allowance adjustments · this client and month</summary>
        {report.data?.adjustments?.length?<div className={styles.table}><table><thead><tr><th>Recorded</th><th>Credits</th><th>Reason</th></tr></thead><tbody>{report.data.adjustments.map((row,index)=><tr key={index}>
          <td>{new Date(row.recorded_at).toLocaleString()}</td><td>{creditNumber(row.credits)}</td><td>{row.reason || "Not recorded on this legacy entry"}</td></tr>)}</tbody></table></div>:<p>No manual adjustments recorded for this selection.</p>}
      </details>
      {client && <Link href={'/admin?view=clients'+(report.data?.client?.slug?'&client='+encodeURIComponent(report.data.client.slug):'')} prefetch={false}>Return to Clients</Link>}
    </section>
    <details className={styles.section}><summary>Pricing history · append-only versions</summary>
      <div className={styles.table}><table><caption>Saved AOC reporting prices; provider rates are unchanged</caption><thead><tr><th>Version</th><th>Effective month (UTC)</th><th>Pricing type</th><th>AOC fee</th><th>Credits / USD</th><th>Saved (local time)</th></tr></thead>
        <tbody>{data?.versions.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.effectivePeriod}</td><td>{row.pricingType==="percentage"?"Percentage markup":"Fixed monthly fee"}</td>
          <td>{row.pricingType==="percentage"?creditNumber(row.aocFee)+"%":usd(row.aocFee)+" / month"}</td><td>{creditNumber(row.creditsPerUsd)}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>
      {data && !data.versions.length && <p>No pricing has been saved.</p>}
    </details>
  </div>;
}
