import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


DATA_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/schools.json")
CACHE_FILE = Path("/Volumes/盛田協作/Ryuk/國三落點分析/school-map/data/arcgis-address-cache.json")

OVERRIDES = {
    "私立弘文高級中學": {
        "lat": 24.2262912,
        "lng": 120.7045137,
        "score": 100,
        "matchedAddress": "弘文高中",
    },
}


def clean_address(address):
    if not address:
        return ""
    text = str(address).strip()
    if text.startswith("(") and ")" in text[:12]:
        text = text.split(")", 1)[1]
    return text.replace("臺中市", "台中市").replace("台中市", "台中市").strip()


def in_taichung(lat, lng):
    return 24.0 <= lat <= 24.4 and 120.4 <= lng <= 121.05


def geocode(address, cache):
    address = clean_address(address)
    if not address:
        return None
    if address in cache:
        return cache[address]
    params = {
        "SingleLine": address,
        "f": "json",
        "maxLocations": 3,
        "outFields": "*",
        "sourceCountry": "TWN",
    }
    url = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?" + urllib.parse.urlencode(params)
    try:
        data = json.loads(urllib.request.urlopen(url, timeout=15).read().decode("utf-8"))
    except Exception as exc:
        cache[address] = {"lat": None, "lng": None, "score": 0, "error": str(exc)}
        return cache[address]

    best = None
    for candidate in data.get("candidates", []):
        loc = candidate.get("location") or {}
        lng = loc.get("x")
        lat = loc.get("y")
        score = candidate.get("score", 0)
        if lat is None or lng is None:
            continue
        if score >= 80 and in_taichung(lat, lng):
            best = {
                "lat": lat,
                "lng": lng,
                "score": score,
                "matchedAddress": candidate.get("address", ""),
            }
            break
    cache[address] = best or {"lat": None, "lng": None, "score": 0, "error": "not_found"}
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), "utf-8")
    time.sleep(0.2)
    return cache[address]


def main():
    data = json.loads(DATA_FILE.read_text("utf-8"))
    cache = json.loads(CACHE_FILE.read_text("utf-8")) if CACHE_FILE.exists() else {}
    missing = []
    for school in data["schools"]:
        result = OVERRIDES.get(school["school"]) or geocode(school.get("address", ""), cache)
        if result and result.get("lat") is not None:
            school["lat"] = result["lat"]
            school["lng"] = result["lng"]
            school["locationAccuracy"] = "exact"
            school["geocodeSource"] = f"arcgis_address:{result.get('score')}:{result.get('matchedAddress','')}"
        else:
            school["lat"] = None
            school["lng"] = None
            school["locationAccuracy"] = "missing"
            school["geocodeSource"] = "address_not_geocoded"
            missing.append((school["school"], school.get("address", "")))
    mapped = sum(1 for school in data["schools"] if school.get("lat") is not None and school.get("lng") is not None)
    data["summary"]["mapped"] = mapped
    data["summary"]["unmapped"] = len(data["schools"]) - mapped
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    print(data["summary"])
    print("missing", len(missing))
    for item in missing:
        print(item)


if __name__ == "__main__":
    main()
