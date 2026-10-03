"""Helpers for wiki vs semantic links in the vault graph."""


def wiki_linked_paths(links: list[dict]) -> set[str]:
    paths: set[str] = set()
    for link in links:
        paths.add(link["source_path"])
        if link.get("target_path"):
            paths.add(link["target_path"])
    return paths


def semantic_linked_paths(rows: list[dict]) -> set[str]:
    paths: set[str] = set()
    for row in rows:
        paths.add(row["source_path"])
        paths.add(row["target_path"])
    return paths


def all_linked_paths(wiki_links: list[dict], semantic_rows: list[dict]) -> set[str]:
    return wiki_linked_paths(wiki_links) | semantic_linked_paths(semantic_rows)
