import "server-only";
import { findPreparedPublication, preparedBinding, decodePreparedDocuments, publicationRecord } from "./prepared-source-store.js";
import { assertPreparedSourceFreshness, approvedSourceInstructions, retrievePreparedReferences } from "./prepared-source-policy.js";

// Chat's hot path: database only. Never imports/calls Drive, export, sync, or an embedding provider.
export async function loadPreparedSourceContext(scope, question, mode = "work") {
  const row = await findPreparedPublication(scope);
  if (!row?.enabled) return { instructions: "", references: [], checkedAt: null };
  assertPreparedSourceFreshness(row, preparedBinding(row));
  const documents = decodePreparedDocuments(row);
  const publication = publicationRecord(row);
  return { instructions: approvedSourceInstructions(publication, documents),
    references: retrievePreparedReferences(publication, documents, question, mode), checkedAt: row.checked_at };
}
