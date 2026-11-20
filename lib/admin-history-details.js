const descriptions={
 'aoc.audit.read':['Read audit history','The administrator read the audit history.'],
 'aoc.client.create':['Created client account','A client workspace and its initial account were created.'],
 'aoc.client.update':['Updated client settings','A change to this client’s settings was recorded.'],
 'aoc.client.usage_reset':['Reset client usage reporting','A client usage-reporting reset was recorded.'],
 'aoc.provider.update':['Updated AI provider settings','A change to the shared AI provider configuration was recorded. Private credentials are excluded.'],
 'aoc.model.update':['Updated AI model','A change to the configured AI model was recorded.'],
 'aoc.builder.save':['Saved assistant draft','An assistant configuration draft was saved.'],
 'aoc.builder.publish':['Published assistant settings','An assistant configuration was published.'],
 'aoc.builder.reset':['Reset assistant draft','An assistant draft reset was recorded.'],
 'client.admin_grant':['Granted client administrator access','Client Administrator access was granted to the referenced account.'],
 'client.admin_revoke':['Revoked client administrator access','Client Administrator access was revoked for the referenced account.'],
 'client.create':['Added client member','An account was added to this client’s membership.'],
 'client.role_change':['Changed client member role','A role change for this client membership was recorded.'],
 'client.deactivate':['Deactivated client access','Access was deactivated for the referenced client membership.'],
 'client.reactivate':['Reactivated client access','Access was reactivated for the referenced client membership.'],
 'client.member_add':['Added client member','An account was added to this client’s membership.'],
 'client.member_update':['Updated client membership','A change to the referenced client membership was recorded.'],
 'client.member_deactivate':['Deactivated client membership','Access was deactivated for the referenced client membership.'],
};
const httpNames={200:'OK',201:'Created',202:'Accepted',204:'No content',301:'Moved permanently',302:'Redirect',303:'See other',304:'Not modified',307:'Temporary redirect',308:'Permanent redirect',400:'Bad request',401:'Sign-in required',403:'Access denied',404:'Not found',405:'Method not allowed',408:'Request timeout',409:'Conflict',410:'No longer available',413:'Request too large',422:'Validation failed',429:'Too many requests',500:'Internal server error',502:'Upstream error',503:'Service unavailable',504:'Upstream timeout'};
export function historicalAuditDetails(event){
 const [action,description]=descriptions[event.action]||[String(event.action||'Recorded action').replaceAll(/[._]/g,' '),'This administrative event was recorded. Earlier values and response details were not stored in this entry.'];
 const id=String(event.target_id||'');
 const target=event.target_type==='audit'?'Audit log':event.target_type==='member'?`Account${id?' #'+id:''}`:event.target_type==='client'?`Client${id?' #'+id:''}`:event.target_type==='builder'?'Assistant configuration':event.target_type==='provider'?'AI provider configuration':event.target_type==='model'?'AI model configuration':id||'Not specified';
 const request=event.request_details;
 const status=Number.isInteger(request?.http_status)&&request.http_status>=100&&request.http_status<=599?request.http_status:null;
 const http=status?`${status} ${httpNames[status]||(status>=500?'Server error':status>=400?'Request error':status>=300?'Redirect':'Response recorded')}`:'Not recorded';
 const outcome=request?.outcome==='failed'?'Failed':request?.outcome==='denied'?'Denied':request?.outcome==='cancelled'?'Cancelled':request?.outcome==='succeeded'?'Completed':'Event recorded';
 const tone=request?.outcome==='failed'||request?.outcome==='denied'||status>=400?'error':request?.outcome==='cancelled'?'warning':status?'success':'neutral';
 return {action,description,target,http,outcome,tone,request,
  message:request?.summary|| (event.request_details_unavailable?'The response details could not be loaded. Refresh the log to retry.':'This entry did not store an HTTP response code or response message.')};
}
