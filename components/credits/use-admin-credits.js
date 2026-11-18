"use client";
import {useEffect,useState} from "react";
export function useAdminCredits(clientId,period="") {
  const [state,setState]=useState({data:null,error:""}),[revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!clientId)return;
    let active=true;
    const controller=new AbortController();
    const query=new URLSearchParams({clientId,...(period?{month:period}:{})});
    fetch('/api/admin/credits?'+query,{cache:'no-store',credentials:'same-origin',signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error || 'Credit reporting could not load.');return data;})
      .then(data=>{if(active)setState({data,error:"",clientId,period});}).catch(error=>{if(active)setState({data:null,error:error.message,clientId,period});});
    return()=>{active=false;controller.abort();};
  },[clientId,period,revision]);
  const data=state.data?.clientId===clientId && (!period || state.data.period===period)?state.data:null;
  return {data,error:state.clientId===clientId && state.period===period?state.error:"",refresh:()=>setRevision(value=>value+1)};
}
