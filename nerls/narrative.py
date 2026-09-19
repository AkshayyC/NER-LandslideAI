"""Operational briefings.

The engine can produce a written situation summary in two ways:

* a deterministic template, built from the same numbers the API returns, which
  always works and is the default; and
* an optional large-language-model rewrite, used only when an
  OpenAI-compatible endpoint and key are configured.

The model is never allowed to introduce facts: it receives a fixed set of
computed values and is instructed to use only those. If the call fails or no
key is configured, the deterministic briefing is returned, with
``generated_by`` stating which path was taken.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from . import config


def _severity_phrase(risk: float) -> str:
    if risk >= 0.80:
        return "critical"
    if risk >= 0.60:
        return "high"
    if risk >= 0.40:
        return "moderate"
    return "low"


def build_facts(service, scope: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Collect the exact facts a briefing may use."""
    meta = service.meta()
    facts: dict[str, Any] = {
        "scope": scope,
        "season": meta["season"],
        "rainfall_mode": meta["rainfall_status"],
        "scenario_multiplier": meta["scenario_multiplier"],
        "model_id": meta["model_id"],
    }

    if scope in ("region", "district"):
        stats = service.stats()
        facts["region_risk"] = stats["risk_forward"]
        facts["region_susceptibility"] = stats["susceptibility"]
        top = service.districts()[:5]
        facts["highest_districts"] = [
            {
                "district": row["district"],
                "state": row["state"],
                "forward_class": row["risk_forward"]["class"],
                "forward_mean": row["risk_forward"]["mean"],
                "population": row["population"],
            }
            for row in top
        ]
        watch = service.watchlist(limit=8)
        facts["emerging_cells"] = watch["cells"]
        corridors = service.corridors()[:4]
        facts["critical_corridors"] = [
            {
                "name": c["name"],
                "criticality": c["criticality"],
                "isolation_risk": c["isolation_risk"],
                "worst_class": c["worst_segment"]["class"],
                "worst_district": (c["worst_segment"]["district"] or {}).get("district"),
            }
            for c in corridors
        ]

    if scope == "point":
        facts["point"] = payload

    return facts


def deterministic_briefing(facts: dict[str, Any]) -> str:
    """Template briefing — always available, no network involved."""
    scope = facts.get("scope")
    season = facts.get("season", {})
    mode = facts.get("rainfall_mode", {})
    lines: list[str] = []

    regime = str(season.get("regime", "unknown")).replace("_", " ")
    scenario = facts.get("scenario_multiplier")
    feed = "a live rainfall feed" if mode.get("enabled") else "climatological expectation"
    lines.append(
        f"Situation summary for the North Eastern Region. The current rainfall regime is the "
        f"{regime} window, so the forward figures below use {feed} at "
        f"{scenario}x the local mean 72-hour rainfall."
    )

    if scope == "region":
        risk = facts.get("region_risk", {})
        counts = risk.get("class_counts", {})
        lines.append(
            "Across the modelled region the forward risk distribution is "
            f"{counts.get('LOW', 0)} low, {counts.get('MODERATE', 0)} moderate, "
            f"{counts.get('HIGH', 0)} high and {counts.get('CRITICAL', 0)} critical cells "
            f"(mean {risk.get('mean')})."
        )

        districts = facts.get("highest_districts") or []
        if districts:
            top = ", ".join(
                f"{d['district']} ({d['state']}, {d['forward_class'].lower()})" for d in districts[:3]
            )
            lines.append(f"Highest mean forward risk by district: {top}.")

        corridors = facts.get("critical_corridors") or []
        if corridors:
            first = corridors[0]
            lines.append(
                f"The most exposed lifeline is {first['name']} "
                f"(criticality {first['criticality']}/3), whose worst 8 km reach "
                f"{first['worst_class'].lower()} risk"
                + (f" in {first['worst_district']}" if first.get("worst_district") else "")
                + "."
            )
    elif scope == "district":
        row = facts.get("district") or {}
        if row:
            lines.append(
                f"{row.get('district')}, {row.get('state')}: mean forward risk "
                f"{row.get('risk_forward', {}).get('mean')} ({row.get('risk_forward', {}).get('class')}), "
                f"peak {row.get('risk_forward', {}).get('max')}, "
                f"population {row.get('population')}."
            )
    elif scope == "point":
        point = facts.get("point") or {}
        location = point.get("location", {})
        risk = point.get("risk", {})
        thresholds = point.get("thresholds", {})
        grade = point.get("uncertainty", {})
        lines.append(
            f"At {location.get('latitude')}, {location.get('longitude')} "
            f"({location.get('district', {}).get('district')}, {location.get('district', {}).get('state')}) "
            f"susceptibility is {point.get('susceptibility', {}).get('class')} "
            f"({point.get('susceptibility', {}).get('index')}) and current risk is "
            f"{risk.get('now', {}).get('class')} ({risk.get('now', {}).get('value')}), "
            f"with a stated band of +/- {grade.get('sigma')} (support grade {grade.get('grade')})."
        )
        high = thresholds.get("HIGH")
        if high:
            lines.append(
                f"To reach HIGH this cell needs {high.get('rainfall_72h_mm')} mm of rain in 72 hours; "
                f"the margin against the present assumption is {high.get('margin_mm')} mm."
            )

    lines.append(
        "This is a research prototype output, not an operational warning. "
        "Verify against field observation before acting."
    )
    return " ".join(lines)


def llm_briefing(facts: dict[str, Any]) -> tuple[str | None, str]:
    """Rewrite the briefing with an OpenAI-compatible model, if configured.

    Returns ``(text, status)``; ``text`` is ``None`` when the call is not
    possible, and the caller falls back to the deterministic briefing.
    """
    key = os.environ.get(config.NARRATIVE_KEY_ENV)
    if not key:
        return None, "no key configured"

    instruction = (
        "You are writing a landslide-risk situation brief for a district disaster officer in "
        "North East India. Use ONLY the numbers in the JSON. Do not introduce any new figure, "
        "place name or event. Do not invent certainty. Write 120-180 words of plain, calm prose "
        "with no headings, no bullet points and no emoji. End with one sentence stating this is a "
        "research prototype and not an operational warning."
    )
    body = json.dumps(
        {
            "model": config.NARRATIVE_MODEL,
            "messages": [
                {"role": "system", "content": instruction},
                {"role": "user", "content": json.dumps(facts, default=str)},
            ],
            "temperature": 0.2,
            "max_tokens": 400,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        config.NARRATIVE_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=config.RAINFALL_TIMEOUT * 2) as response:
            payload = json.loads(response.read().decode("utf-8"))
        text = payload["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, IndexError) as exc:
        return None, f"model call failed ({type(exc).__name__})"
    return text, f"rewritten by {config.NARRATIVE_MODEL}"


def briefing(service, scope: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Produce a briefing for a scope, falling back to the template."""
    payload = payload or {}
    facts = build_facts(service, scope, payload)

    text, status = (None, "not attempted")
    if scope == "region":
        # Rewriting is optional and only worth attempting for the regional
        # brief, where a paragraph genuinely adds value over the tables.
        text, status = llm_briefing(facts)

    if text:
        return {
            "scope": scope,
            "text": text,
            "generated_by": status,
            "grounded_on": _grounded_fields(facts),
            "caveat": "Narrative generated from the computed fields listed in 'grounded_on'.",
        }

    return {
        "scope": scope,
        "text": deterministic_briefing(facts),
        "generated_by": f"deterministic template ({status})",
        "grounded_on": _grounded_fields(facts),
        "caveat": "Template narration. Every number is taken directly from the API response.",
    }


def _grounded_fields(facts: dict[str, Any]) -> list[str]:
    return sorted(facts.keys())
