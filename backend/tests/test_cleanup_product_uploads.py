"""Cleanup must never delete live or unexpectedly named Storage objects."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from scripts import cleanup_product_uploads as cleanup


class FakeDb:
    def __init__(self, record, image_reference=False):
        self.record = record
        self.image_reference = image_reference
        self.calls = 0
        self.deleted = []
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def scalar(self, _statement):
        self.calls += 1
        return self.record if self.calls == 1 else (1 if self.image_reference else None)

    def delete(self, record):
        self.deleted.append(record)

    def commit(self):
        self.committed = True


def record(state, expiry, key="pending/0123456789abcdef0123456789abcdef.png"):
    return SimpleNamespace(id=1, state=state, expires_at=expiry, object_key=key)


def test_cleanup_skips_attached_and_referenced_uploads(monkeypatch):
    now = datetime.now(timezone.utc)
    removed = []

    async def fake_delete(path):
        removed.append(path)

    monkeypatch.setattr(cleanup, "delete_object", fake_delete)
    for item, referenced in (
        (record("ATTACHED", now - timedelta(hours=1)), False),
        (record("PENDING", now - timedelta(hours=1)), True),
        (record("PENDING", now + timedelta(hours=1)), False),
        (record("DETACHED", now, key="unsafe/other.jpg"), False),
    ):
        db = FakeDb(item, image_reference=referenced)
        monkeypatch.setattr(cleanup, "SessionLocal", lambda: db)
        assert cleanup.remove_registry_upload(1, now) is False
        assert db.deleted == []
    assert removed == []


def test_cleanup_deletes_only_expired_unreferenced_pending_object(monkeypatch):
    now = datetime.now(timezone.utc)
    item = record("PENDING", now - timedelta(seconds=1))
    db = FakeDb(item)
    deleted_paths = []

    async def fake_delete(path):
        deleted_paths.append(path)

    monkeypatch.setattr(cleanup, "SessionLocal", lambda: db)
    monkeypatch.setattr(cleanup, "delete_object", fake_delete)
    assert cleanup.remove_registry_upload(1, now) is True
    assert deleted_paths == [item.object_key]
    assert db.deleted == [item]
    assert db.committed is True
