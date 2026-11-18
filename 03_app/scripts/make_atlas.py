"""Writes the map data of the app into public/data/:

- atlas.json: the map position of each of the 5,000 plans for v1, v2 and v3. v2 and v3 are the atlases
  saved by the notebooks. v1 was never saved, so it is computed here with the same UMAP settings
  as the notebook (n_neighbors=30, min_dist=0.1, random_state=42).
- plans_0.webp ... plans_4.webp: every plan as a 64 px drawing, 1,024 per sheet in a 32 x 32 grid,
  in the same order as atlas.json, for the "Plans" view of the map.
- rooms_0.png ... rooms_4.png: the same plans as their room maps from the annotations, for the "Rooms" view;
  PNG with the exact room colours, so the room key can pick one colour out of them.

Run from 03_app/: python scripts/make_atlas.py
"""
import json
from pathlib import Path

import numpy as np
import umap
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL_APP = ROOT / "01_autoencoder" / "model_app"
OUT = Path(__file__).resolve().parents[1] / "public" / "data"
TILE, COLS, PER_SHEET = 64, 32, 1024

ids = json.loads((MODEL_APP / "collection_ids.json").read_text())

v1 = umap.UMAP(n_neighbors=30, min_dist=0.1, random_state=42).fit_transform(np.load(MODEL_APP / "collection_codes.npy"))
v1 = (v1 - v1.min(axis=0)) / (v1.max(axis=0) - v1.min(axis=0))
atlases = {"v1": v1, "v2": np.load(MODEL_APP / "atlas_v2_xy.npy"), "v3": np.load(MODEL_APP / "atlas_v3_xy.npy")}
for key, xy in atlases.items():
    assert xy.shape == (len(ids), 2) and xy.min() >= 0 and xy.max() <= 1, key

with np.load(ROOT / "02_model_server" / "collection_rooms_128.npz") as collection:
    rooms = collection["rooms"]
    has_rooms = collection["has_rooms"] if "has_rooms" in collection.files else rooms.any(axis=(1, 2))
colours = json.loads((ROOT / "02_model_server" / "floorplan_ae_v3_config.json").read_text())["room_colours"]
palette = [255, 255, 255] + [int(c[k:k + 2], 16) for c in colours[1:] for k in (1, 3, 5)]  # "white" is the background

out = {"ids": ids, "tile": TILE, "cols": COLS, "per_sheet": PER_SHEET,
       "has_rooms": "".join("1" if h else "0" for h in has_rooms),
       **{key: [round(float(v), 4) for v in xy.ravel()] for key, xy in atlases.items()}}
(OUT / "atlas.json").write_text(json.dumps(out, separators=(",", ":")))

# The plans as the server stores them (walls bright, 128 px), in the same order as the ids
plans_file = ROOT / "02_model_server" / "collection_plans_128.npz"
if not plans_file.exists():
    from huggingface_hub import hf_hub_download
    plans_file = hf_hub_download("iaac-maai/hackathon-team6-cubicasa-ae", "collection_plans_128.npz")
with np.load(plans_file) as collection:
    plans = collection["images"]
    assert collection["ids"].tolist() == ids, "plans and atlas are not in the same order"

for start in range(0, len(plans), PER_SHEET):
    chunk = plans[start:start + PER_SHEET]
    sheet = Image.new("L", (COLS * TILE, -(-len(chunk) // COLS) * TILE), 255)
    for i, plan in enumerate(chunk):
        drawing = Image.fromarray(255 - plan).resize((TILE, TILE), Image.Resampling.LANCZOS)  # dark lines on white
        sheet.paste(drawing, ((i % COLS) * TILE, (i // COLS) * TILE))
    sheet.save(OUT / f"plans_{start // PER_SHEET}.webp", quality=75)

    room_sheet = Image.new("P", sheet.size, 0)
    room_sheet.putpalette(palette)
    for i, room_map in enumerate(rooms[start:start + PER_SHEET]):
        tile = Image.fromarray(room_map.astype(np.uint8), "P").resize((TILE, TILE), Image.Resampling.NEAREST)  # no new colours
        room_sheet.paste(tile, ((i % COLS) * TILE, (i // COLS) * TILE))
    room_sheet.save(OUT / f"rooms_{start // PER_SHEET}.png", optimize=True)

print({key: xy.shape for key, xy in atlases.items()}, len(ids), sorted(p.name for p in OUT.iterdir()))
