#!/usr/bin/env python3
"""Refresh embedded comparison assets and build the local review source ZIP."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STANDALONE = ROOT / "plywood-cutting-layout-standalone.html"
ARCHIVE = ROOT / "plywood-cutting-layout-review.zip"
EMBEDDED_ASSETS = {
    "assets/remnant-comparison.css": "style",
    "assets/remnant-comparison.js": "script",
    "assets/remnant-comparison-ui.js": "script",
    "assets/reusable-remnant-stock-ui.js": "script",
    "assets/mobile-view.css": "style",
}
INCLUDE_TOP_LEVEL = [
    "index.html",
    "plywood-cutting-layout-standalone.html",
    "sw.js",
    "favicon.ico",
    "README.md",
    "LICENSE",
    "AI_HANDOFF_鋸枱排料.md",
    "CHANGE_REPORT.md",
    "LOCAL_INTEGRATION.md",
    "REMNANT_COMPARISON_HOWTO.md",
    "REUSABLE_REMNANT_STOCK_PLAN.md",
    "TABLE_SAW_RELEASE.md",
    "TODO.md",
    "manus-routes.json",
]


def sync_standalone() -> None:
    html = STANDALONE.read_text(encoding="utf-8")
    for relative, tag in EMBEDDED_ASSETS.items():
        marker = f'data-standalone-asset="{relative}"'
        if html.count(marker) != 1:
            raise RuntimeError(f"Expected one standalone marker for {relative}")
        marker_at = html.index(marker)
        opening_end = html.index(">", marker_at) + 1
        closing_tag = f"</{tag}>"
        closing_at = html.find(closing_tag, opening_end)
        if closing_at < 0:
            raise RuntimeError(f"Could not find {closing_tag} for {relative}")
        source = (ROOT / relative).read_text(encoding="utf-8").rstrip()
        html = html[:opening_end] + "\n" + source + "\n" + html[closing_at:]
    source_shell = (ROOT / "index.html").read_text(encoding="utf-8")
    html = sync_code_range(
        html,
        source_shell,
        "function readAutoDisplayUnitsPreference() {",
        "function saveAutoDisplayUnitsPreference(value) {",
    )
    html = sync_code_range(
        html,
        source_shell,
        "  const CUT_PATH_STORAGE_KEY=",
        "  let activeVerifiedPlan=null;",
    )
    html = sync_marked_element(html, source_shell, 'id="remnantComparisonAction"', "div")
    html = sync_marked_element(html, source_shell, 'id="remnantComparisonDialog"', "dialog")
    for input_id in ("manualRemnantWidth", "manualRemnantLength"):
        html = sync_input_label(html, source_shell, input_id)
    STANDALONE.write_text(html, encoding="utf-8")


def sync_marked_element(target: str, source: str, marker: str, tag: str) -> str:
    source_marker = source.find(marker)
    target_marker = target.find(marker)
    if source_marker < 0 or target_marker < 0 or source.count(marker) != 1 or target.count(marker) != 1:
        raise RuntimeError(f"Expected one source and standalone element marked {marker}")
    opening = f"<{tag}"
    closing = f"</{tag}>"
    source_start = source.rfind(opening, 0, source_marker)
    source_end = source.find(closing, source_marker)
    target_start = target.rfind(opening, 0, target_marker)
    target_end = target.find(closing, target_marker)
    if min(source_start, source_end, target_start, target_end) < 0:
        raise RuntimeError(f"Could not locate complete {tag} element marked {marker}")
    source_end += len(closing)
    target_end += len(closing)
    return target[:target_start] + source[source_start:source_end] + target[target_end:]


def sync_code_range(target: str, source: str, start_marker: str, end_marker: str) -> str:
    if source.count(start_marker) != 1 or target.count(start_marker) != 1:
        raise RuntimeError(f"Expected one source and standalone code block starting {start_marker}")
    if source.count(end_marker) != 1 or target.count(end_marker) != 1:
        raise RuntimeError(f"Expected one source and standalone code block ending {end_marker}")
    source_start = source.index(start_marker)
    source_end = source.index(end_marker, source_start)
    target_start = target.index(start_marker)
    target_end = target.index(end_marker, target_start)
    if min(source_start, source_end, target_start, target_end) < 0:
        raise RuntimeError(f"Could not locate code block between {start_marker} and {end_marker}")
    return target[:target_start] + source[source_start:source_end] + target[target_end:]


def sync_input_label(target: str, source: str, input_id: str) -> str:
    marker = f'id="{input_id}"'
    if source.count(marker) != 1 or target.count(marker) != 1:
        raise RuntimeError(f"Expected one source and standalone input {input_id}")
    source_marker = source.index(marker)
    target_marker = target.index(marker)
    source_start = source.rfind("<label", 0, source_marker)
    source_end = source.find("</label>", source_marker)
    target_start = target.rfind("<label", 0, target_marker)
    target_end = target.find("</label>", target_marker)
    if min(source_start, source_end, target_start, target_end) < 0:
        raise RuntimeError(f"Could not locate label for {input_id}")
    source_end += len("</label>")
    target_end += len("</label>")
    return target[:target_start] + source[source_start:source_end] + target[target_end:]


def source_files() -> list[Path]:
    files = [ROOT / name for name in INCLUDE_TOP_LEVEL]
    for folder in ("assets", "scripts", "tests"):
        files.extend(path for path in (ROOT / folder).rglob("*") if path.is_file())
    workflow = ROOT / ".github/workflows/pages.yml"
    if workflow.is_file():
        files.append(workflow)
    return sorted(set(path for path in files if path.is_file()))


def build_archive() -> None:
    with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in source_files():
            bundle.write(path, path.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    sync_standalone()
    build_archive()
    print(f"Updated {STANDALONE}")
    print(f"Built {ARCHIVE} ({ARCHIVE.stat().st_size:,} bytes)")
