"""Writes the map data of the app into public/data/:

- atlas.json: the map position of each of the 5,000 plans for v1, v2 and v3. v2 and v3 are the atlases
  saved by the notebooks. v1 was never saved, so it is computed here with the same UMAP settings
  as the notebook (n_neighbors=30, min_dist=0.1, random_state=42).
- plans_0.webp ... plans_4.webp: every plan as a 64 px drawing, 1,024 per sheet in a 32 x 32 grid,
  in the same order as atlas.json, for the "Plans" view of the map.

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

out = {"ids": ids, "tile": TILE, "cols": COLS, "per_sheet": PER_SHEET,
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

print({key: xy.shape for key, xy in atlases.items()}, len(ids), sorted(p.name for p in OUT.iterdir()))
