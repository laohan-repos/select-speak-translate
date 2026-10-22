"""Build compact offline shards from ECDICT's MIT-licensed CSV.

Download the source into output/sources/ecdict.csv before running this script.
The source's Git blob SHA-1 is checked to make the import reproducible.
"""
import csv
import hashlib
import json
from pathlib import Path
import re
import string

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "output/sources/ecdict.csv"
EXPECTED_BLOB = "c4ade63ea08cf39d9c3475e96929036d64d94c94"
raw = SOURCE.read_bytes()
blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
if blob != EXPECTED_BLOB:
    raise SystemExit("Unexpected ECDICT source; review its version before importing.")

entries = {}
forms = {}

def rank(value):
    return int(value) if value and value.isdigit() and int(value) > 0 else 999999

def clean(value):
    return re.sub(r"\\+n", "\n", value).strip()

with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
    for row in csv.DictReader(handle):
        word = row["word"].strip()
        if not re.fullmatch(r"[A-Za-z][A-Za-z'-]{0,54}", word):
            continue
        if not row["tag"] and not row["oxford"] == "1" and min(rank(row["bnc"]), rank(row["frq"])) > 30000:
            continue
        translation = clean(row["translation"])
        if not re.search(r"[\u3400-\u9fff]", translation):
            continue
        key = word.lower()
        if key not in entries or word == key:
            entries[key] = [clean(row["phonetic"]), translation]
        for exchange in row["exchange"].split("/"):
            kind, _, value = exchange.partition(":")
            if kind in {"p", "d", "i", "3", "r", "t", "s"}:
                for variant in value.split(","):
                    variant = variant.lower().strip()
                    if re.fullmatch(r"[a-z][a-z'-]*", variant):
                        forms.setdefault(variant, key)

aliases = {word: [base] for word, base in forms.items() if word not in entries and base in entries}
output = ROOT / "data/dictionary"
output.mkdir(parents=True, exist_ok=True)
combined = entries | aliases
for letter in string.ascii_lowercase:
    shard = {word: value for word, value in sorted(combined.items()) if word[0] == letter}
    (output / f"{letter}.json").write_text(json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

metadata = {
    "source": "https://github.com/skywind3000/ECDICT",
    "sourceFile": "ecdict.csv",
    "gitBlobSha1": EXPECTED_BLOB,
    "license": "MIT",
    "selection": "English words with exam tags, Oxford flag, or BNC/FRQ frequency rank <= 30000, plus inflections",
    "headwords": len(entries),
    "inflections": len(aliases),
    "total": len(combined),
}
(ROOT / "data/dictionary-meta.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(metadata, ensure_ascii=False, indent=2))
