import 'server-only';
import { EmployeeError } from './employee-errors.js';
import { validateEmployeeToken } from './employee-hubstaff.js';

export function assertEmployeeRequest(request) {
  if (new URL(request.url).search) {
    throw new EmployeeError('invalid_request', 'This endpoint does not accept account, project, or filter parameters.', 400);
  }
}

export async function readEmployeeTokenForm(request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') {
    throw new EmployeeError('invalid_request', 'Submit the Hubstaff connection form.', 415);
  }
  const limit = 16000;
  if (Number(request.headers.get('content-length')) > limit || !request.body) {
    throw new EmployeeError('invalid_request', 'The connection form is invalid.', 400);
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
        throw new EmployeeError('invalid_request', 'The connection form is too large.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const form = new URLSearchParams(text);
  if ([...form.keys()].length !== 1 || !form.has('token')) {
    throw new EmployeeError('invalid_request', 'Only a Hubstaff access token can be submitted.', 400);
  }
  return validateEmployeeToken(form.get('token'));
}
