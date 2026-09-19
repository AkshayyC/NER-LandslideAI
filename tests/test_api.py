"""Endpoint tests: every route the console uses must answer with the documented shape."""

from __future__ import annotations



def test_health_reports_an_operational_engine(service_client):
    payload = service_client.get("/api/health").json()
    assert payload["status"] == "operational"
    assert payload["engine"] == "ready"
    assert payload["grid_cells"] > 0
    assert payload["rainfall_mode"] in {"live", "climatology", "disabled"}
    assert payload["immediate_actions"] is False
    assert payload["disclaimer"]


def test_meta_documents_the_model(service_client):
    payload = service_client.get("/api/meta").json()
    assert payload["model_id"]
    assert set(payload["factors"]["weights"]) == set(payload["factors"]["labels"])
    assert payload["rescale"]["scale"] > 0
    assert payload["rescale"]["fit_percentiles"]
    assert payload["grid"]["cells_in_region"] > 0
    assert payload["class_cuts"]["note"]


def test_stats_counts_match_the_grid(service_client):
    stats = service_client.get("/api/stats").json()
    cells = stats["region"]["cells"]
    assert cells == service_client.get("/api/health").json()["grid_cells"]
    for key in ("susceptibility", "risk_now", "risk_forward"):
        assert sum(stats[key]["class_counts"].values()) == cells
    assert stats["rainfall_mode"] in {"live", "climatology", "disabled"}


def test_outline_is_a_vector_base(service_client):
    payload = service_client.get("/api/outline").json()
    assert len(payload["polygons"]) >= 1
    assert len(payload["polygons"][0]) >= 3
    assert "not a legal boundary" in payload["caveat"]


def test_point_analysis_is_complete(service_client):
    payload = service_client.get("/api/point", params={"lat": 27.33, "lon": 88.61}).json()
    assert payload["susceptibility"]["class"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    assert payload["attribution"]["factors"]
    assert set(payload["thresholds"]) >= {"MODERATE", "HIGH", "CRITICAL", "baseline_class"}
    assert payload["scenarios"]
    assert payload["uncertainty"]["grade"] in {"A", "B", "C", "D"}


def test_point_outside_the_region_is_a_typed_404(service_client):
    response = service_client.get("/api/point", params={"lat": 10.0, "lon": 100.0})
    assert response.status_code == 404
    assert "outside" in response.json()["detail"].lower()


def test_grid_payload_matches_its_geometry(service_client):
    payload = service_client.get("/api/grid", params={"field": "risk"}).json()
    assert len(payload["values"]) == payload["rows"] * payload["cols"]
    assert payload["stats"]["count"] == service_client.get("/api/health").json()["grid_cells"]
    assert payload["field_meaning"]


def test_grid_rejects_unknown_fields(service_client):
    assert service_client.get("/api/grid", params={"field": "nope"}).status_code == 400


def test_districts_corridors_events_and_watchlist(service_client):
    districts = service_client.get("/api/districts").json()
    assert districts["count"] == len(districts["districts"]) >= 100

    detail = service_client.get("/api/districts/Sikkim/Gangtok").json()
    assert detail["district"] == "Gangtok"
    assert detail["point_analysis"]["susceptibility"]["class"]

    corridors = service_client.get("/api/corridors").json()
    assert corridors["count"] == len(corridors["corridors"]) >= 1
    corridor = service_client.get(f"/api/corridors/{corridors['corridors'][0]['id']}").json()
    assert corridor["profile"], "corridor detail carries the along-line profile"

    events = service_client.get("/api/events").json()
    assert events["count"] == len(events["events"]) >= 1

    watchlist = service_client.get("/api/watchlist", params={"limit": 3}).json()
    assert len(watchlist["cells"]) == 3
    for cell in watchlist["cells"]:
        assert cell["risk_forward"] >= cell["risk_now"] or cell["delta"] >= 0


def test_briefing_is_grounded_and_attributed(service_client):
    payload = service_client.get("/api/briefing", params={"scope": "region"}).json()
    assert payload["text"]
    assert payload["generated_by"]
    assert payload["grounded_on"]
    assert payload["caveat"]
