import json


def _post_json(client, url: str, payload: dict):
    return client.post(url, data=json.dumps(payload), content_type="application/json")


def test_protocol_requires_valid_session_id(client):
    # Unknown session should be rejected
    r = client.post("/api/protocol/play?session=not-a-real-session")
    assert r.status_code == 400
    body = r.get_json()
    assert body and "error" in body

    r = _post_json(client, "/api/protocol/answer?session=not-a-real-session", {"id": 0})
    assert r.status_code == 400
    body = r.get_json()
    assert body and "error" in body


def test_free_mode_answer_without_play_returns_400(client):
    # current_direction_id is None at start; should return 400 with an error message
    r = _post_json(client, "/api/answer", {"id": 0})
    assert r.status_code == 400
    body = r.get_json()
    assert body and body.get("error")


def test_compute_stats_division_by_zero_safe(app_module):
    # Empty results should not crash and should return 0.0 metrics
    stats = app_module.compute_stats([])
    assert stats["overall"] == 0.0

    # Per-direction totals are 0, but accuracies should be defined (0.0)
    for d in stats["per_direction"]:
        assert d["total"] == 0
        assert d["accuracy"] == 0.0

    # Confusion matrix should exist and all rows should have total 0 and pct 0.0
    for row in stats["confusion_matrix"]:
        assert row["total"] == 0
        for g in row["guesses"]:
            assert g["count"] == 0
            assert g["pct"] == 0.0

    # Group accuracies should be 0.0 for empty input
    assert stats["right_acc"] == 0.0
    assert stats["left_acc"] == 0.0
    assert stats["front_acc"] == 0.0
    assert stats["back_acc"] == 0.0
