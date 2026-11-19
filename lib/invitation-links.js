import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { databasePool } from "./database.js";
import { captureAuthMail } from "./auth-mail.js";
export async function issueInvitationLink(context, id) {
  const token = randomBytes(32).toString("hex"), hash = createHash("sha256").update(token).digest("hex");
  const data = (await databasePool.query("SELECT agency_platform.issue_invitation_link($1,$2,$3,$4,$5) data", [context.actor, context.session, context.agency.id, id, hash])).rows[0].data;
  await captureAuthMail({ recipient: data.recipient, kind: "invitation", invitationId: id, token });
  return { captured: true };
}
export async function acceptInvitationLink(context, id, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw Object.assign(Error("Invitation unavailable."), { code: "42501" });
  const hash = createHash("sha256").update(token).digest("hex");
  await databasePool.query("SELECT agency_platform.accept_invitation_link($1,$2,$3,$4)", [context.actor, context.session, id, hash]);
}
