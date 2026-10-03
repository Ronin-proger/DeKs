from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from database import get_connection, init_db
from intelligence.graph_links import all_linked_paths, wiki_linked_paths
from intelligence.markdown_utils import is_user_facing_note, loads_json, note_domain, utc_now


def compute_vault_analytics() -> dict:
    init_db()
    with get_connection() as conn:
        all_notes = [dict(row) for row in conn.execute("SELECT * FROM obsidian_notes").fetchall()]
        links = [dict(row) for row in conn.execute("SELECT * FROM obsidian_links").fetchall()]
        semantic_rows = [
            dict(row)
            for row in conn.execute("SELECT source_path, target_path FROM ai_note_links").fetchall()
        ]

    notes = [n for n in all_notes if is_user_facing_note(n["path"])]

    if not notes:
        return {}

    wiki_linked = wiki_linked_paths(links)
    graph_linked = all_linked_paths(links, semantic_rows)

    now = datetime.now(timezone.utc)
    total_words = sum(n.get("word_count") or 0 for n in notes)
    folders: Counter = Counter()
    tags: Counter = Counter()
    activity_weeks: dict[str, int] = defaultdict(int)

    for note in notes:
        folder = note.get("folder") or note_domain(note["path"], loads_json(note.get("tags"), []))
        folders[folder] += 1
        for tag in loads_json(note.get("tags"), []):
            tags[tag] += 1
        updated = note.get("updated_at")
        if updated:
            try:
                dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                week_key = dt.strftime("%Y-W%W")
                activity_weeks[week_key] += 1
            except ValueError:
                pass

    outgoing: Counter = Counter()
    incoming: Counter = Counter()
    for link in links:
        outgoing[link["source_path"]] += 1
        if link.get("target_path"):
            incoming[link["target_path"]] += 1

    linked_paths = {l["source_path"] for l in links} | {l["target_path"] for l in links if l.get("target_path")}
    orphans = [
        {
            "path": n["path"],
            "title": n["title"],
            "wordCount": n.get("word_count") or 0,
            "hasSemanticLink": n["path"] in graph_linked and n["path"] not in wiki_linked,
        }
        for n in notes
        if n["path"] not in wiki_linked and (n.get("word_count") or 0) > 15
    ]
    orphans.sort(key=lambda x: x["wordCount"], reverse=True)

    hubs = []
    for note in notes:
        path = note["path"]
        out_c = outgoing.get(path, 0)
        in_c = incoming.get(path, 0)
        if out_c + in_c == 0:
            continue
        hubs.append(
            {
                "path": path,
                "title": note["title"],
                "outgoing": out_c,
                "incoming": in_c,
                "total": out_c + in_c,
                "wordCount": note.get("word_count") or 0,
            }
        )
    hubs.sort(key=lambda x: x["total"], reverse=True)

    recent = sorted(
        [
            {
                "path": n["path"],
                "title": n["title"],
                "updatedAt": n.get("updated_at"),
                "wordCount": n.get("word_count") or 0,
                "folder": n.get("folder") or note_domain(n["path"], loads_json(n.get("tags"), [])),
            }
            for n in notes
            if n.get("updated_at")
        ],
        key=lambda x: x["updatedAt"],
        reverse=True,
    )[:12]

    week_labels = []
    for i in range(7, -1, -1):
        dt = now - timedelta(weeks=i)
        week_labels.append(dt.strftime("%Y-W%W"))

    activity_timeline = [
        {"week": wk, "edits": activity_weeks.get(wk, 0), "label": _week_label(wk)}
        for wk in week_labels
    ]

    stale_cutoff = now - timedelta(days=30)
    stale = []
    for note in notes:
        updated = note.get("updated_at")
        if not updated:
            continue
        try:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            if dt < stale_cutoff:
                stale.append({"path": note["path"], "title": note["title"], "updatedAt": updated})
        except ValueError:
            continue
    stale.sort(key=lambda x: x["updatedAt"])

    health = _vault_health(len(notes), len(orphans), len(stale), len(links), total_words)

    return {
        "summary": {
            "notesTotal": len(notes),
            "linksTotal": len([l for l in links if l.get("target_path")]),
            "wordsTotal": total_words,
            "avgWords": round(total_words / max(len(notes), 1)),
            "foldersCount": len(folders),
            "tagsCount": len(tags),
            "orphansCount": len(orphans),
            "staleCount": len(stale),
            "healthScore": health,
        },
        "folders": [{"name": k, "count": v} for k, v in folders.most_common(12)],
        "tags": [{"name": k, "count": v} for k, v in tags.most_common(20)],
        "activity": activity_timeline,
        "hubs": hubs[:10],
        "orphans": orphans[:15],
        "recent": recent,
        "stale": stale[:10],
        "computedAt": utc_now(),
    }


def analyze_note(path: str) -> dict | None:
    init_db()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM obsidian_notes WHERE path = ? LIMIT 1", (path,)).fetchone()
        if not row:
            return None
        note = dict(row)
        out_links = [
            dict(r)
            for r in conn.execute(
                "SELECT target_path, target_title, is_new FROM obsidian_links WHERE source_path = ?",
                (path,),
            ).fetchall()
        ]
        in_links = [
            dict(r)
            for r in conn.execute(
                "SELECT source_path, is_new FROM obsidian_links WHERE target_path = ?",
                (path,),
            ).fetchall()
        ]

    tags = loads_json(note.get("tags"), [])
    domain = note_domain(note["path"], tags)
    content = note.get("content") or ""
    headings = [line.lstrip("#").strip() for line in content.splitlines() if line.strip().startswith("#")]

    return {
        "path": note["path"],
        "title": note["title"],
        "wordCount": note.get("word_count") or 0,
        "tags": tags,
        "domain": domain,
        "folder": note.get("folder") or domain,
        "updatedAt": note.get("updated_at"),
        "outgoingLinks": [
            {"path": l.get("target_path"), "title": l.get("target_title"), "isNew": bool(l.get("is_new"))}
            for l in out_links
            if l.get("target_path")
        ],
        "incomingLinks": [
            {"path": l["source_path"], "isNew": bool(l.get("is_new"))}
            for l in in_links
        ],
        "headings": headings[:8],
        "linkDensity": round((len(out_links) + len(in_links)) / max(note.get("word_count") or 1, 1) * 100, 2),
        "isOrphan": len(out_links) == 0 and len(in_links) == 0,
    }


def _week_label(week_key: str) -> str:
    try:
        year, _, num = week_key.partition("-W")
        dt = datetime.strptime(f"{year}-W{num}-1", "%Y-W%W-%w")
        return dt.strftime("%d.%m")
    except ValueError:
        return week_key


def _vault_health(notes: int, orphans: int, stale: int, links: int, words: int) -> int:
    if notes == 0:
        return 0
    link_ratio = min(links / max(notes, 1), 3) / 3
    orphan_penalty = orphans / max(notes, 1)
    stale_penalty = stale / max(notes, 1)
    depth_bonus = min(words / max(notes * 80, 1), 1)
    score = 100 * (0.35 * link_ratio + 0.25 * (1 - orphan_penalty) + 0.2 * (1 - stale_penalty) + 0.2 * depth_bonus)
    return max(0, min(100, round(score)))
