import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import pg from "pg";

const { Pool } = pg;

const DISABLED_DATABASE_URL =
  "postgresql://aoc-disabled:aoc-disabled@127.0.0.1:1/aoc-disabled";
const DEVELOPMENT_SECRET =
  "aoc-development-only-secret-that-cannot-authenticate-production";

const authPool = new Pool({
  connectionString: process.env.DATABASE_URL || DISABLED_DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 8_000,
});

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
} = {}) {
  return betterAuth({
    appName: "AOC Client Portal",
    baseURL: process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000",
    secret: process.env.BETTER_AUTH_SECRET || DEVELOPMENT_SECRET,
    database: authPool,
    emailAndPassword: {
      enabled: true,
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
      ...(useNextCookies ? [nextCookies()] : []),
    ],
  });
}

export const auth = createPortalAuth();

export async function closeAuthDatabase() {
  await authPool.end();
}
