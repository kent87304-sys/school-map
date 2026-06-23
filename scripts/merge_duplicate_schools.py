import json
import unicodedata
from collections import defaultdict
from pathlib import Path


DATA_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/schools.json")

CANONICAL = {
    "台中第一高中": "臺中第一高級中等學校",
    "台中女子高中": "臺中女子高級中等學校",
    "台中第二高中": "臺中第二高級中等學校",
    "文華高中": "文華高級中等學校",
    "豐原高中": "豐原高級中等學校",
    "僑泰高中": "私立僑泰高級中學",
    "僑泰高中進修部": "私立僑泰高級中學進修部",
    "光華高工": "私立光華高級工業職業學校",
    "大明高中": "私立大明高級中等學校",
    "宜寧高中": "私立宜寧高級中學",
    "嶺東高中": "私立嶺東高級中學",
    "常春藤高中": "私立常春藤高級中學",
    "弘文高中": "私立弘文高級中學",
    "新民高中": "私立新民高級中學",
    "明台高中": "私立明台高級中學",
    "明德高中": "私立明德高級中學",
    "明道高中": "私立明道高級中學",
    "致用高中": "私立致用高級中學",
    "華盛頓高中": "私立華盛頓高級中學",
    "青年高中": "私立青年高級中學",
}


def norm(name):
    s = unicodedata.normalize("NFKC", name or "")
    s = s.replace("臺", "台").replace("立", "立").replace(" ", "").strip()
    for token in ["台中市立", "台中市私立", "台中市", "國立", "私立", "財團法人", "學校財團法人"]:
        s = s.replace(token, "")
    s = s.replace("高級中等學校", "高中")
    s = s.replace("高級中學", "高中")
    s = s.replace("高級工業職業學校", "高工")
    s = s.replace("工業高級中等學校", "高工")
    s = s.replace("商業高級中等學校", "高商")
    s = s.replace("家事商業高級中等學校", "家商")
    if s.endswith("學校"):
        s = s[:-2]
    return s


def number_values(records, key):
    return [record.get(key) for record in records if isinstance(record.get(key), (int, float))]


def mean(values):
    return round(sum(values) / len(values), 1) if values else None


def recalc_school(school):
    all_records = []
    for dept in school["departments"]:
        records = dept.get("records", [])
        all_records.extend(records)
        points = number_values(records, "totalPoints")
        dept["avgTotalPoints"] = mean(points)
        dept["minTotalPoints"] = min(points) if points else None
        dept["maxTotalPoints"] = max(points) if points else None
        dept["records"] = sorted(records, key=lambda r: (r.get("year", ""), r.get("totalPoints") or -1), reverse=True)
    points = number_values(all_records, "totalPoints")
    school["recordCount"] = len(all_records)
    school["avgTotalPoints"] = mean(points)
    school["minTotalPoints"] = min(points) if points else None
    school["maxTotalPoints"] = max(points) if points else None
    school["departments"] = sorted(
        school["departments"],
        key=lambda d: (d.get("avgTotalPoints") if d.get("avgTotalPoints") is not None else -1, d.get("name", "")),
        reverse=True,
    )


def better_location(current, candidate):
    rank = {"exact": 3, "approximate": 2, "missing": 1, None: 0}
    if current.get("lat") is None or current.get("lng") is None:
        return True
    return rank.get(candidate.get("locationAccuracy"), 0) > rank.get(current.get("locationAccuracy"), 0)


def merge_group(group_key, schools):
    canonical_name = CANONICAL.get(group_key)
    if not canonical_name:
        canonical_name = sorted(
            (s["school"] for s in schools),
            key=lambda name: (
                name.endswith("學校"),
                "高級中等學校" not in name,
                "私立" not in name and any("私立" in s["school"] for s in schools),
                len(name) * -1,
            ),
        )[0]

    merged = {
        "school": canonical_name,
        "address": "",
        "sourceGroup": "main",
        "lat": None,
        "lng": None,
        "locationAccuracy": "missing",
        "avgTotalPoints": None,
        "minTotalPoints": None,
        "maxTotalPoints": None,
        "recordCount": 0,
        "departments": [],
    }
    departments = defaultdict(list)
    for school in schools:
        if not merged["address"] and school.get("address"):
            merged["address"] = school["address"]
        if better_location(merged, school):
            merged["lat"] = school.get("lat")
            merged["lng"] = school.get("lng")
            merged["locationAccuracy"] = school.get("locationAccuracy") or "missing"
        for dept in school.get("departments", []):
            for record in dept.get("records", []):
                record = dict(record)
                record["school"] = canonical_name
                record["address"] = merged["address"] or school.get("address", "")
                departments[dept.get("name", "")].append(record)

    merged["departments"] = [{"name": name, "records": records} for name, records in departments.items()]
    recalc_school(merged)
    return merged


def main():
    data = json.loads(DATA_FILE.read_text("utf-8"))
    groups = defaultdict(list)
    for school in data["schools"]:
        groups[norm(school["school"])].append(school)

    merged_schools = [merge_group(key, schools) for key, schools in groups.items()]
    merged_schools.sort(
        key=lambda school: (
            school.get("avgTotalPoints") if school.get("avgTotalPoints") is not None else -1,
            school.get("school", ""),
        ),
        reverse=True,
    )
    mapped = sum(1 for s in merged_schools if s.get("lat") is not None and s.get("lng") is not None)
    records = sum(s.get("recordCount", 0) for s in merged_schools)
    data["schools"] = merged_schools
    data["summary"] = {
        "schools": len(merged_schools),
        "mapped": mapped,
        "unmapped": len(merged_schools) - mapped,
        "records": records,
    }
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")

    duplicate_groups = {key: [s["school"] for s in schools] for key, schools in groups.items() if len(schools) > 1}
    print("merged_groups", len(duplicate_groups))
    for key, names in duplicate_groups.items():
        print(key, "=>", names, "->", CANONICAL.get(key, key))
    print(data["summary"])


if __name__ == "__main__":
    main()
