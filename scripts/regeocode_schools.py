import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


DATA_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/schools.json")
CACHE_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/address-geocode-cache.json")

TAICHUNG_BOUNDS = {
    "min_lat": 24.00,
    "max_lat": 24.38,
    "min_lng": 120.42,
    "max_lng": 121.02,
}

OVERRIDES = {
    "臺中第一高級中等學校": (24.1503069, 120.6865624),
    "臺中女子高級中等學校": (24.1361063, 120.6772305),
    "文華高級中等學校": (24.1703257, 120.6606254),
    "玉山高級中學": (24.2517210, 120.8424720),
    "私立明德高級中學": (24.1201528, 120.6829543),
    "中港高級中學": (24.2447691, 120.5429717),
}


def in_taichung(lat, lng):
    return (
        TAICHUNG_BOUNDS["min_lat"] <= lat <= TAICHUNG_BOUNDS["max_lat"]
        and TAICHUNG_BOUNDS["min_lng"] <= lng <= TAICHUNG_BOUNDS["max_lng"]
    )


def clean_address(address):
    if not address:
        return ""
    text = str(address).strip()
    if text.startswith("(") and ")" in text[:12]:
        text = text.split(")", 1)[1]
    return text.replace("台中市", "臺中市")


def query_nominatim(query):
    params = {
        "q": f"{query}, 臺中市, Taiwan",
        "format": "jsonv2",
        "limit": 5,
        "accept-language": "zh-TW",
        "viewbox": "120.42,24.38,121.02,24.00",
        "bounded": 1,
    }
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "dahua-school-address-geocoder/1.0"})
    with urllib.request.urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def candidates_for(school):
    name = school["school"]
    address = clean_address(school.get("address", ""))
    candidates = [
        f"{name} {address}",
        name,
        name.replace("私立", "臺中市私立"),
        name.replace("國立", "國立"),
    ]
    if "進修部" in name:
        candidates.append(name.replace("進修部", ""))
    if "高級中等學校" in name:
        candidates.append(name.replace("高級中等學校", "高級中學"))
    if "高級中學" in name:
        candidates.append(name.replace("高級中學", "高級中等學校"))
    return [item for i, item in enumerate(candidates) if item and item not in candidates[:i]]


def geocode(school, cache):
    if school["school"] in OVERRIDES:
        lat, lng = OVERRIDES[school["school"]]
        return {"lat": lat, "lng": lng, "accuracy": "exact", "source": "manual_address_verified"}
    key = f"{school['school']}|{school.get('address','')}"
    if key in cache:
        return cache[key]
    result = {"lat": None, "lng": None, "accuracy": "missing", "source": "not_found"}
    for candidate in candidates_for(school):
        try:
            data = query_nominatim(candidate)
        except Exception as exc:
            result = {"lat": None, "lng": None, "accuracy": "missing", "source": f"error:{exc}"}
            continue
        for item in data:
            lat = float(item["lat"])
            lng = float(item["lon"])
            if in_taichung(lat, lng):
                result = {
                    "lat": lat,
                    "lng": lng,
                    "accuracy": "exact",
                    "source": f"nominatim:{candidate}",
                    "display": item.get("display_name", ""),
                }
                cache[key] = result
                CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), "utf-8")
                time.sleep(1.0)
                return result
        time.sleep(1.0)
    cache[key] = result
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), "utf-8")
    return result


def main():
    data = json.loads(DATA_FILE.read_text("utf-8"))
    cache = json.loads(CACHE_FILE.read_text("utf-8")) if CACHE_FILE.exists() else {}
    missing = []
    for school in data["schools"]:
        result = geocode(school, cache)
        school["lat"] = result.get("lat")
        school["lng"] = result.get("lng")
        school["locationAccuracy"] = result.get("accuracy", "missing")
        school["geocodeSource"] = result.get("source", "")
        if school["lat"] is None or school["lng"] is None:
            missing.append(school["school"])
    mapped = sum(1 for school in data["schools"] if school.get("lat") is not None and school.get("lng") is not None)
    data["summary"]["mapped"] = mapped
    data["summary"]["unmapped"] = len(data["schools"]) - mapped
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    print(data["summary"])
    print("missing", len(missing))
    for name in missing:
        print(name)


if __name__ == "__main__":
    main()
