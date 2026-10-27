import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptHubstaffToken, encryptHubstaffToken } from './hubstaff-token-crypto.js';
import { InternalUserError } from './internal-user-errors.js';
import { validateInternalUserToken } from './internal-user-hubstaff.js';

const AUTHORIZE_URL = 'https://account.hubstaff.com/authorizations/new';
const TOKEN_URL = 'https://account.hubstaff.com/access_tokens';
const CALLBACK_PATH = '/api/internal/hubstaff/oauth/callback';
const COOKIE_NAME = 'aoc_hubstaff_oauth';
const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const READ_SCOPES = 'hubstaff:read tasks:read';

export function isInternalHubstaffOAuthConfigured() {
  try { internalHubstaffOAuthConfig(); return true; }
  catch { return false; }
}

export function internalHubstaffOAuthConfig(env = process.env) {
  const clientId = env.HUBSTAFF_OAUTH_CLIENT_ID?.trim() || '';
  const clientSecret = env.HUBSTAFF_OAUTH_CLIENT_SECRET?.trim() || '';
  const secret = env.HUBSTAFF_TOKEN_ENCRYPTION_KEY?.trim() || '';
  let redirectUri;
  let portalUrl;
  try {
    redirectUri = new URL(env.HUBSTAFF_OAUTH_REDIRECT_URI || '');
    portalUrl = new URL(env.BETTER_AUTH_URL || '');
  } catch { /* Report the same safe configuration error below. */ }
  const loopback = redirectUri?.hostname === '127.0.0.1' || redirectUri?.hostname === 'localhost';
  if (!clientId || !clientSecret || secret.length < 32 || !redirectUri || !portalUrl
    || redirectUri.origin !== portalUrl.origin || redirectUri.pathname !== CALLBACK_PATH
    || redirectUri.search || redirectUri.hash || (redirectUri.protocol !== 'https:' && !loopback)
    || !['https:', 'http:'].includes(redirectUri.protocol)) {
    throw new InternalUserError('oauth_not_configured',
      'Hubstaff sign-in needs administrator setup. Contact your internal access manager.');
  }
  return { clientId, clientSecret, redirectUri: redirectUri.href, secret };
}

function urlSafeRandom(bytes = 32) { return randomBytes(bytes).toString('base64url'); }

export function createInternalHubstaffOAuthAttempt(config, { userId, sessionId, hubstaffUserId,
  connectionVersion }, now = Date.now()) {
  if (!userId || !sessionId || !hubstaffUserId || connectionVersion === undefined) {
    throw new InternalUserError('oauth_unavailable', 'Your portal session could not start Hubstaff sign-in.');
  }
  const state = urlSafeRandom();
  const verifier = urlSafeRandom(48);
  const nonce = urlSafeRandom();
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const url = new URL(AUTHORIZE_URL);
  for (const [key, value] of Object.entries({ client_id: config.clientId, response_type: 'code',
    redirect_uri: config.redirectUri, scope: READ_SCOPES, state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(key, value);
  const payload = { state, verifier, userId: String(userId), sessionId: String(sessionId),
    hubstaffUserId: String(hubstaffUserId), connectionVersion: String(connectionVersion),
    redirectUri: config.redirectUri, issuedAt: now };
  return { authorizeUrl: url.href, stateCookie: encryptHubstaffToken(JSON.stringify(payload), config.secret) };
}

export function readInternalHubstaffOAuthAttempt(config, { cookie, state, userId, sessionId,
  hubstaffUserId, connectionVersion }, now = Date.now()) {
  let payload;
  try { payload = JSON.parse(decryptHubstaffToken(cookie, config.secret)); }
  catch { throw new InternalUserError('oauth_expired', 'Hubstaff sign-in expired. Start again.', 400); }
  const expected = Buffer.from(payload?.state || '');
  const received = Buffer.from(typeof state === 'string' ? state : '');
  if (expected.length !== 43 || received.length !== expected.length
    || !timingSafeEqual(expected, received)
    || !Number.isSafeInteger(payload?.issuedAt) || payload.issuedAt > now
    || now - payload.issuedAt > ATTEMPT_LIFETIME_MS
    || payload.userId !== String(userId) || payload.sessionId !== String(sessionId)
    || payload.hubstaffUserId !== String(hubstaffUserId)
    || payload.connectionVersion !== String(connectionVersion)
    || payload.redirectUri !== config.redirectUri
    || !/^[A-Za-z0-9._~-]{43,128}$/.test(payload.verifier || '')) {
    throw new InternalUserError('oauth_expired', 'Hubstaff sign-in expired. Start again.', 400);
  }
  return payload;
}

export function internalHubstaffOAuthCookieHeader(value, { clear = false,
  secure = process.env.NODE_ENV === 'production' } = {}) {
  return `${COOKIE_NAME}=${clear ? '' : encodeURIComponent(value)}; Path=${CALLBACK_PATH}; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${secure ? '; Secure' : ''}`;
}

export function readInternalHubstaffOAuthCookie(headers) {
  const matches = (headers.get('cookie') || '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return '';
  try { return decodeURIComponent(matches[0].slice(COOKIE_NAME.length + 1)); }
  catch { return ''; }
}

async function requestTokens(config, body, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, { method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` },
      body: new URLSearchParams(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
  } catch { throw new InternalUserError('oauth_unavailable', 'Hubstaff sign-in is temporarily unavailable.'); }
  if (!response.ok) {
    const errorCode = await response.json().then(value => value?.error).catch(() => '');
    if (response.status === 429 || errorCode === 'rate_limit') {
      throw new InternalUserError('hubstaff_rate_limit', 'Hubstaff is limiting sign-in attempts. Please wait.', 429);
    }
    throw new InternalUserError('oauth_denied', 'Hubstaff did not authorize this connection. Try again.', 400);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new InternalUserError('oauth_unavailable', 'Hubstaff returned an incomplete sign-in response.'); }
  let accessToken;
  let refreshToken;
  try {
    accessToken = validateInternalUserToken(payload?.access_token);
    refreshToken = validateInternalUserToken(payload?.refresh_token);
  } catch { throw new InternalUserError('oauth_unavailable', 'Hubstaff returned incomplete credentials.'); }
  const expiresIn = Number(payload?.expires_in);
  if (String(payload?.token_type || '').toLowerCase() !== 'bearer'
    || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 604800) {
    throw new InternalUserError('oauth_unavailable', 'Hubstaff returned an invalid sign-in response.');
  }
  return { accessToken, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

export function exchangeInternalHubstaffOAuthCode(config, code, verifier, fetchImpl = fetch) {
  if (typeof code !== 'string' || code.length < 1 || code.length > 4096 || /[^\x21-\x7e]/.test(code)) {
    throw new InternalUserError('oauth_denied', 'Hubstaff did not return a valid authorization code.', 400);
  }
  return requestTokens(config, { grant_type: 'authorization_code', code,
    redirect_uri: config.redirectUri, code_verifier: verifier }, fetchImpl);
}

export function refreshInternalHubstaffOAuthToken(config, refreshToken, fetchImpl = fetch) {
  return requestTokens(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl);
}
