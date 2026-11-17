"""Model server: floor-plan similarity search with a convolutional autoencoder (Gradio + ONNX Runtime).

Upload a floor plan and get back the five most similar plans out of the 5,000 homes of CubiCasa5K.
The page is for people, the API (`/predict`: a base64 image in, JSON out) is for programs, like the
Cloudflare app on Wednesday. Runs locally (`python app.py`) and on Render.

The model is version 2 of the ONNX file exported in 01_autoencoder (section 6): it was trained on cleaned
plans, so it compares the layout and not the drawing style. The ONNX file holds the architecture AND the
weights, so the server needs no PyTorch. The model, the codes of the 5,000 plans, their positions on the
atlas and the plans themselves are downloaded from Hugging Face when the server starts.
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
CONFIG = json.loads((HERE / "floorplan_ae_v2_config.json").read_text())
SIZE = CONFIG["image_size"]
TOP_K = 5


def model_file(name):
    #a copy in this folder wins (handy offline), otherwise the file comes from Hugging Face
    local = HERE / name
    return str(local) if local.exists() else hf_hub_download(HF_REPO, name)


session = ort.InferenceSession(model_file("floorplan_ae_v2.onnx"))
CODES = np.load(model_file("collection_codes_v2.npy"))            # (5000, 128): one code per plan
ATLAS = np.load(model_file("atlas_v2_xy.npy"))                     # (5000, 2): each plan's place on the atlas, 0-1
collection = np.load(model_file("collection_plans_128.npz"))
PLANS = collection["images"]                                     # (5000, 128, 128), walls bright, as drawn
IDS = collection["ids"].tolist()


def clean_plan(plan):
    # The SAME cleaning as in 01_autoencoder section 6: keep only the lines, the same way for every drawing
    image = Image.fromarray(plan)
    wide = image.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))   # fills, grey paper, dark borders
    lines = np.asarray(image, np.float32) - np.asarray(wide, np.float32)
    strong = lines[lines > 8]
    if strong.size < 20:
        return np.zeros_like(plan)
    return ((lines / np.percentile(strong, 90)) > 0.35).astype(np.uint8) * 255


def preprocess(image: Image.Image):
    # The SAME steps as in 01_autoencoder: greyscale, invert, pad to a square, 128 x 128, then clean
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


def search(image: Image.Image):
    x = preprocess(image)
    code, rebuilt = session.run(None, {"image": x})
    distances = np.linalg.norm(CODES - code[0], axis=1)
    nearest = np.argsort(distances)[:TOP_K]
    error = float(((rebuilt - x) ** 2).mean())
    return nearest, distances[nearest], error, x[0, 0], rebuilt[0, 0]


def png_base64(image: Image.Image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


# ---- For people: the web form ------------------------------------------------
def search_for_page(image):
    if image is None:
        raise gr.Error("Upload a floor plan first.")
    nearest, distances, error, cleaned, rebuilt = search(image)
    gallery = [(to_image(PLANS[i] / 255.0), f"plan {IDS[i].split('/')[-1]} · {d:.0f}") for i, d in zip(nearest, distances)]
    return gallery, to_image(cleaned), to_image(rebuilt), round(error, 4)


# ---- For programs: base64 image in, JSON out ---------------------------------
def predict(image_b64: str) -> dict:
    """Find the 5 most similar floor plans. Send a base64-encoded PNG or JPEG (a 'data:image/...;base64,' prefix is allowed)."""
    if "," in image_b64[:100]:
        image_b64 = image_b64.split(",", 1)[1]
    image = Image.open(io.BytesIO(base64.b64decode(image_b64)))
    nearest, distances, error, _, _ = search(image)
    return {
        "matches": [{"rank": rank, "id": IDS[i], "distance": round(float(d), 2),
                     "atlas_xy": [round(float(v), 4) for v in ATLAS[i]],
                     "image_png_base64": png_base64(to_image(PLANS[i] / 255.0))}
                    for rank, (i, d) in enumerate(zip(nearest, distances), start=1)],
        # where the uploaded plan lands on the atlas: the middle of its five neighbours
        "atlas_xy": [round(float(v), 4) for v in ATLAS[nearest].mean(axis=0)],
        "reconstruction_error": round(error, 5),
    }


with gr.Blocks(title="Floor-plan similarity search") as demo:
    gr.Markdown(
        "# Floor-plan similarity search\n"
        "Upload a floor plan and get the **five most similar plans** out of 5,000 real homes (CubiCasa5K). "
        "Every plan is first cleaned down to its lines, so the search follows the layout and not the drawing style. "
        "A convolutional autoencoder then turns it into a code of 128 numbers; similar plans have close codes. "
        "Smaller distance = more similar. Team 6, AI Methods I hackathon, IAAC 2026."
    )
    with gr.Row():
        with gr.Column(scale=1):
            image_in = gr.Image(type="pil", label="Your floor plan")
            button = gr.Button("Find similar plans", variant="primary")
            gr.Examples(sorted(str(p) for p in (HERE / "examples").glob("*.png")), inputs=image_in)
        with gr.Column(scale=2):
            gallery_out = gr.Gallery(label="The five most similar plans, most similar first (plan number · distance)",
                                     columns=5, height=260)
            with gr.Row():
                cleaned_out = gr.Image(label="Your plan, cleaned: what the model sees", height=256)
                rebuilt_out = gr.Image(label="How the model redraws it", height=256)
                error_out = gr.Number(label="Reconstruction error (lower = the model knows this kind of plan)")
    button.click(search_for_page, inputs=image_in, outputs=[gallery_out, cleaned_out, rebuilt_out, error_out],
                 api_visibility="private")
    gr.api(predict, api_name="predict")

if __name__ == "__main__":
    # Render tells the app which port to use in the PORT variable; locally it is 7860
    demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
