import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username, twoFactor } from "better-auth/plugins";
import { accountSecurityEnabled } from "./account-security-policy.js";
import { accountSecurityHooks } from "./auth-security-hooks.js";
import { captureAuthMail } from "./auth-mail.js";
import { closeDatabasePool, databasePool } from "./postgres.js";
import {runtimeDatabasePool} from "./runtime-database-role.js";

const DEVELOPMENT_SECRET =
  "aoc-development-only-secret-that-cannot-authenticate-production";

const authPool = databasePool;

export function isPortalAuthConfigured() {
  return Boolean(
    process.env.DATABASE_URL?.trim()
      && process.env.BETTER_AUTH_SECRET?.trim()
      && process.env.BETTER_AUTH_URL?.trim(),
  );
}

export function createPortalAuth({
  allowAccountCreation = false,
  useNextCookies = true,
  operatorDatabase = false,
} = {}) {
  const security = accountSecurityEnabled();
  const database = operatorDatabase ? authPool : runtimeDatabasePool(authPool);
  return betterAuth({
    ...(security ? { hooks: accountSecurityHooks(database), emailVerification: { autoSignInAfterVerification: false, expiresIn: 3600, sendVerificationEmail: async ({ user, token }) => captureAuthMail({ recipient: user.email, kind: "verify", token }) } } : {}),
    appName: "AOC Client Portal",
    baseURL: process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000",
    secret: process.env.BETTER_AUTH_SECRET || DEVELOPMENT_SECRET,
    database,
    session: { cookieCache: { enabled: false } },
    emailAndPassword: {
      enabled: true,
      ...(security ? { requireEmailVerification: true, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 1800,
        sendResetPassword: async ({ user, token }) => captureAuthMail({ recipient: user.email, kind: "reset", token }) } : {}),
      disableSignUp: !allowAccountCreation,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Provisioning uses the server API only. Enabling its normal duplicate
      // error avoids Better Auth's privacy-preserving synthetic duplicate result.
      autoSignIn: allowAccountCreation,
    },
    rateLimit: {
      enabled: true,
      storage: process.env.DATABASE_URL?.trim() ? "database" : "memory",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/verify-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 50,
        immutableUsername: true,
        displayUsername: false,
        usernameValidator(value) {
          return /^[a-z0-9][a-z0-9._-]{2,49}$/i.test(value);
        },
      }),
      ...(security ? [twoFactor({ issuer: "AOC Portal", totpOptions: { digits: 6, period: 30 }, backupCodeOptions: { amount: 10, length: 12 } })] : []),
      ...(useNextCookies ? [nextCookies()] : []),
    ],
  });
}

export const auth = createPortalAuth();

export async function closeAuthDatabase() {
  await closeDatabasePool();
}
