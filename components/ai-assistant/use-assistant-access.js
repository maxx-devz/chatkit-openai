"use client";

import {useCallback,useEffect,useRef,useState} from 'react';

const CHECK_TIMEOUT_MS=12_000;
const RETRY_DELAYS_MS=[1000,2000,5000,10000,30000];

export function useAssistantAccess(clientId) {
  const [state,setState]=useState({clientId:null,access:null,error:''});
  const refreshRef=useRef(null);
  useEffect(()=>{
    // Every effect lifetime owns its request. Strict Mode's cancelled first
    // request must never be reused by the second mount.
    let active=true,pending=null,lastAccess=null,retries=0,retryTimer=null;
    const lifetime=new AbortController();
    const clearRetry=()=>{window.clearTimeout(retryTimer);retryTimer=null;};
    function scheduleRetry() {
      if(!active || document.hidden || !navigator.onLine)return;
      const delay=RETRY_DELAYS_MS[Math.min(retries++,RETRY_DELAYS_MS.length-1)];
      clearRetry();retryTimer=window.setTimeout(()=>void refresh(),delay);
    }
    async function check() {
      const timeout=new AbortController();
      const timer=window.setTimeout(()=>timeout.abort(),CHECK_TIMEOUT_MS);
      let retryable=true;
      try {
        const response=await fetch('/api/ai-access',{cache:'no-store',credentials:'same-origin',
          signal:AbortSignal.any([lifetime.signal,timeout.signal])});
        if(!response.ok) {
          retryable=response.status===408 || response.status===429 || response.status>=500;
          throw Error(response.status===401?'Your session expired. Sign in again to use your assistant.'
            :response.status===403?'Assistant access is unavailable for this account. Contact Always Open Commerce.'
              :'Assistant access could not be checked.');
        }
        const data=await response.json();
        if(typeof data?.ai?.enabled!=='boolean')throw Error('Assistant access response was incomplete.');
        if(!active)return;
        retries=0;lastAccess=data.ai;
        setState({clientId,access:lastAccess,error:''});
      } catch(error) {
        if(!active || lifetime.signal.aborted)return;
        if(!retryable) {
          lastAccess=null;
          // Permission and authentication failures are never treated as access.
          setState({clientId,access:null,error:error.message});
        } else {
          // A temporary metadata failure must not unmount an active answer.
          setState({clientId,access:lastAccess,error:lastAccess?''
            :navigator.onLine?'Connecting to your assistant. Retrying automatically...'
              :'Waiting for your internet connection. The assistant will reconnect automatically.'});
          scheduleRetry();
        }
      } finally {window.clearTimeout(timer);}
    }
    function refresh() {
      if(!active || document.hidden)return Promise.resolve();
      if(pending)return pending;
      clearRetry();
      pending=check().finally(()=>{pending=null;});
      return pending;
    }
    const refreshVisible=()=>{if(!document.hidden)void refresh();};
    refreshRef.current=refresh;
    void refresh();
    const interval=window.setInterval(refreshVisible,60_000);
    window.addEventListener('focus',refreshVisible);
    window.addEventListener('online',refreshVisible);
    document.addEventListener('visibilitychange',refreshVisible);
    return()=>{
      active=false;
      if(refreshRef.current===refresh)refreshRef.current=null;
      lifetime.abort();clearRetry();window.clearInterval(interval);
      window.removeEventListener('focus',refreshVisible);
      window.removeEventListener('online',refreshVisible);
      document.removeEventListener('visibilitychange',refreshVisible);
    };
  },[clientId]);
  const refreshAccess=useCallback(()=>refreshRef.current?.() || Promise.resolve(),[]);
  return {...(state.clientId===clientId?state:{access:null,error:''}),refreshAccess};
}
