import re
import html

# Precompiled regexes to neutralize malicious XSS vectors in SVG and HTML
DANGEROUS_TAGS_PATTERN = re.compile(
    r"<\s*(script|object|embed|iframe|frame|frameset|applet|meta|link|style)[^>]*?>.*?<\s*/\s*\1\s*>",
    re.IGNORECASE | re.DOTALL
)
SELF_CLOSING_DANGEROUS_TAGS = re.compile(
    r"<\s*(script|object|embed|iframe|frame|frameset|applet|meta|link|style)[^>]*?/>",
    re.IGNORECASE
)
EVENT_HANDLERS_PATTERN = re.compile(
    r"\s+on[a-z]+\s*=\s*(['\"]).*?\1",
    re.IGNORECASE | re.DOTALL
)
JAVASCRIPT_URI_PATTERN = re.compile(
    r"href\s*=\s*(['\"])\s*javascript:.*?\1",
    re.IGNORECASE | re.DOTALL
)
DATA_URI_SCRIPT_PATTERN = re.compile(
    r"href\s*=\s*(['\"])\s*data:\s*text/html.*?\1",
    re.IGNORECASE | re.DOTALL
)

def sanitize_svg_content(raw_svg: str) -> str:
    """
    Sanitizes SVG content by stripping scripts, dangerous tags, and JavaScript event handlers.
    Ensures safe rendering without XSS vulnerabilities.
    """
    if not raw_svg:
        return ""
    
    # Strip dangerous container tags and self-closing tags
    cleaned = DANGEROUS_TAGS_PATTERN.sub("", raw_svg)
    cleaned = SELF_CLOSING_DANGEROUS_TAGS.sub("", cleaned)
    
    # Strip inline event handlers like onload, onclick, onerror
    cleaned = EVENT_HANDLERS_PATTERN.sub("", cleaned)
    
    # Strip javascript: and text/html data URIs
    cleaned = JAVASCRIPT_URI_PATTERN.sub("", cleaned)
    cleaned = DATA_URI_SCRIPT_PATTERN.sub("", cleaned)
    
    return cleaned.strip()

def sanitize_formula_injection(value: str) -> str:
    """
    Neutralizes CSV formula injection (DDE) by prepending a single quote
    if the string starts with =, +, -, @, tab, or carriage return.
    """
    if not value or not isinstance(value, str):
        return value
    if value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value
