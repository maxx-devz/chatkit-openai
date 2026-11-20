import AdminHistoricalRecords from '@/components/admin/admin-historical-records';
import AdminShell from '@/components/admin/admin-shell';
import AdminAuditTimeline from '@/components/admin/admin-audit-timeline';
export default function Page(){return <AdminShell admin={{name:'Synthetic Administrator',username:'synthetic',id:'1'}} active="audit" title="Audit Log" description="Administrative activity and safe diagnostic details."><AdminAuditTimeline/><AdminHistoricalRecords rows={[
 {kind:'action',id:'1',client_name:'Alpha',actor_name:'Synthetic Administrator',occurred_at:'2026-11-20T05:00:00Z',action:'aoc.client.update',target_type:'client',target_id:'2'},
 {kind:'action',id:'2',client_name:'Alpha',actor_name:'Synthetic Administrator',occurred_at:'2026-11-20T05:01:00Z',action:'aoc.client.create',target_type:'client',target_id:'2',request_details:{http_status:201,outcome:'succeeded',summary:'The server completed this request successfully.',request_id:'11111111-1111-4111-8111-111111111111',method:'POST',route:'/api/admin/clients',duration_ms:120}},
 {kind:'access',id:'3',client_name:'Alpha',actor_name:'Synthetic Administrator',occurred_at:'2026-11-20T05:01:00Z',action:'client.admin_grant',target_type:'member',target_id:'62',request_details:{http_status:404,outcome:'failed',summary:'The requested record or resource was not available.',request_id:'22222222-2222-4222-8222-222222222222',method:'POST',route:'/api/admin/clients',error_code:'client_not_found',source_location:'/lib/example.js:42:1'}},
 ]}/></AdminShell>;}
