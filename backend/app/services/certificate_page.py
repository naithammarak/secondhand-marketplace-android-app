"""Public certificate HTML. Render only the certificate's approved snapshot fields."""

from datetime import timezone
from pathlib import Path

from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader

from app.models.certificate import Certificate


_templates = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "templates"),
    autoescape=True,
)
_headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}


def render_certificate_page(cert: Certificate | None) -> HTMLResponse:
    """A missing token and a missing row render the same generic 404 page."""
    issued_at = cert.issued_at.astimezone(timezone.utc) if cert is not None else None
    html = _templates.get_template("certificate_public.html").render(
        missing=cert is None,
        certificate_no=cert.certificate_no if cert is not None else None,
        status=cert.status if cert is not None else None,
        result=cert.result if cert is not None else None,
        issued_at_iso=issued_at.isoformat() if issued_at is not None else None,
        issued_at_display=issued_at.strftime("%d/%m/%Y %H:%M UTC") if issued_at is not None else None,
    )
    return HTMLResponse(content=html, status_code=404 if cert is None else 200, headers=_headers)
