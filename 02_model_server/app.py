"""Floor-plan similarity search using a matching ONNX model and gallery."""
import base64
import io
import json
import os
from pathlib import Path

import gradio as gr
import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image

from preprocessing import clean_plan, drawing_array, preprocess

HERE = Path(__file__).parent
HF_REPO = "iaac-maai/hackathon-team6-cubicasa-ae"
TOP_K = 5
BUNDLE_DIR = os.environ.get("LAYOUT_BUNDLE_DIR")


def model_file(name):
    local = HERE / name
    return str(local) if local.exists() else hf_hub_download(HF_REPO, name)


if BUNDLE_DIR:
    bundle = Path(BUNDLE_DIR).resolve()
    CONFIG = json.loads((bundle / "config.json").read_text(encoding="utf-8"))
    if CONFIG["version"] != "layout_aligned_v4" or CONFIG["preprocessing"] != "cubic_lanczos_clean_v1":
        raise ValueError(f"Unsupported model bundle at {bundle}")
    graph = str(bundle / "model.onnx")
    with np.load(bundle / "collection.npz", allow_pickle=False) as collection:
        CODES, ATLAS, PLANS, ROOMS, HAS_ROOMS = (
            collection[key] for key in ("codes", "atlas", "images", "rooms", "has_rooms")
        )
        IDS = collection["ids"].tolist()
else:
    CONFIG = json.loads((HERE / "floorplan_ae_v3_config.json").read_text(encoding="utf-8"))
    graph = model_file("floorplan_ae_v3.onnx")
    CODES = np.load(model_file("collection_codes_v3.npy"))
    ATLAS = np.load(model_file("atlas_v3_xy.npy"))
    with np.load(model_file("collection_plans_128.npz")) as collection:
        PLANS, IDS = collection["images"], collection["ids"].tolist()
    with np.load(model_file("collection_rooms_128.npz")) as collection:
        ROOMS = collection["rooms"]
        HAS_ROOMS = collection["has_rooms"] if "has_rooms" in collection.files else ROOMS.any(axis=(1, 2))

MODEL_VERSION = CONFIG.get("version", "v3")
SIZE = CONFIG["image_size"]
CLASSES = CONFIG["room_classes"]
PALETTE = np.array([[int(c.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4)] if c.startswith("#") else [255, 255, 255]
                    for c in CONFIG["room_colours"]], dtype=np.uint8)
count = len(IDS)
if (
    count < TOP_K or len(set(IDS)) != count or
    CODES.shape != (count, CONFIG["latent_dim"]) or ATLAS.shape != (count, 2) or
    PLANS.shape != (count, SIZE, SIZE) or ROOMS.shape != PLANS.shape or
    HAS_ROOMS.shape != (count,) or HAS_ROOMS.dtype != np.bool_ or
    PLANS.dtype != np.uint8 or ROOMS.dtype != np.uint8 or
    len(PALETTE) != len(CLASSES) or ROOMS.max() >= len(CLASSES) or
    not np.isfinite(CODES).all() or not np.isfinite(ATLAS).all() or
    np.any((ATLAS < 0) | (ATLAS > 1))
):
    raise ValueError("Invalid gallery dimensions, order, or values")
session = ort.InferenceSession(graph, providers=["CPUExecutionProvider"])
code_probe, room_probe = session.run(["code", "rooms"], {"image": np.zeros((1, 1, SIZE, SIZE), np.float32)})
if code_probe.shape != (1, CODES.shape[1]) or room_probe.shape != (1, len(CLASSES) + 1, SIZE, SIZE):
    raise ValueError("ONNX output shapes disagree with the gallery configuration")


# ---- The other versions of the model, so the app can let the user choose -------
# Each version has its own ONNX file and its own codes of the 5,000 plans; the plans and room maps are shared.
# v1 was trained on the plans as drawn (no cleaning), v2 and v3 on the cleaned plans.
MODELS = {MODEL_VERSION: {"session": session, "codes": CODES, "atlas": ATLAS, "clean": True, "output": "rooms",
                          "label": "v3 · rooms" if MODEL_VERSION == "v3" else MODEL_VERSION}}
if not BUNDLE_DIR:
    for key, onnx_name, codes_name, atlas_name, clean, label in [
        ("v1", "floorplan_ae.onnx", "collection_codes.npy", None, False, "v1 · plain autoencoder"),
        ("v2", "floorplan_ae_v2.onnx", "collection_codes_v2.npy", "atlas_v2_xy.npy", True, "v2 · cleaned lines"),
    ]:
        extra_codes = np.load(model_file(codes_name))
        if extra_codes.shape != CODES.shape or not np.isfinite(extra_codes).all():
            raise ValueError(f"Invalid codes for {key}")
        MODELS[key] = {"session": ort.InferenceSession(model_file(onnx_name), providers=["CPUExecutionProvider"]),
                       "codes": extra_codes, "atlas": np.load(model_file(atlas_name)) if atlas_name else None,
                       "clean": clean, "output": "reconstruction", "label": label}


def to_image(array):
    # Walls bright (the model's view) -> dark lines on white, as a drawing is usually shown
    return Image.fromarray(255 - (np.clip(array, 0, 1) * 255).astype(np.uint8))


def rooms_image(room_map):
    # One colour per room type, the same colours as in the notebook
    return Image.fromarray(PALETTE[room_map])


def search(image: Image.Image):
    x = preprocess(image, SIZE)
    code, output = session.run(["code", "rooms"], {"image": x})
    distances = np.linalg.norm(CODES - code[0], axis=1)
    nearest = np.argsort(distances, kind="stable")[:TOP_K]
    predicted_rooms = output[0, :len(CLASSES)].argmax(axis=0)
    return nearest, distances[nearest], x[0, 0], predicted_rooms


def search_with(image: Image.Image, key: str):
    # Same search as above, with the version of the model the user chose
    model = MODELS[key]
    drawing = drawing_array(image, SIZE)
    plan = clean_plan(drawing) if model["clean"] else drawing
    x = (plan.astype(np.float32) / 255.0)[None, None]
    code, output = model["session"].run(None, {"image": x})
    distances = np.linalg.norm(model["codes"] - code[0], axis=1)
    nearest = np.argsort(distances, kind="stable")[:TOP_K]
    if model["output"] == "rooms":
        query_image = rooms_image(output[0, :len(CLASSES)].argmax(axis=0))   # the rooms the model sees
    else:
        query_image = to_image(output[0, 0])                                 # how the model redraws the plan
    return nearest, distances[nearest], query_image


def png_base64(image: Image.Image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


# ---- For people: the web form ------------------------------------------------
def search_for_page(image):
    if image is None:
        raise gr.Error("Upload a floor plan first.")
    nearest, distances, cleaned, predicted_rooms = search(image)
    drawings = [(to_image(PLANS[i] / 255.0), f"plan {IDS[i].split('/')[-1]} · {d:.0f}") for i, d in zip(nearest, distances)]
    room_maps = [(rooms_image(ROOMS[i]), f"plan {IDS[i].split('/')[-1]}") if HAS_ROOMS[i]
                 else (Image.new("RGB", (SIZE, SIZE), "white"), f"plan {IDS[i].split('/')[-1]}: annotation unavailable")
                 for i in nearest]
    return drawings, room_maps, to_image(cleaned), rooms_image(predicted_rooms)


# ---- For programs: base64 image in, JSON out ---------------------------------
def read_image(image_b64: str) -> Image.Image:
    if "," in image_b64[:100]:          # a 'data:image/...;base64,' prefix is allowed
        image_b64 = image_b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(image_b64)))


def embed(image_b64: str) -> dict:
    """Return the 128-number embedding of a floor plan. Send a base64-encoded PNG or JPEG."""
    code, = session.run(["code"], {"image": preprocess(read_image(image_b64), SIZE)})
    return {"model_version": MODEL_VERSION, "code": [round(float(v), 5) for v in code[0]],
            "size": int(code.shape[1])}


def predict(image_b64: str) -> dict:
    """Find the 5 floor plans with the most similar layout. Send a base64-encoded PNG or JPEG (a 'data:image/...;base64,' prefix is allowed)."""
    nearest, distances, _, predicted_rooms = search(read_image(image_b64))
    return {
        "model_version": MODEL_VERSION,
        "matches": [{"rank": rank, "id": IDS[i], "distance": round(float(d), 2),
                     "atlas_xy": [round(float(v), 4) for v in ATLAS[i]],
                     "image_png_base64": png_base64(to_image(PLANS[i] / 255.0)),
                     "has_rooms": bool(HAS_ROOMS[i]),
                     "rooms_png_base64": png_base64(rooms_image(ROOMS[i])) if HAS_ROOMS[i] else None}
                    for rank, (i, d) in enumerate(zip(nearest, distances), start=1)],
        # where the uploaded plan lands on the atlas: the middle of its five neighbours
        "atlas_xy": [round(float(v), 4) for v in ATLAS[nearest].mean(axis=0)],
        # the rooms the model sees in the uploaded plan
        "rooms_png_base64": png_base64(rooms_image(predicted_rooms)),
        "room_colours": {name: colour for name, colour in zip(CLASSES[1:], CONFIG["room_colours"][1:])},
    }


def predict_model(image_b64: str, model: str = "v3") -> dict:
    """Like /predict, but with the version of the model you choose: "v1" (plain autoencoder), "v2" (cleaned lines) or "v3" (rooms). Send a base64-encoded PNG or JPEG and the version."""
    if model not in MODELS:
        raise gr.Error(f"Unknown model {model!r}. Choose one of: {', '.join(sorted(MODELS))}.")
    nearest, distances, query_image = search_with(read_image(image_b64), model)
    atlas = MODELS[model]["atlas"]
    return {
        "model_version": model,
        "model_label": MODELS[model]["label"],
        "matches": [{"rank": rank, "id": IDS[i], "distance": round(float(d), 2),
                     "atlas_xy": [round(float(v), 4) for v in atlas[i]] if atlas is not None else None,
                     "image_png_base64": png_base64(to_image(PLANS[i] / 255.0)),
                     "has_rooms": bool(HAS_ROOMS[i]),
                     "rooms_png_base64": png_base64(rooms_image(ROOMS[i])) if HAS_ROOMS[i] else None}
                    for rank, (i, d) in enumerate(zip(nearest, distances), start=1)],
        "atlas_xy": [round(float(v), 4) for v in atlas[nearest].mean(axis=0)] if atlas is not None else None,
        # v3: the rooms the model sees in the uploaded plan; v1 and v2: how the model redraws it
        "query_kind": MODELS[model]["output"],
        "query_png_base64": png_base64(query_image),
        "rooms_png_base64": png_base64(query_image) if MODELS[model]["output"] == "rooms" else None,
        "room_colours": {name: colour for name, colour in zip(CLASSES[1:], CONFIG["room_colours"][1:])},
    }


legend = " ".join(f"<span style='background:{c};padding:1px 6px;margin-right:4px'>&nbsp;</span>{name}"
                  for name, c in zip(CLASSES[1:], CONFIG["room_colours"][1:]))

with gr.Blocks(title="Floor-plan similarity search") as demo:
    gr.Markdown(
        "# Floor-plan similarity search\n"
        f"Upload a floor plan to find its five closest embeddings among {count:,} CubiCasa5K plans. "
        "Results are ordered by embedding distance. Team 6, AI Methods I hackathon, IAAC 2026."
    )
    with gr.Row():
        with gr.Column(scale=1):
            image_in = gr.Image(type="pil", label="Your floor plan")
            button = gr.Button("Find similar plans", variant="primary")
            gr.Examples(sorted(str(p) for p in (HERE / "examples").glob("*.png")), inputs=image_in)
            with gr.Row():
                cleaned_out = gr.Image(label="Your plan, cleaned: what the model sees", height=220)
                rooms_out = gr.Image(label="Predicted query room map", height=220)
        with gr.Column(scale=2):
            drawings_out = gr.Gallery(label="The five most similar plans, most similar first (plan number · distance)",
                                      columns=5, height=230)
            rooms_gallery_out = gr.Gallery(label="Their rooms, from the annotations of CubiCasa5K", columns=5, height=230)
            gr.HTML(f"<div style='font-size:13px'>{legend}</div>")
    button.click(search_for_page, inputs=image_in, outputs=[drawings_out, rooms_gallery_out, cleaned_out, rooms_out],
                 api_visibility="private")
    gr.api(predict, api_name="predict")
    gr.api(embed, api_name="embed")
    gr.api(predict_model, api_name="predict_model")

if __name__ == "__main__":
    # Render tells the app which port to use in the PORT variable; locally it is 7860
    demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
