import 'server-only';
import { databasePool } from './database.js';
import { findInternalUser } from './internal-user-repository.js';
import { InternalUserError } from './internal-user-errors.js';

export function internalUserDatabase() {
  if (!process.env.DATABASE_URL) throw new InternalUserError('internal_user_unavailable', 'Internal user access needs administrator setup.');
  return databasePool;
}

export async function assertNotInternalUser(externalId) {
  const internalUser = await findInternalUser(internalUserDatabase(), externalId);
  // Inactive internal user accounts must not fall back into client/admin privileges either.
  if (internalUser) throw new InternalUserError('internal_user_only', 'Use your Internal Portal to access your work.', 403);
}
