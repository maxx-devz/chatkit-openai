import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { databasePool } from "./database.js";
import { captureAuthMail } from "./auth-mail.js";
export async function issueInvitationLink(context, id) {
  const token = randomBytes(32).toString("hex"), hash = createHash("sha256").update(token).digest("hex");
  const data = (await databasePool.query("SELECT agency_platform.issue_invitation_link($1,$2,$3,$4,$5) data", [context.actor, context.session, context.agency.id, id, hash])).rows[0].data;
  const branded=(await databasePool.query("SELECT to_regprocedure('agency_platform.public_brand(text)') IS NOT NULL ready")).rows[0]?.ready;
  await captureAuthMail({ recipient: data.recipient, kind: "invitation", invitationId: id, token, agencySlug:branded?context.agency.slug:undefined });
  return { captured: true };
}
export async function acceptInvitationLink(context, id, token, agencySlug) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw Object.assign(Error("Invitation unavailable."), { code: "42501" });
  const hash = createHash("sha256").update(token).digest("hex");
  if(agencySlug)await databasePool.query("SELECT agency_platform.accept_brand_invitation($1,$2,$3,$4,$5)",[context.actor,context.session,id,hash,agencySlug]);
  else await databasePool.query("SELECT agency_platform.accept_invitation_link($1,$2,$3,$4)", [context.actor, context.session, id, hash]);
}
