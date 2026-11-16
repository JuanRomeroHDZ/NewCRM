from app.services import email_domain_posture as posture


class FakeResolver:
    timeout = 0
    lifetime = 0


def test_domain_posture_classifies_dns_records_without_treating_presence_as_validation(monkeypatch):
    monkeypatch.setattr(posture.dns.resolver, "Resolver", lambda configure=True: FakeResolver())
    records = {
        "example.com": ["google-site-verification=ok", "v=spf1 include:mail.example.net -all"],
        "_dmarc.example.com": ["v=DMARC1; p=reject; rua=mailto:dmarc@example.com"],
        "selector1._domainkey.example.com": ["v=DKIM1; k=rsa; p=public-key"],
    }
    monkeypatch.setattr(posture, "_txt_records", lambda name, resolver: records.get(name, []))

    result = posture.check_email_domain_posture("example.com", "selector1")

    assert result["spf"]["status"] == "publicado"
    assert result["dmarc"]["status"] == "publicado"
    assert result["dkim"]["status"] == "publicado"
    assert result["spf"]["records"] == ["v=spf1 include:mail.example.net -all"]


def test_duplicate_spf_and_revoked_dkim_are_reported_for_review(monkeypatch):
    monkeypatch.setattr(posture.dns.resolver, "Resolver", lambda configure=True: FakeResolver())
    records = {
        "example.com": ["v=spf1 -all", "V=SPF1 include:mail.example.net -all"],
        "_dmarc.example.com": ["v=DMARC1; p=none"],
        "selector1._domainkey.example.com": ["v=DKIM1; p="],
    }
    monkeypatch.setattr(posture, "_txt_records", lambda name, resolver: records.get(name, []))

    result = posture.check_email_domain_posture("example.com", "selector1")

    assert result["spf"]["status"] == "múltiple"
    assert result["dmarc"]["status"] == "débil"
    assert result["dkim"]["status"] == "débil"


def test_operating_system_dns_errors_are_indeterminate_not_server_errors(monkeypatch):
    class BrokenResolver(FakeResolver):
        def resolve(self, *_args, **_kwargs):
            raise OSError("resolver unavailable")

    monkeypatch.setattr(posture.dns.resolver, "Resolver", lambda configure=True: BrokenResolver())
    result = posture.check_email_domain_posture("example.com")

    assert result["spf"]["status"] == "no_determinado"
    assert result["dmarc"]["status"] == "no_determinado"
    assert result["dkim"]["status"] == "no_revisado"


