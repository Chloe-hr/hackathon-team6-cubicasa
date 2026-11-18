# Team 6 floor-plan similarity server

The Gradio server uses ONNX Runtime to embed an uploaded floor plan and return the five closest gallery embeddings by Euclidean distance. It displays the decoder’s query room prediction and gallery annotations when available.

## Run the aligned v4 bundle locally

From the repository root, using PowerShell and the project environment:

```powershell
python -m pip install -r 02_model_server/requirements.txt
$env:LAYOUT_BUNDLE_DIR = (Resolve-Path '01_autoencoder/data/layout_aligned_v4/bundle').Path
python 02_model_server/app.py
```

Generate the bundle first by following the [aligned model workflow](../01_autoencoder/README.md#aligned-layout-model-v4). The server needs `config.json`, `model.onnx` and `collection.npz` from the same export. Run `call_api.ipynb` with the same bundle path to validate the responses. The local URL defaults to `http://127.0.0.1:7860`.

## API

Both endpoints accept a base64 PNG or JPEG, optionally with a data URI prefix. Both return the active model_version. Compare only embeddings from the same encoder release.

| Endpoint | Response |
| --- | --- |
| `/embed` | `code` is a list of 128 numbers and `size` is 128. |
| `/predict` | `matches` contains five ranked entries. Query `atlas_xy` is their mean position; query `rooms_png_base64` is a prediction. `room_colours` maps room labels to colours. |

Each match contains `rank`, `id`, `distance`, `atlas_xy` and `image_png_base64`. `has_rooms` records whether the gallery annotation is available. `rooms_png_base64` contains the annotated gallery map or JSON null.

Use `gradio_client.Client(url).predict(image_b64, api_name="/predict")` or `api_name="/embed"`. For plain HTTP, post `{"data": ["<base64 image>"]}` to `/gradio_api/call/predict` or `/gradio_api/call/embed`, then fetch the same endpoint with `/<event_id>` appended. The completed event contains the result.

## Render configuration

The default startup still uses the v3 artifacts when `LAYOUT_BUNDLE_DIR` is unset. An approved v4 rollout requires placing the complete bundle on the host and setting that variable to its location. The Render blueprint continues to use `python app.py`. The public demo uses the existing v3 release. [Render demo](https://hackathon-team6-cubicasa.onrender.com).
