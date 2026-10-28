from fastapi.testclient import TestClient


def test_rag_rejects_unauthenticated(tmp_db, monkeypatch):
    monkeypatch.setenv("EMBEDDING_FALLBACK", "")
    from main import app

    client = TestClient(app)
    response = client.post("/api/intelligence/rag", json={"message": "ping"})
    assert response.status_code == 401


def test_intelligence_status_rejects_unauthenticated(tmp_db):
    from main import app

    client = TestClient(app)
    response = client.get("/api/intelligence/status")
    assert response.status_code == 401


def test_health_is_public(tmp_db):
    from main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
