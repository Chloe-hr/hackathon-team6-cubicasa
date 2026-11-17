# Team 6: floor-plan similarity search

Chloe Hraibeh, Jeff El Khoury, Luca Obejdeanu
AI Methods I, hackathon, IAAC MaAI 2026/27 (16 to 20 November 2026)

**Model on Hugging Face:** https://huggingface.co/iaac-maai/hackathon-team6-cubicasa-ae

## The idea

An architect starting a housing project looks for precedents: plans that look like the one on their desk. Our app lets them upload a floor plan and gives back the five most similar plans out of 5,000 real homes (CubiCasa5K).

Behind it there's a convolutional autoencoder that squeezes every plan into a code of 128 numbers. Plans with a similar layout get codes that are close to each other, so finding similar plans means finding the closest codes.

![An atlas of the 5,000 plans](01_autoencoder/figures/12_plan_atlas_v2.png)

All 5,000 plans placed on a map by their codes. Tall, narrow plans end up at the top, wide ones at the bottom and small drawings on the right: the model found this order by itself, only by learning to redraw the plans. Bold drawings, grey fills and faint scans are mixed, because every plan is first cleaned down to its lines. Our first version grouped plans by how they're drawn as much as by their layout; cleaning them took the search from 69% to 86% and the faint plans from 28% to 77%. The details are in [`01_autoencoder/`](01_autoencoder/).

## Live parts

| Part | Link | Day |
|---|---|---|
| Model on Hugging Face | https://huggingface.co/iaac-maai/hackathon-team6-cubicasa-ae | Monday |
| Model server (Render) | https://hackathon-team6-cubicasa.onrender.com (sleeps after 15 minutes, wakes in about one) | Tuesday |
| App (Cloudflare Pages) | added on Wednesday | Wednesday |

## Repository

| Folder | What's in it |
|---|---|
| [`01_autoencoder/`](01_autoencoder/) | Monday: the data preparation, the notebook with three setups, the ONNX model, the model card and the slides. Tuesday: version 2 of the model, trained on cleaned plans (section 6 of the notebook) |
| [`02_model_server/`](02_model_server/) | Tuesday: the model server (Gradio and ONNX Runtime on Render), its API and a notebook that calls it |

## Dataset

[CubiCasa5K](https://zenodo.org/records/2613548): 5,000 floor-plan images, mostly of Finnish homes. Kalervo et al. (2019), SCIA. Licence CC BY-NC-SA 4.0: non-commercial use only, and what we publish from it keeps the same licence. The data isn't in this repository.

## AI usage

| | |
|---|---|
| Tools | Claude Code (agent) |
| Why | to get going fast on a dataset and a kind of model that were new for us, and for the first drafts of the texts |
| Where | Monday: the comparison of datasets, the data preparation, the notebook code (adapted from the class notebook), the plots, the texts, the model card and the slides. Tuesday: version 2 of the model (the cleaning of the plans and the style measures, built on Chloe's notebook), the server code (adapted from the class example `model_app/`), its README and `call_api.ipynb` |
| How | we went through several datasets of the course list with it (HVAC faults, weld radiographs, 3D printing, ResPlan) before choosing CubiCasa5K. We asked it to follow the class notebook and to train the three setups on the same split and seed. Then we ran the notebook again on our laptop and checked every number in the texts against the outputs. For the server we checked that each example plan finds itself first, at the same distance as in the notebook, so the server prepares the images the same way |

Lessons learned: in two separate first tries we trained with MSE, like in class, and most of the models only learned to draw a blank page. Only 6.5% of the pixels are lines, so a blank page is already 95% right and the error looked fine. You have to look at the reconstructions, and compare the error with a dumb baseline like the blank page, not only read the number.

## Licence

MIT for the code, see [LICENSE](LICENSE). The data, and the model trained on it, are CC BY-NC-SA 4.0.
