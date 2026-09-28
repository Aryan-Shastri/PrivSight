from fastapi.testclient import TestClient

from app.main import app


def test_root_reports_remote_service_status() -> None:
    response = TestClient(app).get("/")
    assert response.status_code == 200
    assert response.json() == {
        "service": "PrivSight API",
        "status": "ok",
        "planner": "MOCK PLANNER",
        "health": "/health",
    }


def test_health_reports_service_alive() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_identifies_mock_planner() -> None:
    response = TestClient(app).get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "planner": "MOCK PLANNER"}
