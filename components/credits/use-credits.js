"use client";
import {useEffect,useState} from "react";

export function useCredits(clientId,{period="",group="day",offset=0,summary=false,asOf=""}={}) {
  const [state,setState]=useState({data:null,error:""}),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true,inFlight=false,timers=[];
    const controller=new AbortController();
    const query=new URLSearchParams({group,offset:String(offset),...(period?{month:period}:{}),...(summary?{summary:"1"}:{}),...(asOf?{asOf}:{})});
    const accept=data=>setState(previous=>previous.data?.clientId===data.clientId && previous.data?.period===data.period
      && previous.data.fetchedAt>data.fetchedAt?previous:{data,error:""});
    async function load() {
      if(!active || inFlight || document.visibilityState==="hidden")return;
      inFlight=true;
      try {
        const response=await fetch("/api/credits?"+query,{headers:{"x-aoc-client":clientId},
          credentials:"same-origin",cache:"no-store",signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error || "AI Credits are unavailable.");
        if(data.clientId!==clientId)throw new Error("Your account changed. Reload this page.");
        if(active){accept(data);window.dispatchEvent(new CustomEvent("aoc:credits-snapshot",{detail:data}));}
      } catch(error) {if(active && !controller.signal.aborted)setState({data:null,error:error.message});}
      finally{inFlight=false;}
    }
    const changed=()=>{
      void load();
      // The provider's final usage can be committed just after the stream ends.
      timers.forEach(clearTimeout);
      timers=[setTimeout(load,2000),setTimeout(load,5000)];
    };
    void load();
    const interval=setInterval(load,60000);
    const snapshot=event=>{const value=event.detail;
      if(active && summary && value?.clientId===clientId && value.period===new Date().toISOString().slice(0,7))accept(value);
    };
    const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel("aoc-credits-updated"):null;
    if(channel)channel.onmessage=event=>{if(event.data?.all===true || event.data?.clientId===clientId)changed();};
    window.addEventListener("aoc:credits-snapshot",snapshot);
    window.addEventListener("aoc:ai-usage-changed",changed);
    window.addEventListener("focus",load);
    document.addEventListener("visibilitychange",load);
    return ()=>{active=false;controller.abort();clearInterval(interval);timers.forEach(clearTimeout);
      channel?.close();window.removeEventListener("aoc:credits-snapshot",snapshot);
      window.removeEventListener("aoc:ai-usage-changed",changed);window.removeEventListener("focus",load);
      document.removeEventListener("visibilitychange",load);};
  },[clientId,period,group,offset,summary,asOf,revision]);
  // Never display another period/client's previous response while switching.
  const data=state.data?.clientId===clientId && (!period || state.data.period===period)
    && (!state.data.ready || summary || (state.data.group===group && state.data.offset===offset))?state.data:null;
  return {data,error:state.error,refresh:()=>setRevision(value=>value+1)};
}
