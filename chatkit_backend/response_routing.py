"""Conservative, local capability routing for a client reply.

Routing only removes unnecessary tools. It never grants access or substitutes
unverified data for the portal's signed Hubstaff snapshot.
"""
import re


FOLLOW_UP = re.compile(
    r"\b(?:it|its|this|that|these|those|they|them|their|same|earlier|previous|above|again|more)\b"
    r"|^\s*(?:and|also|what about|how about|why|summarize)\b", re.I,
)
WORK_SIGNAL = re.compile(
    r"\b(?:hubstaff|task|tasks|to[ -]?do|progress|project|work|worked|working|"
    r"hours?|budget|spent|revenue|sales|report|document|docs?|files?|"
    r"upload|attachment|library|save|remember|archive|download|link|"
    r"image|picture|graphic|website|site|store|storefront|domain|url|"
    r"client|customer|account|our|my|we|us|last year|this year|"
    r"last month|this month|today|yesterday|history|historical|"
    r"policy|pricing|price|product|products|services|warranty|"
    r"company|business|mission|brand|strategy|"
    r"assign|assigned|assignee|followers?|review|completed|done)\b|https?://", re.I,
)
LIBRARY_SIGNAL = re.compile(
    r"\b(?:revenue|sales|report|document|docs?|files?|upload|attachment|"
    r"library|saved?|remember|archive|link|prior|previous|last year|"
    r"historical|history|spreadsheet|invoice|financial|quarter|20\d{2})\b",
    re.I,
)
WEBSITE_SIGNAL = re.compile(
    r"\b(?:website|webpage|web[ -]?page|site|storefront|domain|url|"
    r"public page|online store)\b|https?://", re.I,
)
GENERATION_SIGNAL = re.compile(
    r"\b(?:generate|create|make|produce|export|download|write|draft|summarize)\b"
    r".{0,100}\b(?:file|document|docx|word|image|picture|graphic|"
    r"illustration|report)\b"
    r"|\b(?:file|document|docx|word|image|picture|graphic|"
    r"illustration|report)\b.{0,100}\b(?:generate|create|make|produce|export)\b",
    re.I | re.S,
)


def route_response(query, *, has_attachment=False, has_hubstaff=False):
    """Use the fast path only for clearly independent, non-work questions."""
    text = (query or "").strip()
    if not text or has_attachment:
        return "work"
    if has_hubstaff:
        return "work" if FOLLOW_UP.search(text) else "hubstaff"
    if FOLLOW_UP.search(text) or WORK_SIGNAL.search(text):
        return "work"
    return "general"


def focused_tool_needs(query):
    """Decide which non-Hubstaff tools a clear Hubstaff question also needs."""
    text = query or ""
    return {
        "library": bool(LIBRARY_SIGNAL.search(text)),
        "website": bool(WEBSITE_SIGNAL.search(text)),
        "generation": bool(GENERATION_SIGNAL.search(text)),
    }
