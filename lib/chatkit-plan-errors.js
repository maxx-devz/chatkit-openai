// Curated messages only. Never forward provider bodies or arbitrary backend codes.
const messages={
 plan_exhausted:"Your AI credits are used up. Open Credits to request more or upgrade your plan.",
 plan_payment_due:"This month's plan is waiting for admin payment confirmation.",
 plan_paused:"Your AI plan is paused. Contact your administrator.",
 plan_reply_running:"An AI reply is already in progress for this client. Wait for it to finish, then retry.",
 plan_usage_unavailable:"AI usage recording needs administrator attention. Please contact your administrator. This is separate from your available portal credits.",
 plan_pending:"AI usage recording needs administrator attention. Please contact your administrator.",
 plan_access_revoked:"Your workspace access changed. Reload the portal.",
};
export function chatKitPlanErrorMessage(code){return Object.hasOwn(messages,code)?messages[code]:"";}
export function safeChatKitErrorCode(code){return Object.hasOwn(messages,code)?code:"backend_request_failed";}
