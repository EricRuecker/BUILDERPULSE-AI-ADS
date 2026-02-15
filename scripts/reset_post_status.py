#!/usr/bin/env python3
from __future__ import annotations
import os
import re
from pathlib import Path

RESET_TO = "ready"  # change to "pending" if your system expects that

def is_queue_header(line: str) -> bool:
    # Detects a TSV/CSV header that includes status + platform(s)
    l = line.lower()
    return ("status" in l) and ("platform" in l or "platforms" in l) and ("id" in l)

def split_row(line: str):
    # Prefer TSV (your sample looks tab-separated), fallback to CSV
    if "\t" in line:
        return "\t", line.rstrip("\n").split("\t")
    return ",", line.rstrip("\n").split(",")

def join_row(sep: str, parts: list[str]) -> str:
    return sep.join(parts) + "\n"

def reset_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace").splitlines(True)
    if not text:
        return False

    # Find header line
    header_idx = None
    for i, line in enumerate(text[:30]):  # header should be near top
        if is_queue_header(line):
            header_idx = i
            break
    if header_idx is None:
        return False

    sep, header_cols = split_row(text[header_idx])
    cols = [c.strip() for c in header_cols]

    # Map columns
    col_index = {c.lower(): idx for idx, c in enumerate(cols)}
    if "status" not in col_index:
        return False

    status_i = col_index["status"]

    # Optional columns to clear if present
    clear_cols = []
    for name in cols:
        n = name.lower()
        if n in ("posted_at", "postedat"):
            clear_cols.append(col_index[n])
        # clear any *_post_id, ig_media_id, tweet_id, etc
        if re.search(r"(post_id|media_id|tweet_id)$", n):
            clear_cols.append(col_index[n])

    changed = False

    # Update rows below header until a blank line (common in these files)
    for i in range(header_idx + 1, len(text)):
        line = text[i]
        if not line.strip():
            # Stop at first blank line (often separates table from caption/body)
            break

        sep2, parts = split_row(line)
        # If file mixes separators, skip weird lines
        if sep2 != sep or len(parts) < len(cols):
            continue

        status_val = parts[status_i].strip().lower()
        if status_val == "posted":
            parts[status_i] = RESET_TO
            for ci in clear_cols:
                if ci < len(parts):
                    parts[ci] = ""
            text[i] = join_row(sep, parts)
            changed = True

    if changed:
        path.write_text("".join(text), encoding="utf-8")
    return changed

def main():
    root = Path("posts")
    if not root.exists():
        print("No posts/ directory found. Nothing to do.")
        return

    candidates = []
    # Search for likely queue files
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        # common names, but we also allow any small text file in posts/
        if p.suffix.lower() in (".tsv", ".csv", ".txt", ".md"):
            candidates.append(p)

    total_changed = 0
    for p in candidates:
        try:
            if reset_file(p):
                print(f"[RESET] {p}")
                total_changed += 1
        except Exception as e:
            print(f"[SKIP] {p} ({e})")

    print(f"Done. Files changed: {total_changed}")

if __name__ == "__main__":
    main()
