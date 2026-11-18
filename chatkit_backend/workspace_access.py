"""Fresh database checks for identities asserted by the signed Next.js proxy."""
from fastapi import HTTPException


def denied():
    return HTTPException(403, "Workspace access is unavailable")


async def session_actor(db, envelope):
    if not envelope.auth_session_id:
        raise denied()
    cursor = await db.execute("""
        SELECT u.external_id FROM public.portal_users u
        JOIN public."session" s ON s."userId"=u.external_id
        WHERE u.id=%s AND s.id=%s AND s."expiresAt">now()
    """, (envelope.user_id, envelope.auth_session_id))
    actor = await cursor.fetchone()
    if not actor:
        raise denied()
    cursor = await db.execute("""
        SELECT to_regnamespace('agency_platform') IS NOT NULL AS foundation,
          to_regclass('agency_platform.support_grants') IS NOT NULL AS ready,
          to_regclass('public.portal_internal_users') IS NOT NULL AS internal
    """)
    state = await cursor.fetchone()
    if state["foundation"] and not state["ready"]:
        raise denied()
    if state["internal"]:
        cursor = await db.execute("SELECT 1 FROM public.portal_internal_users WHERE user_id=%s", (envelope.user_id,))
        if await cursor.fetchone():
            raise denied()
    return actor, state


async def authorize_client(db, envelope):
    actor, state = await session_actor(db, envelope)
    if state["ready"]:
        cursor = await db.execute("""
            SELECT agency_id::text FROM agency_platform.request_workspaces(%s)
            WHERE client_id=%s AND is_aoc AND access_level IN ('contribute','manage')
              AND client_role IN ('member','client_admin','aoc_admin')
        """, (actor["external_id"], envelope.client_id))
        grant = await cursor.fetchone()
        if not grant or grant["agency_id"] != envelope.agency_id:
            raise denied()
    elif envelope.agency_id is not None:
        raise denied()
    cursor = await db.execute("""
        SELECT client.* FROM public.portal_clients AS client
        JOIN public.portal_memberships AS member ON member.client_id=client.id
        WHERE client.id=%s AND member.user_id=%s AND member.is_active=TRUE
          AND member.role IN ('member','client_admin','aoc_admin')
          AND client.portal_enabled=TRUE AND client.ai_enabled=TRUE
    """, (envelope.client_id, envelope.user_id))
    client = await cursor.fetchone()
    if not client:
        raise denied()
    if getattr(envelope, "source_references", []) and not getattr(envelope, "source_boundaries", []):
        raise denied()
    if client.get("openai_vector_store_id"):
        cursor = await db.execute("SELECT 1 FROM portal_clients WHERE id<>%s AND openai_vector_store_id=%s LIMIT 1",
                                  (envelope.client_id, client["openai_vector_store_id"]))
        if await cursor.fetchone():
            raise denied()
    for boundary in getattr(envelope, "source_boundaries", []):
        cursor = await db.execute("SELECT revision FROM agency_platform.source_approval(%s,%s,%s,NULL)",
                                  (boundary.owner_id,boundary.audience,envelope.client_id))
        approval = await cursor.fetchone()
        if not approval or approval["revision"] != boundary.revision:
            raise denied()
    return client


async def authorize_platform(db, envelope):
    _, state = await session_actor(db, envelope)
    cursor = await db.execute("SELECT 1 FROM public.portal_admins WHERE user_id=%s AND is_active=TRUE", (envelope.user_id,))
    if not await cursor.fetchone():
        raise denied()
    if state["ready"]:
        cursor = await db.execute("SELECT agency_platform.legacy_admin_scope_safe() AS allowed")
        if not (await cursor.fetchone())["allowed"]:
            raise denied()


async def recheck_context(context):
    envelope = getattr(context, "authorization", None)
    if envelope is None:
        raise denied()
    if context.preview:
        await authorize_platform(context.db, envelope)
    else:
        client = await authorize_client(context.db, envelope)
        # A tool may only continue with the project, website and store approved
        # when this response started.
        for key in ("hubstaff_project_url", "approved_website_url", "openai_vector_store_id"):
            if client.get(key) != context.client.get(key):
                raise denied()
