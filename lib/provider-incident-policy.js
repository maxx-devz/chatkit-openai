const messages={
 provider_configuration_failed:'AI provider configuration needs attention. Check the server-side key, encryption and selected model settings.',
 insufficient_quota:'Provider API quota or billing limit reached. Check the provider account billing and usage limits.',
 credit_balance_exhausted:'The provider account has no available API credits. Restore its balance in provider billing.',
 rate_limit_exceeded:'The provider temporarily rate-limited this request. Wait before retrying; check its request and token limits.',
 slow_down:'The provider asked for slower request traffic. Wait before retrying.',
 server_is_overloaded:'The selected provider model is temporarily overloaded. Retry later.',
 authentication_failed:'The provider rejected its credentials. Check the private provider settings.',
 model_unavailable:'The configured model is unavailable to this provider account. Check model access and settings.',
 provider_policy_restricted:'Provider policy prevents this model request. Review the provider routing/privacy settings.',
 request_timeout:'The provider request timed out. Check provider status and server connectivity.',
 connection_failed:'The server could not connect to the AI provider. Check server network access.',
 reply_interrupted:'The reply was interrupted before accounting completed. The client is not charged for this unsuccessful reply.',
 usage_unavailable:'A completed reply has incomplete usage metadata. Check model pricing and usage recording; do not guess a cost.',
 request_failed:'The AI request failed. Use the request reference to inspect sanitized server logs.'
};
const quotaAliases=new Set(['billing_hard_limit_reached','billing_not_active','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded']);
export function providerIncident(row){
 const raw=typeof row.error_code==='string'?row.error_code:'request_failed';
 const code=Object.hasOwn(messages,raw)||quotaAliases.has(raw)?raw:'request_failed';
 return {code,message:messages[quotaAliases.has(code)?'insufficient_quota':code],
  httpStatus:/^[1-5][0-9]{2}$/.test(String(row.http_status??''))?String(row.http_status):'Not supplied',
  provider:row.provider==='openai'?'OpenAI':row.provider==='openrouter'?'OpenRouter':'AI provider'};
}
