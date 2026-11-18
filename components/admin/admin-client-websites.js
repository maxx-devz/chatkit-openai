"use client";
import {useEffect,useState} from "react";
import styles from "./admin-dashboard.module.css";
export default function AdminClientWebsites({clientId}) {
  const [state,setState]=useState({data:null,error:""});
  useEffect(()=>{let active=true;const controller=new AbortController();
    fetch('/api/admin/client-operations?'+new URLSearchParams({clientId}),{cache:'no-store',signal:controller.signal})
      .then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error);return value;})
      .then(data=>{if(active)setState({data,error:""});}).catch(error=>{if(active)setState({data:null,error:error.message});});
    return()=>{active=false;controller.abort();};},[clientId]);
  const data=state.data?.clientId===clientId?state.data:null;
  return <section className={styles.settingsCard}><h3>Website Insights websites</h3>
    <p>Separate from the AI web-search domain. The client workspace supports multiple monitored websites; these do not broaden AI search permissions.</p>
    {state.error?<p role="alert">{state.error}</p>:!data?<p role="status">Loading website status…</p>:!data.websitesReady?<p>Website Insights tables are not installed. Review its setup migration before using this integration.</p>
      :<><p>{data.websites.length} active monitored {data.websites.length===1?'website':'websites'}. Managed in the client’s Website Insights workspace.</p>
        {data.websites.length?<ul>{data.websites.map(site=><li key={site.url}>{site.name} · {site.url}</li>)}</ul>:<p>No monitored websites have been saved for this client.</p>}</>}
  </section>;
}
