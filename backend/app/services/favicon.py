import re
import urllib.parse
import httpx

def generate_initials_svg(name: str, bg_color: str = "#262a33", text_color: str = "#e2e8f0") -> str:
    """Generates an inline SVG data URI with typographic initials."""
    clean_name = re.sub(r"[^a-zA-Z0-9\s]", "", name).strip()
    words = clean_name.split()
    if len(words) >= 2:
        initials = (words[0][0] + words[1][0]).upper()
    elif len(words) == 1 and len(words[0]) >= 2:
        initials = words[0][:2].upper()
    elif len(words) == 1:
        initials = words[0][0].upper()
    else:
        initials = "PL"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="{bg_color}" />
      <text x="50%" y="54%" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="24" fill="{text_color}" text-anchor="middle" dominant-baseline="middle">{initials}</text>
    </svg>"""
    encoded = urllib.parse.quote(svg)
    return f"data:image/svg+xml;utf8,{encoded}"

async def extract_favicon_url(domain_or_url: str) -> str:
    """Attempts to extract favicon from official domain via Google Favicon or DuckDuckGo API,
    or falls back to typographic initials immediately.
    """
    if not domain_or_url:
        return generate_initials_svg("App")

    parsed = urllib.parse.urlparse(domain_or_url)
    domain = parsed.netloc or parsed.path
    domain = domain.split("/")[0].strip()
    if not domain:
        return generate_initials_svg(domain_or_url)

    # Use Google's reliable CDN with 1.5s timeout check
    google_favicon = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.head(google_favicon)
            if resp.status_code == 200:
                return google_favicon
    except Exception:
        pass

    return generate_initials_svg(domain)
