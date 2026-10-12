import 'server-only';
import { InternalUserError } from './internal-user-errors.js';
import { validateInternalUserToken } from './internal-user-hubstaff.js';

export function assertInternalUserRequest(request) {
  if (new URL(request.url).search) {
    throw new InternalUserError('invalid_request', 'This endpoint does not accept account, project, or filter parameters.', 400);
  }
}

export function readInternalUserWorkspace(request) {
  const params = new URL(request.url).searchParams;
  if (!params.size) return 'personal';
  const workspace = params.get('workspace');
  if (params.size !== 1 || !['personal', 'team', 'settings'].includes(workspace)) {
    throw new InternalUserError('invalid_request', 'This endpoint accepts only a valid internal workspace.', 400);
  }
  return workspace;
}

export async function readInternalUserTokenForm(request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') {
    throw new InternalUserError('invalid_request', 'Submit the Hubstaff connection form.', 415);
  }
  const limit = 16000;
  if (Number(request.headers.get('content-length')) > limit || !request.body) {
    throw new InternalUserError('invalid_request', 'The connection form is invalid.', 400);
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new InternalUserError('invalid_request', 'The connection form is too large.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const form = new URLSearchParams(text);
  if ([...form.keys()].length !== 1 || !form.has('token')) {
    throw new InternalUserError('invalid_request', 'Only a Hubstaff personal token can be submitted.', 400);
  }
  return validateInternalUserToken(form.get('token'));
}
