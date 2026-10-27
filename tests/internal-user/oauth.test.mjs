import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalHubstaffOAuthAttempt, exchangeInternalHubstaffOAuthCode,
  internalHubstaffOAuthConfig, internalHubstaffOAuthCookieHeader,
  readInternalHubstaffOAuthAttempt, readInternalHubstaffOAuthCookie,
  refreshInternalHubstaffOAuthToken } from '../../lib/internal-hubstaff-oauth.js';

const config = internalHubstaffOAuthConfig({
  HUBSTAFF_OAUTH_CLIENT_ID: 'fixture-client-id',
  HUBSTAFF_OAUTH_CLIENT_SECRET: 'fixture-secret-never-real',
  HUBSTAFF_OAUTH_REDIRECT_URI: 'http://127.0.0.1:3000/api/internal/hubstaff/oauth/callback',
  BETTER_AUTH_URL: 'http://127.0.0.1:3000',
  HUBSTAFF_TOKEN_ENCRYPTION_KEY: 'fixture-oauth-secret-more-than-thirty-two-characters',
});
const identity = { userId: '1', sessionId: 'session-1', hubstaffUserId: '101', connectionVersion: '3' };

test('Hubstaff authorization uses read-only scopes, PKCE and a private callback', () => {
  const attempt = createInternalHubstaffOAuthAttempt(config, identity, 1000);
  const url = new URL(attempt.authorizeUrl);
  assert.equal(url.origin, 'https://account.hubstaff.com');
  assert.equal(url.searchParams.get('scope'), 'hubstaff:read tasks:read');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(url.href.includes(config.clientSecret), false);
  assert.equal(attempt.stateCookie.includes(identity.sessionId), false);
  const restored = readInternalHubstaffOAuthAttempt(config, { ...identity,
    state: url.searchParams.get('state'), cookie: attempt.stateCookie }, 1200);
  assert.ok(restored.verifier.length >= 43);
  assert.equal(restored.hubstaffUserId, identity.hubstaffUserId);
});

test('Hubstaff sign-in rejects tampered, expired, wrong-session and changed-mapping callbacks', () => {
  const attempt = createInternalHubstaffOAuthAttempt(config, identity, 1000);
  const state = new URL(attempt.authorizeUrl).searchParams.get('state');
  for (const input of [
    { state: 'wrong' }, { cookie: 'broken' }, { sessionId: 'session-2' },
    { hubstaffUserId: '202' }, { connectionVersion: '4' },
  ]) {
    assert.throws(() => readInternalHubstaffOAuthAttempt(config, {
      ...identity, state, cookie: attempt.stateCookie, ...input }, 1200),
    error => error.publicDetails.code === 'oauth_expired');
  }
  assert.throws(() => readInternalHubstaffOAuthAttempt(config, {
    ...identity, state, cookie: attempt.stateCookie }, 601001),
  error => error.publicDetails.code === 'oauth_expired');
});

test('the Hubstaff callback cookie is HttpOnly, short-lived and scoped to callback', () => {
  const header = internalHubstaffOAuthCookieHeader('encrypted', { secure: true });
  assert.match(header, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.match(header, /Path=\/api\/internal\/hubstaff\/oauth\/callback/);
  assert.equal(readInternalHubstaffOAuthCookie(new Headers({ cookie: 'aoc_hubstaff_oauth=encrypted' })), 'encrypted');
  assert.equal(readInternalHubstaffOAuthCookie(new Headers({ cookie: 'aoc_hubstaff_oauth=a; aoc_hubstaff_oauth=b' })), '');
  assert.match(internalHubstaffOAuthCookieHeader('', { clear: true, secure: true }), /Max-Age=0; Secure/);
});

test('OAuth code exchange and refresh use app credentials, rotate tokens and never request writes', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ token_type: 'bearer', access_token: 'fixture-access-token-never-real',
      refresh_token: 'fixture-refresh-token-never-real', expires_in: 86400 });
  };
  const first = await exchangeInternalHubstaffOAuthCode(config, 'fixture-code', 'fixture-verifier', fetchImpl);
  const renewed = await refreshInternalHubstaffOAuthToken(config, first.refreshToken, fetchImpl);
  assert.equal(renewed.accessToken, first.accessToken);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://account.hubstaff.com/access_tokens');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body.get('grant_type'), 'authorization_code');
  assert.equal(calls[0].options.body.get('code_verifier'), 'fixture-verifier');
  assert.equal(calls[1].options.body.get('grant_type'), 'refresh_token');
  assert.equal(calls[1].options.body.get('refresh_token'), first.refreshToken);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  assert.equal(calls.every(call => !String(call.url).includes(config.clientSecret)), true);
});

test('OAuth provider errors never surface provider response text or credentials', async () => {
  const fetchImpl = async () => Response.json({ error: 'invalid_grant', detail: config.clientSecret }, { status: 400 });
  await assert.rejects(exchangeInternalHubstaffOAuthCode(config, 'fixture-code', 'fixture-verifier', fetchImpl),
    error => error.publicDetails.code === 'oauth_denied' && !error.message.includes(config.clientSecret));
  assert.throws(() => exchangeInternalHubstaffOAuthCode(config, '', 'fixture-verifier', fetchImpl),
    error => error.publicDetails.code === 'oauth_denied');
});

test('OAuth configuration requires an exact same-origin callback', () => {
  assert.throws(() => internalHubstaffOAuthConfig({ ...process.env,
    HUBSTAFF_OAUTH_CLIENT_ID: config.clientId, HUBSTAFF_OAUTH_CLIENT_SECRET: config.clientSecret,
    HUBSTAFF_TOKEN_ENCRYPTION_KEY: config.secret, BETTER_AUTH_URL: 'https://portal.example.invalid',
    HUBSTAFF_OAUTH_REDIRECT_URI: 'https://other.example.invalid/api/internal/hubstaff/oauth/callback',
  }), error => error.publicDetails.code === 'oauth_not_configured');
});
