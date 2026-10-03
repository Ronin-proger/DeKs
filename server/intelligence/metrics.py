import json
import math
from datetime import datetime, timedelta, timezone

from database import get_connection, init_db
from intelligence.markdown_utils import (
    display_folder,
    is_user_facing_note,
    jaccard_words,
    loads_json,
    note_domain,
    utc_now,
    dumps_json,
)


def _sigmoid(value: float) -> float:
    return 100 / (1 + math.exp(-value))


def compute_all_metrics() -> dict:
    init_db()
    with get_connection() as conn:
        all_notes = [dict(row) for row in conn.execute("SELECT * FROM obsidian_notes").fetchall()]
        all_links = [dict(row) for row in conn.execute("SELECT * FROM obsidian_links").fetchall()]

    notes = [n for n in all_notes if is_user_facing_note(n["path"])]
    links = [
        l for l in all_links
        if is_user_facing_note(l["source_path"])
        and (not l.get("target_path") or is_user_facing_note(l["target_path"]))
    ]

    if not notes:
        return {}

    note_map = {n["path"]: n for n in notes}
    domains = {n["path"]: note_domain(n["path"], loads_json(n["tags"], [])) for n in notes}

    cross_links = 0
    for link in links:
        source = link["source_path"]
        target = link["target_path"]
        if not target:
            continue
        if domains.get(source) != domains.get(target):
            cross_links += 1

    total_links = max(len([l for l in links if l["target_path"]]), 1)
    new_links = len([l for l in links if l["is_new"]])
    active_notes = len(notes)
    link_density = total_links / max(active_notes, 1)

    cognitive_pulse = round(
        _sigmoid(0.9 * (new_links / max(active_notes, 1)) + 1.4 * link_density + 0.5 * (cross_links / total_links) - 0.8),
        1,
    )

    possible_pairs = 0
    for i, note_a in enumerate(notes):
        for note_b in notes[i + 1 :]:
            if domains[note_a["path"]] == domains[note_b["path"]]:
                continue
            if jaccard_words(note_a["content"], note_b["content"]) >= 0.08:
                possible_pairs += 1
    synergy = round(100 * cross_links / max(cross_links + possible_pairs, 1), 1)

    in_degree = {}
    for link in links:
        target = link["target_path"]
        if target:
            in_degree[target] = in_degree.get(target, 0) + 1

    experts = []
    for note in notes:
        path = note["path"]
        score = in_degree.get(path, 0) * 2 + min(note["word_count"] or 0, 500) / 50
        experts.append(
            {
                "path": path,
                "title": note["title"],
                "author": note["author"] or "company",
                "score": round(score, 2),
                "citations": in_degree.get(path, 0),
            }
        )
    experts.sort(key=lambda item: item["score"], reverse=True)

    note_load = _note_load_metrics(notes, links)
    risks = _risk_signals(notes, links, in_degree, experts, domains)

    collective_iq = round(
        (cognitive_pulse * 0.35 + synergy * 0.25 + min(len(experts), 10) * 5 + (100 - risks["composite"] * 100) * 0.25),
        1,
    )

    metrics = {
        "cognitivePulse": cognitive_pulse,
        "synergyCoefficient": synergy,
        "collectiveIQ": min(collective_iq, 100),
        "notesTotal": len(notes),
        "linksTotal": total_links,
        "crossLinks": cross_links,
        "newLinks": new_links,
        "noteLoad": note_load,
        "experts": experts[:10],
        "risks": risks,
        "computedAt": utc_now(),
    }

    _persist_metrics(metrics)
    return metrics


def _note_load_metrics(notes, links) -> dict:
    now = datetime.now(timezone.utc)
    buckets: dict[str, dict] = {}
    recent_total = 0
    total_words = 0

    for note in notes:
        tags = loads_json(note.get("tags"), [])
        folder = display_folder(note["path"], tags)
        bucket = buckets.setdefault(folder, {"notes": 0, "words": 0, "recent": 0})
        bucket["notes"] += 1
        words = note.get("word_count") or 0
        bucket["words"] += words
        total_words += words
        updated = note.get("updated_at")
        if updated:
            try:
                dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                if now - dt <= timedelta(days=14):
                    bucket["recent"] += 1
                    recent_total += 1
            except ValueError:
                pass

    folders = []
    for folder, data in buckets.items():
        load = round(100 * data["recent"] / max(data["notes"], 1), 1)
        folders.append(
            {
                "folder": folder,
                "load": load,
                "notes": data["notes"],
                "recentEdits": data["recent"],
                "words": data["words"],
            }
        )
    folders.sort(key=lambda item: (item["load"], item["notes"]), reverse=True)

    overall = round(100 * recent_total / max(len(notes), 1), 1)
    return {
        "overall": overall,
        "recentNotes": recent_total,
        "totalNotes": len(notes),
        "avgWords": round(total_words / max(len(notes), 1), 1),
        "linkDensity": round(len(links) / max(len(notes), 1), 2),
        "folders": folders[:12],
    }


def _risk_signals(notes, links, in_degree, experts, domains) -> dict:
    hub_paths = {e["path"] for e in experts[:3]}
    stale_hubs = []
    stale_notes = 0
    now = datetime.now(timezone.utc)
    for note in notes:
        updated = note.get("updated_at")
        if updated:
            try:
                dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                if now - dt > timedelta(days=60):
                    stale_notes += 1
            except ValueError:
                pass
        if note["path"] not in hub_paths:
            continue
        if not updated:
            continue
        try:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            if now - dt > timedelta(days=30):
                stale_hubs.append(note["title"])
        except ValueError:
            continue

    stagnation = min(stale_notes / max(len(notes), 1), 1.0) * 0.35
    domain_count = len(set(domains.values()))
    cannibalization = 0.25 if domain_count <= 1 else 0.1
    flight = 0.35 if stale_hubs else 0.15
    composite = min(1.0, stagnation + cannibalization + flight)

    return {
        "composite": round(composite, 2),
        "staleNotes": stale_notes,
        "staleHubs": stale_hubs[:5],
        "stagnationRisk": round(stagnation, 2),
        "cannibalizationRisk": round(cannibalization, 2),
        "knowledgeFlightRisk": round(flight, 2),
    }


def _persist_metrics(metrics: dict) -> None:
    with get_connection() as conn:
        now = utc_now()
        entries = [
            ("cognitive_pulse", "company", metrics["cognitivePulse"]),
            ("synergy_coefficient", "company", metrics["synergyCoefficient"]),
            ("collective_iq", "company", metrics["collectiveIQ"]),
            ("risk_composite", "company", metrics["risks"]["composite"] * 100),
        ]
        for key, scope, value in entries:
            conn.execute(
                """
                INSERT INTO metric_snapshots (metric_key, scope, value, payload, computed_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (key, scope, value, dumps_json(metrics), now),
            )
        conn.commit()


def get_graph_data() -> dict:
    init_db()
    with get_connection() as conn:
        all_notes = [dict(row) for row in conn.execute("SELECT path, title, word_count, tags, folder, updated_at FROM obsidian_notes").fetchall()]
        all_links = [
            dict(row)
            for row in conn.execute(
                "SELECT source_path, target_path, is_new, link_type FROM obsidian_links WHERE target_path IS NOT NULL"
            ).fetchall()
        ]
        semantic = [
            dict(row)
            for row in conn.execute(
                "SELECT source_path, target_path, reason, strength FROM ai_note_links"
            ).fetchall()
        ]
        embeddings = {
            row["note_path"]: json.loads(row["embedding"])
            for row in conn.execute("SELECT note_path, embedding FROM note_embeddings").fetchall()
        }

    notes = [n for n in all_notes if is_user_facing_note(n["path"])]
    note_paths = {n["path"] for n in notes}
    links = [
        l for l in all_links
        if l["source_path"] in note_paths and l.get("target_path") in note_paths
    ]
    semantic = [
        s for s in semantic
        if s["source_path"] in note_paths and s.get("target_path") in note_paths
    ]

    nodes = []
    for index, note in enumerate(notes):
        tags = loads_json(note["tags"], [])
        embedding = embeddings.get(note["path"])
        x, y, z = _layout_coords(index, len(notes), embedding)
        nodes.append(
            {
                "id": note["path"],
                "label": note["title"],
                "wordCount": note["word_count"],
                "domain": note_domain(note["path"], tags),
                "x": x,
                "y": y,
                "z": z,
                "updatedAt": note["updated_at"],
            }
        )

    edges = [
        {
            "source": link["source_path"],
            "target": link["target_path"],
            "isNew": bool(link.get("is_new")),
            "linkType": link.get("link_type") or "wikilink",
        }
        for link in links
    ]
    for link in semantic:
        edges.append(
            {
                "source": link["source_path"],
                "target": link["target_path"],
                "isNew": False,
                "linkType": "semantic",
                "reason": link.get("reason") or "",
                "strength": link.get("strength") or 0.5,
            }
        )

    return {"nodes": nodes, "edges": edges}


def _layout_coords(index: int, total: int, embedding: list[float] | None) -> tuple[float, float, float]:
    angle = (index / max(total, 1)) * math.pi * 2
    ring_x = math.cos(angle) * 220
    ring_y = math.sin(angle) * 220

    if embedding and len(embedding) >= 2:
        ex = embedding[0] % 1
        ey = embedding[1] % 1
        ez = (embedding[2] % 1) if len(embedding) >= 3 else (index / max(total, 1))
        # identical/zero embeddings collapse the graph — blend with ring layout
        if abs(ex) < 1e-6 and abs(ey) < 1e-6:
            x, y = ring_x, ring_y
        else:
            x = ex * 800 - 400
            y = ey * 600 - 300
            if total > 1 and abs(x - ring_x) < 20 and abs(y - ring_y) < 20:
                x = ring_x + (index % 5) * 14
                y = ring_y + (index % 7) * 11
    else:
        x, y = ring_x, ring_y
        ez = index / max(total, 1)
    z = ez * 500 - 250
    return round(x, 2), round(y, 2), round(z, 2)


def get_landscape() -> list[dict]:
    graph = get_graph_data()
    return [
        {
            "id": node["id"],
            "label": node["label"],
            "x": node["x"],
            "y": node["y"],
            "density": node["wordCount"],
            "domain": node["domain"],
        }
        for node in graph["nodes"]
    ]
