// No shared collector. Python spans return inline to their originating request.
export function POST() { return new Response(null, { status: 404 }); }
