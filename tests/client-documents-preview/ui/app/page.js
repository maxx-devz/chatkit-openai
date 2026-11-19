import ClientDocumentsPrototype, {ClientDocumentsDashboardPrototype} from '../../../../components/portal/client-documents-prototype';
export default async function Page({searchParams}) {
 const params=await searchParams;
 return <main style={{maxWidth:1200,margin:'0 auto',padding:20}}>{params.mode==='dashboard'?<ClientDocumentsDashboardPrototype/>:<ClientDocumentsPrototype admin={params.mode==='admin'}/>}</main>;
}
