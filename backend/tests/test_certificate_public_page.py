"""Public HTML must escape dynamic text and expose only the approved snapshot."""

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.certificate_page import render_certificate_page


def test_public_page_escapes_dynamic_text_and_omits_private_fields():
    cert = SimpleNamespace(
        certificate_no="CERT-<script>alert(1)</script>",
        status="ISSUED",
        result="MINOR_ISSUE",
        issued_at=datetime(2026, 9, 28, 10, 30, tzinfo=timezone.utc),
        public_token="hidden-public-token",
        order_id=98432,
        revocation_reason="private reason",
    )
    response = render_certificate_page(cert)
    html = response.body.decode("utf-8")

    assert response.status_code == 200
    assert "CERT-&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script" not in html
    assert "MINOR_ISSUE" in html
    assert "2026-09-28T10:30:00+00:00" in html
    assert "hidden-public-token" not in html
    assert "98432" not in html
    assert "private reason" not in html
    assert "<img" not in html
    assert "src=" not in html
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
