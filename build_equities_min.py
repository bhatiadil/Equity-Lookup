
import csv, json, os

SRC = "equities.csv"
OUT = os.path.join("docs", "data", "equities.min.json")

DESC_CANDIDATES = ["summary", "description", "desc"]

rows = []
with open(SRC, "r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for r in reader:
        desc = ""
        for k in DESC_CANDIDATES:
            if k in r and r[k]:
                desc = r[k]
                break

        rows.append({
            "symbol": (r.get("symbol") or "").strip(),
            "name": (r.get("name") or "").strip(),
            "isin": (r.get("isin") or "").strip(),
            "country": (r.get("country") or "").strip(),
            "description": (desc or "").strip()
        })

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False)

print(f"Wrote {len(rows):,} rows to {OUT}")
