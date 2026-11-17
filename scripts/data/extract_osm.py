"""Extract hiking data from an OpenStreetMap extract (.osm.pbf) into newline-delimited JSON.

Run on the output of:
  osmium tags-filter norway-latest.osm.pbf r/route=hiking,foot w/highway=path w/sac_scale \
      n/natural=peak -o filtered.osm.pbf

Writes data-build/osm.ndjson with one object per line:
  {"kind": "route",  "id": <relation id>, "name", "tags", "lines": [[[lon, lat], ...], ...]}
  {"kind": "trail",  "id": <way id>,      "name", "tags", "lines": [[[lon, lat], ...]]}
  {"kind": "summit", "id": <node id>,     "name", "tags", "lon", "lat"}

Data © OpenStreetMap contributors, ODbL.
"""
import json
import os
import sys

import osmium

KEEP_TAGS = (
    "name", "name:nb", "name:nn", "name:no", "description", "description:nb", "description:no",
    "website", "url", "contact:website", "distance", "duration", "sac_scale", "operator",
    "network", "ref", "ele", "image", "route", "highway", "wikipedia", "wikidata",
)


def pick(tags):
    return {k: tags[k] for k in KEEP_TAGS if k in tags}


def name_of(tags):
    for key in ("name", "name:nb", "name:nn", "name:no"):
        value = tags.get(key)
        if value:
            return value
    return None


class Handler(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.out = out
        self.ways = {}  # way id -> coordinates, for assembling route relations
        self.counts = {"route": 0, "trail": 0, "summit": 0}

    def write(self, obj):
        self.out.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
        self.counts[obj["kind"]] += 1

    def node(self, n):
        if n.tags.get("natural") != "peak" or not n.location.valid():
            return
        name = name_of(n.tags)
        if not name:
            return
        self.write({"kind": "summit", "id": n.id, "name": name, "tags": pick(n.tags),
                    "lon": round(n.location.lon, 6), "lat": round(n.location.lat, 6)})

    def way(self, w):
        coords = [[round(nd.lon, 6), round(nd.lat, 6)] for nd in w.nodes if nd.location.valid()]
        if len(coords) < 2:
            return
        self.ways[w.id] = coords
        name = name_of(w.tags)
        if name and (w.tags.get("highway") == "path" or "sac_scale" in w.tags):
            self.write({"kind": "trail", "id": w.id, "name": name, "tags": pick(w.tags), "lines": [coords]})

    def relation(self, r):
        if r.tags.get("type") != "route" or r.tags.get("route") not in ("hiking", "foot"):
            return
        name = name_of(r.tags)
        if not name:
            return
        lines = [self.ways[m.ref] for m in r.members if m.type == "w" and m.ref in self.ways]
        if not lines:
            return
        self.write({"kind": "route", "id": r.id, "name": name, "tags": pick(r.tags), "lines": lines})


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "data-build/filtered.osm.pbf"
    os.makedirs("data-build", exist_ok=True)
    with open("data-build/osm.ndjson", "w", encoding="utf-8") as out:
        handler = Handler(out)
        # Nodes, ways and relations are read in that order, so way geometry is
        # available when relations are processed.
        handler.apply_file(src, locations=True, idx="flex_mem")
    print("OSM:", handler.counts)
    if sum(handler.counts.values()) == 0:
        raise SystemExit("No OSM data extracted")


if __name__ == "__main__":
    main()
