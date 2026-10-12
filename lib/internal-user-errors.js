export class InternalUserError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.publicDetails = { code, message, status };
  }
}

export function internalUserErrorResponse(error) {
  const details = error instanceof InternalUserError ? error.publicDetails : {
    code: 'internal_user_unavailable', message: 'Your work dashboard is temporarily unavailable. Please try again.', status: 503,
  };
  return Response.json({ error: details.message, code: details.code }, {
    status: details.status, headers: { 'Cache-Control': 'private, no-store' },
  });
}
