import logging

from fastapi.testclient import TestClient

from app.main import app
from tests.test_agent import metadata, post


def test_request_logging_excludes_private_payload(caplog) -> None:
    value = metadata(goal="NEVER_LOG_THIS_GOAL")
    value["elements"][0]["label"] = "NEVER_LOG_THIS_LABEL"
    with caplog.at_level(logging.INFO, logger="privsight.request"):
        response = post(TestClient(app), value)
    assert response.status_code == 200
    output = caplog.text
    assert "request_complete" in output
    assert "NEVER_LOG_THIS_GOAL" not in output
    assert "NEVER_LOG_THIS_LABEL" not in output
