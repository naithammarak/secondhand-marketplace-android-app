import pytest


def test_test_message_model_has_required_columns():
    try:
        from app.models.test_message import TestMessage
    except ModuleNotFoundError:
        pytest.fail("TestMessage model has not been created yet")

    columns = TestMessage.__table__.columns

    assert set(columns.keys()) == {"id", "message"}
    assert columns["id"].primary_key
    assert not columns["message"].nullable