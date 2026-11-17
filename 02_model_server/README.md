# 02: the model server (Tuesday)

Team 6, floor-plan similarity search

**Public URL:** https://hackathon-team6-cubicasa.onrender.com

⚠️ The server runs on Render's free plan, so it **falls asleep after 15 minutes without requests**. The first request after a pause wakes it up and takes about one minute. After that it answers in about a second.

## What it does

You upload a floor plan and get back the **five plans with the most similar layout** out of the 5,000 homes of CubiCasa5K, and the rooms the model sees in your plan. The server runs version 3 of our model, trained in [`01_autoencoder/notebook/internal_layout_v3.ipynb`](../01_autoencoder/notebook/internal_layout_v3.ipynb), section 8:
1. it cleans the plan down to its lines, so a faint scan and a bold drawing look the same;
2. the encoder turns the cleaned plan into a code of 128 numbers. It was trained together with a decoder that draws the room types and the walls, so the code holds the layout;
3. it looks for the five closest codes among the codes of the 5,000 plans;
4. the decoder draws the rooms it sees in your plan.

It has two doors:
- a **page for people** at the URL above: upload a plan or click an example, then "Find similar plans". The page shows the five plans as drawn and as room maps, your plan cleaned, and the rooms the model sees in it;
- an **API for programs** at `/predict`, which the Cloudflare app will use on Wednesday.

## Input and output of the API

| | |
|---|---|
| **Input** | one floor-plan image, PNG or JPEG, as a base64 text. A `data:image/png;base64,` prefix is allowed |
| **Preprocessing** | the same as in training: greyscale, inverted so the walls are bright, padded to a square, 128 x 128 px; then cleaned: only the lines thinner than 5 px are kept, scaled by the plan's own lines and cut into black and white |
| **Output** | a JSON dictionary, see below |

```json
{
  "matches": [
    {"rank": 1, "id": "high_quality_architectural/1191", "distance": 18.04, "atlas_xy": [0.25, 0.36],
     "image_png_base64": "iVBORw0KGgo...", "rooms_png_base64": "iVBORw0KGgo..."},
    {"rank": 2, "id": "high_quality_architectural/9620", "distance": 106.43, "atlas_xy": [0.24, 0.35],
     "image_png_base64": "iVBORw0KGgo...", "rooms_png_base64": "iVBORw0KGgo..."},
    ...
  ],
  "atlas_xy": [0.2469, 0.3552],
  "rooms_png_base64": "iVBORw0KGgo...",
  "room_colours": {"Bedroom": "#4477aa", "Bath": "#66ccee", "Sauna": "#228833", ...}
}
```

| Field | Meaning |
|---|---|
| `matches` | the five closest plans, the most similar first |
| `id` | the plan's folder in CubiCasa5K |
| `distance` | the distance between the two codes. Smaller = more similar. Our examples come from the collection, so each one finds itself first, at a much smaller distance than the others. Between two different plans it is usually 90 or more |
| `image_png_base64` | the matched plan as drawn, as a 128 x 128 PNG with dark lines on white |
| `matches[].rooms_png_base64` | the matched plan's true rooms, from the annotations of CubiCasa5K, as a 128 x 128 PNG with one colour per room type |
| `matches[].atlas_xy` | where that plan sits on the atlas of the 5,000 plans; x and y go from 0 to 1 |
| `atlas_xy` | where the uploaded plan lands on the atlas: the middle of its five matches. The app uses it to show the plan on the map |
| `rooms_png_base64` | the rooms the model sees in the uploaded plan, in the same colours |
| `room_colours` | the colour of each room type |

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

[`call_api.ipynb`](call_api.ipynb) does both calls on the online server and shows the five plans it gets back, as drawn and as rooms.

## The model behind it

| | |
|---|---|
| **Type** | encoder of setup C: 4 strided convolutions from 128 to 8 px and a code of 128 numbers. The decoder draws 11 room classes, the background and 10 room types, and the walls |
| **Trained on** | CubiCasa5K, the 4,194 training plans of the official split that have usable annotations: the cleaned drawing as input, the room map and the walls from `model.svg` as the target. 20 epochs, cross-entropy for the rooms and binary cross-entropy for the walls |
| **Use** | similarity search by layout: the five smallest distances between codes |
| **Test result** | for the 373 test plans with annotations, 34% of the five matches have the same number of bedrooms and 39% the same number of bathrooms. Version 2 gets 28% and 36%, random plans 21% and 29% |
| **Rooms** | the predicted plan area overlaps the true one by 68%. It finds the living room and the bedrooms better than the small rooms: bathrooms and kitchens are mostly missed |
| **Format** | ONNX with two outputs, the code and the 12 channels of the decoder, run with ONNX Runtime: no PyTorch on the server |
| **Model card** | https://huggingface.co/iaac-maai/hackathon-team6-cubicasa-ae |

These files are on Hugging Face, not on GitHub, and the server downloads them when it starts:
- the model, `floorplan_ae_v3.onnx`;
- the codes of the 5,000 plans, `collection_codes_v3.npy`;
- their positions on the atlas, `atlas_v3_xy.npy`;
- the plans themselves at 128 px, `collection_plans_128.npz`;
- their room maps, `collection_rooms_128.npz`.

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

`render.yaml` is a Render Blueprint. On [render.com](https://render.com): **New → Blueprint**, pick this repository and set the Blueprint path to `02_model_server/render.yaml`. It creates a free Python web service in Frankfurt that installs `requirements.txt` and starts `python app.py` from the `02_model_server` folder (`rootDir`). Python is pinned to 3.12 by `.python-version`. Every push to `main` deploys again.

## Files

| File | Contents |
|---|---|
| `app.py` | the preprocessing, the cleaning, the search, the room map, the page and the API |
| `floorplan_ae_v3_config.json` | image size, preprocessing, room classes and colours, and the test results of the model |
| `examples/` | four test plans from the collection |
| `requirements.txt`, `.python-version`, `render.yaml` | what Render needs to build and start the server |
| `call_api.ipynb` | calls the online API and prints the result |

## Limitations

- The model sees the plan at 128 px: thin walls, doors, fixtures and room names blur away, so it reads the big rooms better than the bathrooms and kitchens.
- The matches are better than with version 2 but far from perfect: Chloe's search on the true annotations finds the same number of bedrooms in 78% of the cases, the model in 34%.
- About a quarter of the room pixels in CubiCasa5K are labelled "Other", so some room maps say little about the plan.
- It isn't rotation-invariant: a plan turned by 90 degrees finds other plans.
- The data is CC BY-NC-SA 4.0, so non-commercial use only.
