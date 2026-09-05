from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.test_message import TestMessage as MessageModel


client = TestClient(app)


def test_create_test_message_stores_it_in_database():
    message = f"test-{uuid4()}"
    created_id = None

    try:
        response = client.post(
            "/api/test-messages",
            json={"message": message},
        )

        assert response.status_code == 201

        data = response.json()
        assert data["message"] == message

        created_id = data["id"]

        with SessionLocal() as db:
            stored_message = db.get(MessageModel, created_id)

            assert stored_message is not None
            assert stored_message.message == message

    finally:
        if created_id is not None:
            with SessionLocal() as db:
                stored_message = db.get(MessageModel, created_id)

                if stored_message is not None:
                    db.delete(stored_message)
                    db.commit()
def test_list_test_messages_returns_stored_messages():
    message = f"test-{uuid4()}"

    with SessionLocal() as db:
        stored_message = MessageModel(message=message)
        db.add(stored_message)
        db.commit()
        db.refresh(stored_message)
        created_id = stored_message.id

    try:
        response = client.get("/api/test-messages")

        assert response.status_code == 200
        assert {
            "id": created_id,
            "message": message,
        } in response.json()

    finally:
        with SessionLocal() as db:
            stored_message = db.get(MessageModel, created_id)

            if stored_message is not None:
                db.delete(stored_message)
                db.commit()