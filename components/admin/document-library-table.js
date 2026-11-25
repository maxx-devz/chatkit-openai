"use client";
import {useEffect,useRef,useState} from 'react';
import s from './client-document-assignments.module.css';
const keyFor=item=>[item.kind,item.storage||'legacy',item.id,item.revision].join(':');
export default function DocumentLibraryTable({client,assignments,Row,onEdit,onSaved,onRefresh,loading,change}){
 const [search,setSearch]=useState(''),[sort,setSort]=useState('newest'),[selected,setSelected]=useState({}),[errors,setErrors]=useState({}),[busy,setBusy]=useState(false),[report,setReport]=useState(''),[blocked,setBlocked]=useState(false),[hidden,setHidden]=useState({});
 const alive=useRef(true),active=useRef(false),controller=useRef(null),receipts=useRef(new Map());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 const items=assignments.filter(item=>!hidden[keyFor(item)]&&[item.title,item.description||'',item.filename||''].some(value=>value.toLowerCase().includes(search.trim().toLowerCase()))).toSorted((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort.startsWith('size')?((a.sizeBytes==null)-(b.sizeBytes==null))||(sort==='size-asc'?(a.sizeBytes||0)-(b.sizeBytes||0):(b.sizeBytes||0)-(a.sizeBytes||0)):(sort==='oldest'?1:-1)*((Date.parse(a.updatedAt)||0)-(Date.parse(b.updatedAt)||0)));
 const libraryEmpty=assignments.every(item=>hidden[keyFor(item)]);
 const chosen=items.filter(item=>selected[keyFor(item)]),allSelected=items.length>0&&chosen.length===items.length;
 async function removeSelected(){
  if(active.current||loading||blocked||!chosen.length)return;
  if(!window.confirm('Delete '+chosen.length+' selected document'+(chosen.length===1?'':'s')+' from '+client.name+'’s portal library? Uploaded files will also be permanently removed from storage. Google Drive originals and audit records stay saved.'))return;
  const batch=chosen.slice();active.current=true;setBusy(true);setReport('');let deleted=0,failed=0,cleanupPending=0,stopped=false;
  try{
   for(const item of batch){
    if(!alive.current)break;const key=keyFor(item),uploaded=item.kind==='upload';
    let operation=receipts.current.get(key);if(!operation){operation=crypto.randomUUID();receipts.current.set(key,operation);}
    const body={action:'archive',clientId:client.id,id:item.id,revision:item.revision,operation,...(!uploaded?{reason:'Removed selected client document'}:{})};
    const abort=new AbortController();controller.current=abort;
    try{
     const result=await change(client.id,body,uploaded,item.storage==='supabase',abort.signal);
     if(result.saved!==true)throw Error('Deletion could not be confirmed. Retry this selected row safely.');
     if(!alive.current)break;if(result.storageCleanupPending)cleanupPending++;deleted++;receipts.current.delete(key);setHidden(old=>({...old,[key]:true}));setSelected(old=>({...old,[key]:false}));setErrors(old=>({...old,[key]:''}));
    }catch(error){
     if(!alive.current)break;failed++;setErrors(old=>({...old,[key]:error.message}));
     if([401,403,404,409,429,503].includes(error.status)){stopped=true;if([401,403,404].includes(error.status)){setBlocked(true);setSelected({});}break;}
    }finally{if(controller.current===abort)controller.current=null;}
   }
   if(alive.current){const remaining=batch.length-deleted-failed,summary=deleted+' of '+batch.length+' selected documents deleted'+(failed?' · '+failed+' need attention':'')+(remaining?' · '+remaining+' not attempted':'')+'.';setReport(summary+(cleanupPending?' Storage cleanup needs a retry for '+cleanupPending+' file(s).':'')+(stopped?' Processing stopped; refresh before continuing.':''));await onSaved(summary+(cleanupPending?' Storage cleanup is pending; use Retry storage cleanup.':''),failed>0||remaining>0||cleanupPending>0);}
  }finally{active.current=false;if(alive.current)setBusy(false);}
 }
 return <section className={s.simpleLibrary} aria-label="Saved documents">
 <div className={s.simpleToolbar}><div><label htmlFor={'document-search-'+client.id}>Search documents</label><input id={'document-search-'+client.id} type="search" disabled={busy} value={search} onChange={event=>{setSearch(event.target.value);setSelected({});}} placeholder="Search title, description or filename"/></div><div><label htmlFor={'document-sort-'+client.id}>Sort documents</label><select id={'document-sort-'+client.id} value={sort} disabled={busy} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="size-asc">Smallest file first</option><option value="size-desc">Largest file first</option></select></div><button type="button" disabled={loading||busy} onClick={()=>onRefresh()}>{loading?'Refreshing…':'Refresh documents'}</button></div>
 {items.length>0&&<div className={s.librarySelection}><label className={s.checkbox}><input type="checkbox" aria-label="Select all shown documents" checked={allSelected} ref={node=>{if(node)node.indeterminate=chosen.length>0&&!allSelected;}} disabled={busy||loading||blocked||!items.length} onChange={event=>setSelected(event.target.checked?Object.fromEntries(items.map(item=>[keyFor(item),true])):{})}/>Select shown documents</label><span>{chosen.length} selected</span><button type="button" data-action="danger" disabled={busy||loading||blocked||!chosen.length} onClick={removeSelected}>{busy?'Deleting selected…':'Delete selected ('+chosen.length+')'}</button>{chosen.length>0&&<button type="button" disabled={busy} onClick={()=>setSelected({})}>Clear selection</button>}</div>}
 {report&&<p role="status" className={s.bulkSummary}>{report}</p>}
 {blocked?<p role="alert" className={s.error}>Access changed. Reload the page before continuing. No further documents will be deleted.</p>:!items.length?<div className={s.libraryEmpty} aria-label={libraryEmpty?'Empty document library':'No matching documents'}>
 <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/><path d="M8 13h8m-4-4v8"/></svg>
 <h2>{libraryEmpty?'Library is empty':'No matching documents'}</h2>
 <p>{libraryEmpty?Object.keys(hidden).length?'All selected documents have been removed. You can add new files or Google Drive links at any time.':'No documents have been added for '+client.name+' yet. Add a file or Google Drive link to get started.':'Try a different title, description or filename.'}</p>
 {libraryEmpty?<a href={'#document-form-'+client.id}>Add a document</a>:<button type="button" onClick={()=>{setSearch('');setSelected({});}}>Clear search</button>}
 </div>:<div className={s.tableContainer}><table className={s.quickTable+' '+s.selectableTable}><caption className="sr-only">Documents for {client.name}</caption><thead><tr><th scope="col"><span className="sr-only">Select</span></th><th scope="col">Document</th><th scope="col">Size</th><th scope="col">Visibility</th><th scope="col">Actions</th></tr></thead><tbody>{items.length?items.map(item=><Row key={keyFor(item)} item={item} client={client} onEdit={onEdit} onSaved={onSaved} disabled={busy} selection={{checked:Boolean(selected[keyFor(item)]),disabled:busy||loading,onChange:checked=>setSelected(old=>({...old,[keyFor(item)]:checked}))}} selectionError={errors[keyFor(item)]}/>):<tr><td colSpan={5} className={s.noMatches}>{search?'No matching documents.':'No documents yet. Add a file or link above.'}</td></tr>}</tbody></table></div>}
 {items.length>0&&<p className={s.listHelp}>Select documents, then delete them together. Each deletion is checked and logged separately. Failed rows stay selected for retry; deleted rows are never repeated. Uploaded files will also be permanently removed from storage. Google Drive originals and audit records stay saved.</p>}
 {assignments.length>=100&&<p className={s.muted}>Search covers the loaded document list (up to 100 links, 100 legacy uploads and 100 Storage uploads).</p>}
 </section>;
}
