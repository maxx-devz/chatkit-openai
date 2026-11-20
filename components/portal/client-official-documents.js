"use client";
import {useEffect,useId,useState} from "react";
import Link from "next/link";
import {DOCUMENT_CATEGORIES} from "@/lib/client-document-categories";
import {CLIENT_JOURNEY_STEPS,clientJourneyProgress,clientStepForStage} from "@/lib/client-journey";
import s from "./client-official-documents.module.css";

const emptyFilters = {search:"",category:"",step:""};
function NextAction({journey,summary}) {
  const action = journey?.nextAction?.trim();
  return <section className={s.next} aria-label="Your next action">
    <div><small>{action ? "ATTENTION NEEDED" : "NEXT ACTION"}</small><h3>Your next action</h3></div>
    <p>{action || "Your team has not recorded a client action yet. Contact your AOC team if you need guidance."}</p>
    {action && <p className={s.context}>Recorded by your AOC team{journey?.updatedAt ? ` · ${new Date(journey.updatedAt).toLocaleDateString()}` : ""}</p>}
    {summary && <Link href="/?view=documents#approved-engagement-documents" prefetch={false}>Open your documents</Link>}
  </section>;
}
function Journey({journey,summary}) {
  const progress = clientJourneyProgress(journey);
  return <section className={s.journey} aria-label="Your five-step journey">
    <h3>Your journey</h3>
    {progress.currentStep ? <p className={s.stepHeading}><strong>{progress.completed ? "Journey complete" : `Step ${progress.currentStep} of 5: ${CLIENT_JOURNEY_STEPS[progress.currentStep-1]}`}</strong></p>
      : <p>Your team has not recorded verified journey progress yet. Contact your AOC team for your next step.</p>}
    {!summary && <ol className={s.stages}>{progress.steps.map(step => <li key={step.step}
      className={step.status === "Current" ? s.current : step.status === "Completed" ? s.completed : undefined}
      aria-current={step.status === "Current" ? "step" : undefined}>
      <div><strong>{step.step}. {step.name}</strong><small>{step.status}</small></div>
    </li>)}</ol>}
    {!!journey?.evidenceSummary && <p>{journey.evidenceSummary}</p>}
    {!!journey?.updatedAt && <small>Progress updated {new Date(journey.updatedAt).toLocaleDateString()}</small>}
  </section>;
}
export default function ClientOfficialDocuments({clientId,summary=false}) {
  const [data,setData] = useState(null), [error,setError] = useState(""), [reload,setReload] = useState(0);
  const [draft,setDraft] = useState(emptyFilters), [query,setQuery] = useState({...emptyFilters,page:0});
  const inputId = useId();
  useEffect(() => {
    const controller = new AbortController(); let request = 0;
    async function load() {
      const sequence = ++request; setData(null); setError("");
      const params = new URLSearchParams({clientId,page:String(query.page),search:query.search,category:query.category,step:query.step});
      try {
        const response = await fetch("/api/client-documents?"+params,{signal:controller.signal,cache:"no-store",headers:{"x-aoc-document-client":clientId}});
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Documents could not be loaded.");
        if (!controller.signal.aborted && sequence === request) setData(result);
      } catch (failure) { if (!controller.signal.aborted && sequence === request) setError(failure.message); }
    }
    const visible = () => { if (document.visibilityState === "visible") load(); else { ++request; setData(null); } };
    Promise.resolve().then(load);
    window.addEventListener("focus",load); document.addEventListener("visibilitychange",visible);
    return () => { controller.abort(); window.removeEventListener("focus",load); document.removeEventListener("visibilitychange",visible); };
  },[clientId,reload,query]);
  function filter(event) { event.preventDefault(); setData(null); setQuery({...draft,search:draft.search.trim(),page:0}); }
  function clear() { setDraft(emptyFilters); setData(null); setQuery({...emptyFilters,page:0}); }
  function choose(name,value) {
    const next = {...draft,[name]:value}; setDraft(next); setData(null); setQuery({...next,search:next.search.trim(),page:0});
  }
  const filtered = Boolean(query.search || query.category || query.step);
  const items = data?.items || [], journey = data?.journey;
  return <section className={`${s.panel}${summary ? " "+s.summary : ""}`} aria-label="Official client documents and journey">
    <header><div><small>YOUR CLIENT WORKSPACE</small><h2>Documents & journey</h2><p>Your approved engagement documents and verified next step.</p></div>
      {summary && <Link href="/?view=documents" prefetch={false}>View all documents</Link>}
    </header>
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload(v => v+1)}>Try again</button></div>
      : !data ? <p role="status">Loading your documents…</p> : <>
        <NextAction journey={journey} summary={summary}/>
        <Journey journey={journey} summary={summary}/>
      </>}
    {!summary && <form className={s.filters} onSubmit={filter} aria-label="Find approved documents">
      <div className={s.search}><label htmlFor={inputId+"-search"}>Search document titles</label>
        <input id={inputId+"-search"} value={draft.search} onChange={e => setDraft(old => ({...old,search:e.target.value}))} maxLength={180} placeholder="For example: audit report" type="search"/>
      </div>
      <div><label htmlFor={inputId+"-type"}>Document type</label><select id={inputId+"-type"} value={draft.category} onChange={e => choose("category",e.target.value)}>
        <option value="">All document types</option>{Object.entries(DOCUMENT_CATEGORIES).map(([value,name]) => <option key={value} value={value}>{name}</option>)}
      </select></div>
      <div><label htmlFor={inputId+"-step"}>Journey step</label><select id={inputId+"-step"} value={draft.step} onChange={e => choose("step",e.target.value)}>
        <option value="">All journey steps</option>{CLIENT_JOURNEY_STEPS.map((name,i) => <option key={name} value={i+1}>{i+1}. {name}</option>)}
      </select></div>
      <div className={s.filterActions}><button type="submit" className={s.primary}>Search documents</button>{(filtered || draft.search) && <button type="button" onClick={clear}>Clear filters</button>}</div>
    </form>}
    {!!data && !error && <section id="approved-engagement-documents" aria-label="Approved engagement documents">
      <div className={s.documentHeading}><h3>Approved documents</h3>{!summary && items.length > 0 && <small>{items.length} on this page · Page {query.page+1}</small>}</div>
      {items.length ? <ul className={s.files}>{items.slice(0,summary ? 3 : 50).map(item => {
        const step = clientStepForStage(item.stage);
        return <li key={item.id}><div><strong>{item.title}</strong>
          <small>{DOCUMENT_CATEGORIES[item.category]}{step ? ` · Step ${step}: ${CLIENT_JOURNEY_STEPS[step-1]}` : ""} · Version {item.version}</small>
          <small>Approved {new Date(item.publishedAt).toLocaleDateString()}</small>
        </div><div className={s.actions}>
          {item.canView && <a href={item.viewUrl} target="_blank" rel="noreferrer">View</a>}<a href={item.downloadUrl}>Download</a>
        </div></li>;
      })}</ul> : filtered ? <div className={s.empty} role="status"><strong>No matching documents</strong><p>Try another title, document type or journey step.</p></div>
        : <p>No approved documents are available yet. Your team will add client-facing files here when they are ready.</p>}
      {!summary && (query.page > 0 || data.hasMore) && <nav className={s.actions} aria-label="Document pages">
        <button type="button" disabled={query.page === 0} onClick={() => {setData(null);setQuery(old => ({...old,page:old.page-1}));}}>Previous documents</button>
        <span>Page {query.page+1}</span>
        <button type="button" disabled={!data.hasMore} onClick={() => {setData(null);setQuery(old => ({...old,page:old.page+1}));}}>Next documents</button>
      </nav>}
      {!summary && <p className={s.note}>The step on a document describes where it belongs, not your current progress. Document emails continue as usual. Opening a file does not record acceptance or confirm payment.</p>}
    </section>}
  </section>;
}
