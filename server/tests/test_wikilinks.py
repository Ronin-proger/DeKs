from intelligence.markdown_utils import extract_wikilinks, normalize_link_target, resolve_link_target


def test_extract_wikilinks_basic():
    content = "See [[Projects/Alpha]] and [[Note|alias]] plus [[Tag#heading]]."
    assert extract_wikilinks(content) == ["Projects/Alpha", "Note", "Tag"]


def test_extract_wikilinks_empty():
    assert extract_wikilinks("no links here") == []


def test_normalize_and_resolve_link_target():
    index = {
        "Projects/Alpha": "Projects/Alpha.md",
        "Note": "Note.md",
    }
    assert normalize_link_target("Note.md") == "Note"
    assert resolve_link_target("Note", index) == "Note.md"
    assert resolve_link_target("projects/alpha", index) == "Projects/Alpha.md"
    assert resolve_link_target("Missing", index) is None
