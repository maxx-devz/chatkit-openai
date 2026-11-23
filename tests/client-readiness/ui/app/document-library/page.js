import ClientOfficialDocuments from '../../../../../components/portal/client-official-documents';
export default async function Page({searchParams}) {
 const params=await searchParams;
 const initialResult=params.initial?{clientId:params.initial==='foreign'?'2':'1',...(params.initial==='error'?{error:'Documents could not be loaded. Please try again.'}:{data:{items:[{id:'fixture-server-document',title:'SERVER_RENDERED_DOCUMENT',description:'Fictional authorized material.',publishedAt:'2026-11-23T00:00:00Z',delivery:'link',canView:true,viewUrl:'/allowed-document'}],hasMore:false}})}:undefined;
 return <main style={{maxWidth:1100,margin:'auto',padding:24}}><ClientOfficialDocuments key={params.client||'1'} clientId={params.client||'1'} initialResult={initialResult}/></main>;
}
