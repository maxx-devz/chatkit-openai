"""Narrow evidence loader for specialist-aware tools; not a ChatKit entitlement.

Only approved delivery fields are returned. Existing client AI authorization is
unchanged and denies specialist-only accounts. No HR/personnel query is allowed.
"""
from fastapi import HTTPException


async def specialist_evidence(db, actor, session_id, assignment_id):
    if not actor or not session_id or not assignment_id:
        raise HTTPException(403, "Assignment access denied")
    try:
        cursor = await db.execute(
            "SELECT agency_platform.specialist_evidence(%s,%s,%s) AS evidence",
            (actor, session_id, assignment_id),
        )
        row = await cursor.fetchone()
        if not row or not row["evidence"]:
            raise HTTPException(403, "Assignment access denied")
        return row["evidence"]
    except HTTPException:
        raise
    except Exception:
        # Do not return raw SQL, source names, private records or connection data.
        raise HTTPException(403, "Assignment access denied") from None


async def recheck_specialist_work(db, actor, session_id, assignment_id, action):
    if action not in {"delivery.read", "delivery.files.read", "delivery.notes.write"}:
        raise HTTPException(403, "Assignment access denied")
    try:
        await db.execute(
            "SELECT agency_platform.specialist_scope(%s,%s,%s,%s)",
            (actor, session_id, assignment_id, action),
        )
    except Exception:
        raise HTTPException(403, "Assignment access denied") from None
