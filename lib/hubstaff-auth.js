import "server-only";

import { createHash } from "node:crypto";
import pg from "pg";
import {
  decryptHubstaffToken,
  encryptHubstaffToken,
} from "./hubstaff-token-crypto.js";

const TOKEN_ENDPOINT = "https://account.hubstaff.com/access_tokens";
const REFRESH_LOCK_ID = 1_495_234_690;
const MINIMUM_SECRET_LENGTH = 32;
const ACCESS_EXPIRY_MARGIN_MS = 2 * 60 * 1000;

const tokenPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 8_000,
  idleTimeoutMillis: 20_000,
});

function authError(code, message) {
  return Object.assign(new Error(message), { hubstaffAuthCode: code });
}

function encryptionSecret() {
  const secret = process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY?.trim() || "";
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw authError(
      "hubstaff_pat_encryption_missing",
      "PAT refresh is not configured. Add HUBSTAFF_TOKEN_ENCRYPTION_KEY with at least 32 random characters.",
    );
  }
  return secret;
}

function tokenFingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function exchangeRefreshToken(refreshToken) {
  let response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw authError(
      "hubstaff_pat_exchange_unreachable",
      "Hubstaff's token service could not be reached. Please try again shortly.",
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof payload?.error === "string" ? payload.error : "exchange_failed";
    const message = code === "rate_limit"
      ? "Hubstaff temporarily blocked PAT refresh attempts. Wait before retrying."
      : "Hubstaff rejected the PAT refresh token. Create a new PAT with hubstaff:read and tasks:read access.";
    throw authError(`hubstaff_pat_${code}`.slice(0, 100), message);
  }

  if (
    typeof payload?.access_token !== "string"
    || payload.access_token.length < 20
    || typeof payload?.refresh_token !== "string"
    || payload.refresh_token.length < 20
  ) {
    throw authError("hubstaff_pat_exchange_invalid", "Hubstaff returned an incomplete PAT refresh response.");
  }

  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86_400) * 1000),
  };
}

export async function getHubstaffPatAccessToken() {
  const seedRefreshToken = process.env.HUBSTAFF_PAT_REFRESH_TOKEN?.trim();
  if (!seedRefreshToken) {
    throw authError("hubstaff_pat_missing", "Add HUBSTAFF_PAT_REFRESH_TOKEN to use personal access token authentication.");
  }
  const secret = encryptionSecret();
  const seedFingerprint = tokenFingerprint(seedRefreshToken);
  const client = await tokenPool.connect().catch(() => {
    throw authError("hubstaff_pat_database_unavailable", "The PAT token store could not connect to the portal database.");
  });

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [REFRESH_LOCK_ID]);
    const { rows } = await client.query(
      "SELECT encrypted_access_token, encrypted_refresh_token, access_expires_at, seed_fingerprint FROM portal_hubstaff_tokens WHERE id=1 FOR UPDATE",
    );
    const saved = rows[0];
    const savedBelongsToSeed = saved
      && (!saved.seed_fingerprint || saved.seed_fingerprint === seedFingerprint);
    if (savedBelongsToSeed && new Date(saved.access_expires_at).valueOf() > Date.now() + ACCESS_EXPIRY_MARGIN_MS) {
      let accessToken;
      try {
        accessToken = decryptHubstaffToken(saved.encrypted_access_token, secret);
      } catch {
        throw authError(
          "hubstaff_pat_decryption_failed",
          "HUBSTAFF_TOKEN_ENCRYPTION_KEY does not match the key used for the saved Hubstaff PAT.",
        );
      }
      if (!saved.seed_fingerprint) {
        await client.query(
          "UPDATE portal_hubstaff_tokens SET seed_fingerprint=$1, updated_at=NOW() WHERE id=1",
          [seedFingerprint],
        );
      }
      await client.query("COMMIT");
      return accessToken;
    }

    let refreshToken = seedRefreshToken;
    if (savedBelongsToSeed && saved.encrypted_refresh_token) {
      try {
        refreshToken = decryptHubstaffToken(saved.encrypted_refresh_token, secret);
      } catch {
        throw authError(
          "hubstaff_pat_decryption_failed",
          "HUBSTAFF_TOKEN_ENCRYPTION_KEY does not match the key used for the saved Hubstaff PAT.",
        );
      }
    }

    const refreshed = await exchangeRefreshToken(refreshToken);
    await client.query(
      `INSERT INTO portal_hubstaff_tokens
         (id, encrypted_access_token, encrypted_refresh_token, access_expires_at, seed_fingerprint, updated_at)
       VALUES (1, $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         encrypted_access_token=EXCLUDED.encrypted_access_token,
         encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,
         access_expires_at=EXCLUDED.access_expires_at,
         seed_fingerprint=EXCLUDED.seed_fingerprint,
         updated_at=NOW()`,
      [
        encryptHubstaffToken(refreshed.accessToken, secret),
        encryptHubstaffToken(refreshed.refreshToken, secret),
        refreshed.expiresAt,
        seedFingerprint,
      ],
    );
    await client.query("COMMIT");
    return refreshed.accessToken;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    if (error?.code === "42P01") {
      throw authError("hubstaff_pat_migration_missing", "Run npm run admin:migrate to create the encrypted PAT token store.");
    }
    if (error?.hubstaffAuthCode) throw error;
    throw authError("hubstaff_pat_failed", "Hubstaff PAT authentication could not be completed.");
  } finally {
    client.release();
  }
}
