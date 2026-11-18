// One selected client only. No all-project browser runner or direct Hubstaff calls.
export function clientIndexComplete(client) {
  return Boolean(client?.available && client.savedMetadataComplete && !client.refreshing && !client.syncing && !client.queuedAt
    && Number(client.savedPendingTasks)===0);
}

export function createClientIndexMonitor({clientId,fetchImpl=fetch,onClient,onBusy,onRunning,onError,
  now=Date.now,schedule=setTimeout,unschedule=clearTimeout,
  isVisible=()=>typeof document==="undefined" || document.visibilityState!=="hidden"}={}) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(clientId))) throw new Error("Choose a client.");
  clientId=String(clientId);
  const endpoint="/api/admin/hubstaff-index";
  let running=false,automatic=false,busy=false,controller,timer,reading,client=null,retryAt=0,failures=0;
  const setAutomatic=value=>{automatic=value;onRunning?.(value);};
  function failure(error) {
    if (!running || controller.signal.aborted) return;
    failures++;
    retryAt=now()+Math.max(error.status===429?60_000:0,error.retryAfter || 0,
      Math.min(300_000,15_000*2**Math.min(failures-1,5)));
    if ([401,403].includes(error.status)) {
      setAutomatic(false);
      if(error.code!=="hubstaff_access_denied") {
        running=false;unschedule(timer);controller.abort();
      }
    }
    onError?.(error.message);
  }
  async function request(options={}) {
    const response=await fetchImpl(endpoint+(options.method?"":"?clientId="+encodeURIComponent(clientId)),{
      ...options,credentials:"same-origin",cache:"no-store",signal:controller.signal,
    });
    const data=await response.json().catch(()=>({}));
    if (!response.ok) {
      const error=new Error(typeof data.error==="string"?data.error:"Project synchronization is unavailable. Try again shortly.");
      Object.assign(error,{status:response.status,code:data.code,
        retryAfter:Math.min(300,Math.max(0,Number(data.retryAfterSeconds || response.headers.get("retry-after")) || 0))*1000});
      throw error;
    }
    return data;
  }
  async function refresh() {
    if (reading) return reading;
    reading=(async()=>{
      const data=await request();
      if (!Array.isArray(data.clients)) throw new Error("Index status could not be read.");
      const selected=data.clients.find(item=>item.id===clientId) || null;
      if (!running) return;
      client=selected;onClient?.(client);
      if (client?.queuedAt && !automatic) setAutomatic(true);
      if (automatic && clientIndexComplete(client)) setAutomatic(false);
    })();
    try {await reading;} finally {reading=null;}
  }
  async function batch() {
    busy=true;onBusy?.(true);
    try {
      const data=await request({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId})});
      if (!running) return;
      if (!data.skipped && (data.clientId!==clientId || !Number.isSafeInteger(data.syncedTasks)
        || data.syncedTasks<0 || !Number.isSafeInteger(data.syncedComments) || data.syncedComments<0)) {
        throw new Error("Batch progress could not be verified. Saved pages will be checked again.");
      }
      failures=0;retryAt=now()+Math.max(12_000,(Number(data.retryAfterSeconds)||12)*1000);
      onError?.("");
      if (reading) await reading;
      await refresh();
    } catch(error) {failure(error);}
    finally {busy=false;if(running) onBusy?.(false);}
  }
  async function tick() {
    if (!running) return;
    try {
      if (!isVisible()) return;
      await refresh();
      if (running && automatic && !busy && client && !client.syncing
        && client.eligibleForBatch && now()>=retryAt) void batch();
    } catch(error) {failure(error);}
    finally {
      if (running) timer=schedule(tick,automatic || busy || client?.syncing || client?.queuedAt?5000:15000);
    }
  }
  return {
    start(){if(running)return;running=true;controller=new AbortController();void tick();},
    stop(){running=false;unschedule(timer);controller?.abort();},
    async queue(){
      if (!running || busy || automatic) return false;
      busy=true;onBusy?.(true);onError?.("");
      try {
        const result=await request({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId,action:"queue"})});
        if(!running)return false;
        if(result.clientId!==clientId || (!result.queued && !result.running)) throw new Error("The sync queue could not be verified.");
        failures=0;retryAt=0;setAutomatic(true);
        await refresh();
        return true;
      } catch(error){failure(error);return false;}
      finally {busy=false;if(running)onBusy?.(false);}
    },
  };
}
