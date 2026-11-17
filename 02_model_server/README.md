# 02: the model server (Tuesday)

Team 6, floor-plan similarity search

**Public URL:** https://hackathon-team6-cubicasa.onrender.com

⚠️ The server runs on Render's free plan, so it **falls asleep after 15 minutes without requests**. The first request after a pause wakes it up and takes about one minute. After that it answers in under a second.

## What it does

You upload a floor plan and get back the **five most similar plans** out of the 5,000 homes of CubiCasa5K. The server runs version 2 of our autoencoder ([`01_autoencoder/`](../01_autoencoder/), section 6 of the notebook):
1. it cleans the plan down to its lines, so a faint scan and a bold drawing look the same;
2. it turns the cleaned plan into a code of 128 numbers;
3. it looks for the five closest codes among the codes of the 5,000 plans.

It has two doors:
- a **page for people** at the URL above: upload a plan or click an example, then "Find similar plans". The page also shows the cleaned plan, which is what the model sees, and how the model redraws it;
- an **API for programs** at `/predict`, which the Cloudflare app will use on Wednesday.

## Input and output of the API

| | |
|---|---|
| **Input** | one floor-plan image (PNG or JPEG) as a base64 text. A `data:image/png;base64,` prefix is allowed |
| **Preprocessing** (on the server, the same as in training) | greyscale, inverted (walls bright), padded to a square, 128 x 128 px; then cleaned: only the lines thinner than 5 px are kept, scaled by the plan's own lines and cut into black and white |
| **Output** | a JSON dictionary, see below |

```json
{
  "matches": [
    {"rank": 1, "id": "high_quality_architectural/1191", "distance": 14.18, "atlas_xy": [0.4143, 0.259], "image_png_base64": "iVBORw0KGgo..."},
    {"rank": 2, "id": "high_quality_architectural/9620", "distance": 93.23, "atlas_xy": [0.404, 0.273], "image_png_base64": "iVBORw0KGgo..."},
    ...
  ],
  "atlas_xy": [0.4605, 0.234],
  "reconstruction_error": 0.09326
}
```

| Field | Meaning |
|---|---|
| `matches` | the five closest plans, the most similar first |
| `id` | the plan's folder in CubiCasa5K |
| `distance` | the distance between the two codes. Smaller = more similar. Our examples come from the collection, so each one finds itself first, at a distance much smaller than the others (about 0 to 15). Between two different plans it is usually 80 or more |
| `image_png_base64` | the matched plan as drawn, as a 128 x 128 PNG (dark lines on white), ready to show in a page |
| `atlas_xy` (of a match) | where that plan sits on the atlas of the 5,000 plans (x and y between 0 and 1) |
| `atlas_xy` | where the uploaded plan lands on the atlas: the middle of its five matches. The app uses it to show the plan on the map |
| `reconstruction_error` | how well the model redraws the cleaned plan (mean squared error). A high value means the model has not seen many plans like this one, so trust the matches less |

## Call it from a program

Every example below works from any computer. If the server is asleep, the first call waits about a minute.

**Python with `gradio_client`** (`pip install gradio_client`):

```python
import base64
from gradio_client import Client

client = Client("https://hackathon-team6-cubicasa.onrender.com")
image_b64 = base64.b64encode(open("examples/plan_high_quality_architectural_1191.png", "rb").read()).decode()
result = client.predict(image_b64, api_name="/predict")
for match in result["matches"]:
    print(match["rank"], match["id"], match["distance"])
```

**Plain HTTP**, in two steps, which is what the Cloudflare app does:
1. `POST /gradio_api/call/predict` with `{"data": ["<base64 image>"]}` returns an `event_id`;
2. `GET /gradio_api/call/predict/<event_id>` returns the result, on the line after `event: complete`.

```python
import base64, json, requests

url = "https://hackathon-team6-cubicasa.onrender.com"
image_b64 = base64.b64encode(open("examples/plan_high_quality_architectural_1191.png", "rb").read()).decode()
event_id = requests.post(f"{url}/gradio_api/call/predict", json={"data": [image_b64]}, timeout=120).json()["event_id"]
answer = requests.get(f"{url}/gradio_api/call/predict/{event_id}", timeout=120).text
result = json.loads(answer.split("event: complete\ndata: ", 1)[1].splitlines()[0])[0]
print([(m["id"], m["distance"]) for m in result["matches"]])
```

[`call_api.ipynb`](call_api.ipynb) does both calls on the online server and shows the five plans it gets back.

## The model behind it

| | |
|---|---|
| **Type** | convolutional autoencoder: 4 strided convolutions (128 → 8 px) → code of 128 numbers → 4 transposed convolutions back to 128 px |
| **Trained on** | CubiCasa5K, the 4,200 training plans (official split), cleaned down to their lines; 20 epochs, binary cross-entropy |
| **Use** | similarity search: the codes of similar layouts are close, so the search is the five smallest distances between codes |
| **Test result** | a copy of a test plan, shifted by 3 px, with light noise and then cleaned, finds its own original first in 86% of the cases. Monday's version 1, trained on the plans as drawn, got 69% (raw pixels 4%, PCA 25%) |
| **Why version 2** | version 1 grouped plans by how they're drawn (bold, faint, grey fills) as much as by their layout. The cleaning takes most of the style away: the faint plans are now found in 77% of the cases instead of 28% |
| **Format** | ONNX with two outputs, the code and the reconstruction, run with ONNX Runtime: no PyTorch on the server |
| **Model card** | https://huggingface.co/iaac-maai/hackathon-team6-cubicasa-ae |

These files are on Hugging Face, not on GitHub, and the server downloads them when it starts:
- the model, `floorplan_ae_v2.onnx`;
- the codes of the 5,000 plans, `collection_codes_v2.npy`;
- their positions on the atlas, `atlas_v2_xy.npy`;
- the plans themselves at 128 px, `collection_plans_128.npz`.

If a copy of a file is in this folder, the server uses the copy instead, which is handy offline.

## Run it on your computer

```bash
cd 02_model_server
python3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                    # then open http://127.0.0.1:7860
```

## Put it online (Render, free)

`render.yaml` is a Render Blueprint. On [render.com](https://render.com): **New → Blueprint**, pick this repository and set the Blueprint path to `02_model_server/render.yaml`. It creates a free Python web service in Frankfurt that installs `requirements.txt` and starts `python app.py` from the `02_model_server` folder (`rootDir`). Python is pinned to 3.12 by `.python-version`.

## Files

| File | Contents |
|---|---|
| `app.py` | the preprocessing, the cleaning, the search, the page and the API |
| `floorplan_ae_v2_config.json` | image size, preprocessing and cleaning steps, and the test result of the model |
| `examples/` | four test plans from the collection |
| `requirements.txt`, `.python-version`, `render.yaml` | what Render needs to build and start the server |
| `call_api.ipynb` | calls the online API and prints the result |

## Limitations

- The model compares the overall shape at 128 px: thin walls, doors, furniture and text blur away.
- The drawing style still counts a little: line thickness and the size of the drawing on the page stay after the cleaning. Walls thicker than about 5 px partly disappear, so the boldest plans are found less often than in version 1 (81% against 98%).
- Similar lines aren't a similar use: two plans can look alike and have very different rooms.
- It isn't rotation-invariant: a plan turned by 90 degrees finds other plans.
- The data is CC BY-NC-SA 4.0, so non-commercial use only.
