#!/usr/bin/env python3
"""Repair demo-companies.csv column misalignment.

Reads with csv.reader (line-by-line so cross-row quote merges do not swallow
neighbors). Rebuilds trailing columns by locating linkedin.com + demo_fit and
placing growth/reputation/technology/linkedin/description/demo_fit correctly.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

EXPECTED_COLS = 23
# company_id .. key_services
PREFIX_COLS = 17

GROWTH = {"Growing", "Stale", "Stable", "Declining"}
REP = {"Positive", "Neutral", "Negative", "Mixed"}
FIT = {"High", "Medium", "Low", "Reject"}
# Junk tokens observed from quote/merge corruption (not real column values)
JUNK_CELLS = {"Cola", "RIAs"}

LINKEDIN_RE = re.compile(r"linkedin\.com", re.I)


def is_linkedin(cell: str) -> bool:
    return bool(LINKEDIN_RE.search(cell or ""))


def is_fit(cell: str) -> bool:
    return (cell or "").strip() in FIT


def explode_collapsed(cell: str) -> list[str]:
    """Split a wrongly-quoted trailing blob that contains commas + linkedin + fit."""
    raw = (cell or "").strip().strip('"')
    if not (is_linkedin(raw) and "," in raw):
        return [cell]
    bits = [b.strip() for b in raw.split(",")]
    li_idxs = [i for i, b in enumerate(bits) if is_linkedin(b)]
    fit_idxs = [i for i, b in enumerate(bits) if is_fit(b)]
    if not li_idxs or not fit_idxs:
        return [cell]
    li_i = li_idxs[0]
    fit_i = fit_idxs[-1]
    if fit_i <= li_i:
        return [cell]
    # Expect: ... growth, rep, tech, linkedin, desc..., fit
    if li_i < 3:
        return [cell]
    head = bits[: li_i - 3]
    growth, rep, tech = bits[li_i - 3], bits[li_i - 2], bits[li_i - 1]
    linkedin = bits[li_i]
    desc = ",".join(bits[li_i + 1 : fit_i]).strip()
    fit = bits[fit_i]
    return head + [growth, rep, tech, linkedin, desc, fit]


def expand_row(row: list[str]) -> list[str]:
    """Expand collapsed mega-fields; strip lone junk quote marks."""
    out: list[str] = []
    for cell in row:
        c = cell
        # Stray closing/opening quote glued to an otherwise normal field
        if c.count('"') == 1 and not is_linkedin(c):
            c = c.replace('"', "").strip()
        if is_linkedin(c) and c.count(",") >= 5 and any(is_fit(p) for p in c.split(",")):
            out.extend(explode_collapsed(c))
        else:
            out.append(c)
    # Drop empty cells that sit immediately before an exploded business_model
    # (Attio pattern: customer_profile, "", then BM...)
    cleaned: list[str] = []
    for i, c in enumerate(out):
        if c == "" and i + 1 < len(out) and out[i + 1] in (
            "B2B SaaS",
            "B2B SaaS + services",
        ):
            continue
        cleaned.append(c)
    return cleaned


def unglue_growth(prefix: list[str], growth: str) -> tuple[list[str], str]:
    if not prefix:
        return prefix, growth
    last = prefix[-1]
    for g in sorted(GROWTH, key=len, reverse=True):
        if last.endswith(";" + g):
            prefix = prefix[:-1] + [last[: -(len(g) + 1)]]
            return prefix, growth or g
        if last.endswith(g) and len(last) > len(g) and last[-len(g) - 1 :] == g:
            # e.g. ends with Growing without semicolon — still unglue if preceded by alnum
            if last[-len(g) - 1] not in (",", " "):
                prefix = prefix[:-1] + [last[: -len(g)]]
                return prefix, growth or g
    return prefix, growth


def fix_prefix_length(prefix: list[str]) -> list[str]:
    """Normalize to 17 leading columns (id .. key_services)."""
    # Drop known junk cells
    prefix = [c for c in prefix if c.strip() not in JUNK_CELLS]
    # Drop empty placeholders
    if len(prefix) > PREFIX_COLS:
        prefix = [c for c in prefix if c != ""] or prefix

    if len(prefix) == PREFIX_COLS:
        return prefix

    if len(prefix) < PREFIX_COLS:
        return prefix + [""] * (PREFIX_COLS - len(prefix))

    # Too many: usually primary_service was split on commas (PTC).
    extra = len(prefix) - PREFIX_COLS
    joined = ",".join(p.strip() for p in prefix[4 : 4 + extra + 1]).strip()
    # Normalize "PLM, IoT" style spacing
    joined = re.sub(r"\s*,\s*", ", ", joined)
    return prefix[:4] + [joined] + prefix[4 + extra + 1 :]


def repair_row(row: list[str]) -> list[str]:
    row = expand_row(list(row))
    # Fast path: already well-formed
    if (
        len(row) == EXPECTED_COLS
        and is_linkedin(row[20])
        and is_fit(row[22])
        and row[17].strip() in GROWTH
        and row[18].strip() in REP
        and row[17].strip() not in JUNK_CELLS
    ):
        return row

    # Remove Cola / RIAs junk anywhere before anchors
    row = [c for c in row if c.strip() not in JUNK_CELLS]

    fit_idxs = [i for i, c in enumerate(row) if is_fit(c)]
    li_idxs = [i for i, c in enumerate(row) if is_linkedin(c)]
    if not fit_idxs or not li_idxs:
        # Cannot safely repair — pad/trim
        if len(row) < EXPECTED_COLS:
            return row + [""] * (EXPECTED_COLS - len(row))
        return row[:EXPECTED_COLS]

    fit_i = fit_idxs[-1]
    # Prefer linkedin that sits before demo_fit
    li_candidates = [i for i in li_idxs if i < fit_i]
    li_i = li_candidates[-1] if li_candidates else li_idxs[-1]
    if li_i >= fit_i:
        if len(row) == EXPECTED_COLS:
            return row
        return (row + [""] * EXPECTED_COLS)[:EXPECTED_COLS]

    linkedin = row[li_i].strip()
    demo_fit = row[fit_i].strip()
    description = ",".join(c.strip() for c in row[li_i + 1 : fit_i]).strip()
    # Fix thousands separators re-joined: "10,100+" is correct; leading spaces ok
    description = re.sub(r"\s+,", ",", description)
    description = re.sub(r",\s*", ", ", description).strip()
    # But employee counts like "10, 100+" should be "10,100+"
    description = re.sub(r"(\d),\s+(\d)", r"\1,\2", description)

    before = row[:li_i]
    tech = before[-1].strip() if before else ""
    before = before[:-1] if before else []

    rep = ""
    if before and before[-1].strip() in REP:
        rep = before[-1].strip()
        before = before[:-1]

    growth = ""
    if before and before[-1].strip() in GROWTH:
        growth = before[-1].strip()
        before = before[:-1]

    before, growth = unglue_growth(before, growth)
    prefix = fix_prefix_length(before)

    # Fallbacks if signals missing
    if not growth:
        growth = ""
    if not rep:
        rep = ""

    fixed = prefix + [growth, rep, tech, linkedin, description, demo_fit]
    assert len(fixed) == EXPECTED_COLS, (row[0] if row else "?", len(fixed), fixed[-8:])
    return fixed


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data" / "demo-companies.csv"

    with path.open(newline="", encoding="utf-8") as f:
        header_line = f.readline()
        header = next(csv.reader([header_line]))
        raw_rows: list[list[str]] = []
        for line in f:
            line = line.rstrip("\n").rstrip("\r")
            if not line:
                continue
            raw_rows.append(next(csv.reader([line])))

    if len(header) != EXPECTED_COLS:
        print(f"Unexpected header width: {len(header)}", file=sys.stderr)
        return 1

    fixed_rows = [repair_row(r) for r in raw_rows]

    # Verify
    bad = [r[0] for r in fixed_rows if len(r) != EXPECTED_COLS]
    if bad:
        print(f"FAILED: non-23 rows remain: {bad[:20]}", file=sys.stderr)
        return 1

    li_ok = sum(1 for r in fixed_rows if is_linkedin(r[20]))
    cola_growth = sum(1 for r in fixed_rows if r[17].strip() == "Cola")
    by_id = {r[0]: r for r in fixed_rows}

    for cid in ("C074", "C075"):
        r = by_id[cid]
        if not is_linkedin(r[20]):
            print(f"FAILED: {cid} linkedin_url={r[20]!r}", file=sys.stderr)
            return 1
        print(f"OK {cid} linkedin={r[20]}")

    c022 = by_id["C022"]
    print(
        "OK C022",
        f"growth={c022[17]!r}",
        f"tech={c022[19]!r}",
        f"linkedin={c022[20]!r}",
        f"fit={c022[22]!r}",
    )

    print(f"rows={len(fixed_rows)} linkedin_at_col={li_ok} cola_as_growth={cola_growth}")
    if li_ok < 320:
        print(f"FAILED: expected ~320+ linkedin URLs in col, got {li_ok}", file=sys.stderr)
        return 1
    if cola_growth:
        print("FAILED: Cola still in growth_signal", file=sys.stderr)
        return 1

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(fixed_rows)

    print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
