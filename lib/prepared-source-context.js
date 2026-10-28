import "server-only";
import { findApplicablePreparedPublications, preparedBinding, readPreparedDocuments, publicationRecord } from "./prepared-source-store.js";
import { assertPreparedSourceFreshness, approvedSourceInstructions, retrievePreparedReferences, CLIENT_SOURCE_PRIVACY_NOTICE } from "./prepared-source-policy.js";
import { DriveSourceError } from "./drive-source-policy.js";

// Chat's hot path: database only. Never imports/calls Drive, export, sync, or an embedding provider.
export async function loadPreparedSourceContext(scope, question, mode = "work") {
  const rows = (await findApplicablePreparedPublications(scope)).filter(row => row.enabled);
  if (!rows.length) return { instructions: "", references: [], checkedAt: null };
  const instructionParts = [], referenceGroups = [];
  let characters = 0;
  for (const row of rows) {
    assertPreparedSourceFreshness(row, preparedBinding(row));
    const documents = await readPreparedDocuments(row);
    const publication = publicationRecord(row);
    const instructions = approvedSourceInstructions(publication, documents, { privateSources: Boolean(scope.clientId) });
    characters += publication.instructionIds.reduce((sum, id) => sum + (documents.find(doc => doc.id === id)?.text.length || 0), 0)
      + publication.additionalInstructions.length;
    if (characters > 14_000) throw new DriveSourceError("instructions_too_large", "Shared and audience-specific instructions exceed 14,000 characters. Ask an administrator to simplify the approved rules.", 503);
    if (instructions) instructionParts.push((row.audience === "clients" ? "Shared company guidance" : "Audience-specific guidance") + ":\n" + instructions);
    referenceGroups.push(retrievePreparedReferences(publication, documents, question, mode));
  }
  // Interleave relevant results so an optional client pack cannot starve the shared pack.
  const references = [], seen = new Set();
  for (let index = 0; index < 4; index++) for (const group of referenceGroups) {
    const reference = group[index];
    const key = reference && reference.citation + ":" + reference.revision + ":" + reference.text;
    if (reference && !seen.has(key) && references.length < 4) { seen.add(key); references.push(reference); }
  }
  if (scope.clientId) instructionParts.push(CLIENT_SOURCE_PRIVACY_NOTICE);
  return { instructions: instructionParts.join("\n\n"), references,
    checkedAt: rows.reduce((oldest, row) => new Date(row.checked_at) < new Date(oldest) ? row.checked_at : oldest, rows[0].checked_at) };
}
