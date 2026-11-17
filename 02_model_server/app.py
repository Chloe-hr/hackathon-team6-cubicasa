"""Model server: floor-plan similarity search by layout (Gradio + ONNX Runtime).

Upload a floor plan and get back the five plans with the most similar layout out of the 5,000 homes of
CubiCasa5K, and the rooms the model sees in your plan. The page is for people, the API (`/predict`: a base64
image in, JSON out) is for programs, like the Cloudflare app on Wednesday. Runs locally (`python app.py`)
and on Render.

The model is v3, trained in 01_autoencoder/notebook/internal_layout_v3.ipynb (section 8): its encoder turns
the cleaned drawing into a code of 128 numbers, and its decoder draws the room types and the walls. So the
code holds the layout, not the pen. The ONNX file holds the architecture AND the weights, so the server needs
no PyTorch. The model, the codes of the 5,000 plans, their places on the atlas, the plans and their room maps
are downloaded from Hugging Face when the server starts.
"""
import base64
import io
import json
import os
from pathlib import Path

import gradio as gr
import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image, ImageFilter, ImageOps

HERE = Path(__file__).parent
HF_REPO = "iaac-maai/hackathon-team6-cubicasa-ae"
CONFIG = json.loads((HERE / "floorplan_ae_v3_config.json").read_text())
SIZE = CONFIG["image_size"]
CLASSES = CONFIG["room_classes"]                                   # background + 10 room types
PALETTE = np.array([[int(c.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4)] if c.startswith("#") else [255, 255, 255]
                    for c in CONFIG["room_colours"]], dtype=np.uint8)
TOP_K = 5


def model_file(name):
    #a copy in this folder wins (handy offline), otherwise the file comes from Hugging Face
    local = HERE / name
    return str(local) if local.exists() else hf_hub_download(HF_REPO, name)


session = ort.InferenceSession(model_file("floorplan_ae_v3.onnx"))
CODES = np.load(model_file("collection_codes_v3.npy"))            # (5000, 128): one code per plan
ATLAS = np.load(model_file("atlas_v3_xy.npy"))                     # (5000, 2): each plan's place on the atlas, 0-1
collection = np.load(model_file("collection_plans_128.npz"))
PLANS = collection["images"]                                     # (5000, 128, 128), walls bright, as drawn
IDS = collection["ids"].tolist()
ROOMS = np.load(model_file("collection_rooms_128.npz"))["rooms"]   # (5000, 128, 128), room class of each pixel


def clean_plan(plan):
    # The SAME cleaning as in training: keep only the lines, the same way for every drawing
    image = Image.fromarray(plan)
    wide = image.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))   # fills, grey paper, dark borders
    lines = np.asarray(image, np.float32) - np.asarray(wide, np.float32)
    strong = lines[lines > 8]
    if strong.size < 20:
        return np.zeros_like(plan)
    return ((lines / np.percentile(strong, 90)) > 0.35).astype(np.uint8) * 255


def preprocess(image: Image.Image):
    # The SAME steps as in training: greyscale, invert, pad to a square, 128 x 128, then clean
    inverted = ImageOps.invert(ImageOps.grayscale(image))
    side = max(inverted.size)
    square = Image.new("L", (side, side), 0)
    square.paste(inverted, ((side - inverted.width) // 2, (side - inverted.height) // 2))
    small = square.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    cleaned = clean_plan(np.asarray(small, dtype=np.uint8))
    return (cleaned.astype(np.float32) / 255.0)[None, None]           # shape (1, 1, 128, 128)


def to_image(array):
    # Walls bright (the model's view) -> dark lines on white, as a drawing is usually shown
    return Image.fromarray(255 - (np.clip(array, 0, 1) * 255).astype(np.uint8))


def rooms_image(room_map):
    # One colour per room type, the same colours as in the notebook
    return Image.fromarray(PALETTE[room_map])


def search(image: Image.Image):
    x = preprocess(image)
    code, output = session.run(None, {"image": x})
    distances = np.linalg.norm(CODES - code[0], axis=1)
    nearest = np.argsort(distances)[:TOP_K]
    predicted_rooms = output[0, :len(CLASSES)].argmax(axis=0)
    return nearest, distances[nearest], x[0, 0], predicted_rooms


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
    room_maps = [(rooms_image(ROOMS[i]), f"plan {IDS[i].split('/')[-1]}") for i in nearest]
    return drawings, room_maps, to_image(cleaned), rooms_image(predicted_rooms)


# ---- For programs: base64 image in, JSON out ---------------------------------
def predict(image_b64: str) -> dict:
    """Find the 5 floor plans with the most similar layout. Send a base64-encoded PNG or JPEG (a 'data:image/...;base64,' prefix is allowed)."""
    if "," in image_b64[:100]:
        image_b64 = image_b64.split(",", 1)[1]
    image = Image.open(io.BytesIO(base64.b64decode(image_b64)))
    nearest, distances, _, predicted_rooms = search(image)
    return {
        "matches": [{"rank": rank, "id": IDS[i], "distance": round(float(d), 2),
                     "atlas_xy": [round(float(v), 4) for v in ATLAS[i]],
                     "image_png_base64": png_base64(to_image(PLANS[i] / 255.0)),
                     "rooms_png_base64": png_base64(rooms_image(ROOMS[i]))}
                    for rank, (i, d) in enumerate(zip(nearest, distances), start=1)],
        # where the uploaded plan lands on the atlas: the middle of its five neighbours
        "atlas_xy": [round(float(v), 4) for v in ATLAS[nearest].mean(axis=0)],
        # the rooms the model sees in the uploaded plan
        "rooms_png_base64": png_base64(rooms_image(predicted_rooms)),
        "room_colours": {name: colour for name, colour in zip(CLASSES[1:], CONFIG["room_colours"][1:])},
    }


legend = " ".join(f"<span style='background:{c};padding:1px 6px;margin-right:4px'>&nbsp;</span>{name}"
                  for name, c in zip(CLASSES[1:], CONFIG["room_colours"][1:]))

with gr.Blocks(title="Floor-plan similarity search") as demo:
    gr.Markdown(
        "# Floor-plan similarity search\n"
        "Upload a floor plan and get the **five plans with the most similar layout** out of 5,000 real homes "
        "(CubiCasa5K). The plan is cleaned down to its lines, then an autoencoder turns it into a code of 128 numbers. "
        "The model was trained to draw the rooms from the lines, so plans with close codes have a similar layout. "
        "Smaller distance = more similar. Team 6, AI Methods I hackathon, IAAC 2026."
    )
    with gr.Row():
        with gr.Column(scale=1):
            image_in = gr.Image(type="pil", label="Your floor plan")
            button = gr.Button("Find similar plans", variant="primary")
            gr.Examples(sorted(str(p) for p in (HERE / "examples").glob("*.png")), inputs=image_in)
            with gr.Row():
                cleaned_out = gr.Image(label="Your plan, cleaned: what the model sees", height=220)
                rooms_out = gr.Image(label="The rooms the model sees in it", height=220)
        with gr.Column(scale=2):
            drawings_out = gr.Gallery(label="The five most similar plans, most similar first (plan number · distance)",
                                      columns=5, height=230)
            rooms_gallery_out = gr.Gallery(label="Their rooms, from the annotations of CubiCasa5K", columns=5, height=230)
            gr.HTML(f"<div style='font-size:13px'>{legend}</div>")
    button.click(search_for_page, inputs=image_in, outputs=[drawings_out, rooms_gallery_out, cleaned_out, rooms_out],
                 api_visibility="private")
    gr.api(predict, api_name="predict")

if __name__ == "__main__":
    # Render tells the app which port to use in the PORT variable; locally it is 7860
    demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
