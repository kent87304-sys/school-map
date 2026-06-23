import json
from pathlib import Path


DATA_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/schools.json")
CACHE_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/address-geocode-cache.json")

OVERRIDES = {
    "臺中第一高級中等學校": (24.1503069, 120.6865624),
    "臺中女子高級中等學校": (24.1361063, 120.6772305),
    "文華高級中等學校": (24.1703257, 120.6606254),
    "玉山高級中學": (24.2517210, 120.8424720),
    "私立明德高級中學": (24.1201528, 120.6829543),
    "中港高級中學": (24.2447691, 120.5429717),
}


def main():
    data = json.loads(DATA_FILE.read_text("utf-8"))
    cache = json.loads(CACHE_FILE.read_text("utf-8")) if CACHE_FILE.exists() else {}
    for school in data["schools"]:
        if school["school"] in OVERRIDES:
            school["lat"], school["lng"] = OVERRIDES[school["school"]]
            school["locationAccuracy"] = "exact"
            school["geocodeSource"] = "manual_address_verified"
            continue
        key = f"{school['school']}|{school.get('address','')}"
        cached = cache.get(key)
        if cached and cached.get("lat") is not None and cached.get("lng") is not None:
            school["lat"] = cached["lat"]
            school["lng"] = cached["lng"]
            school["locationAccuracy"] = "exact"
            school["geocodeSource"] = cached.get("source", "cached")
        else:
            school["lat"] = None
            school["lng"] = None
            school["locationAccuracy"] = "missing"
            school["geocodeSource"] = "address_not_geocoded"
    mapped = sum(1 for school in data["schools"] if school.get("lat") is not None and school.get("lng") is not None)
    data["summary"]["mapped"] = mapped
    data["summary"]["unmapped"] = len(data["schools"]) - mapped
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    print(data["summary"])
    for school in data["schools"]:
        if school.get("lat") is None:
            print("missing", school["school"], school.get("address"))


if __name__ == "__main__":
    main()
