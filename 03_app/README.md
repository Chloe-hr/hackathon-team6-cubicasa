# 03 · The app

**Team 6 · Plan precedents: floor-plan similarity search**

**Public URL:** `https://hackathon-team6-cubicasa-app.pages.dev` is the first version, on Cloudflare Pages. This version runs on Cloudflare Workers; its address appears after the first `npm run deploy`.

**Log in:** the app asks for one team password. We give it to you in the course hand-in, **not** in this repository.

⚠️ The model server runs on Render's free plan and sleeps after 15 minutes without requests. The page starts waking it as soon as it opens. If it is still asleep when you search, the page says **"The model is waking up, about one minute"** and tries again by itself (up to 3 times, 10 s apart).

## What the app does

An architect chooses one of our three neural networks, then uploads a floor plan (PNG or JPEG). The app sends both to our model server on Render, which turns the plan into a code of 128 numbers and finds the five closest codes among the 5,000 homes of CubiCasa5K. The page shows your plan next to the five matches, each with its rooms. The room key above them isolates one room type on every room map and gives its share of the rooms in each plan. Clicking a plan number opens it larger.

Before a search, the page shows the collection itself: the 5,000 plans drawn on the map of the chosen network. Choosing another network moves them to where that network puts them.

Below the matches, **Look inside** shows what the network computed for your plan. Every number comes from the ONNX file the server runs, not from a drawing of a network:

| Figure | What it shows | Where the numbers come from |
|---|---|---|
| Where your plan lands among the 5,000 | The 5,000 plans on the UMAP map of this network's codes, as dots shaded by their distance to your plan or as the drawings themselves; your plan and its five matches marked. After a search the plans light up from the closest to the farthest, then the map zooms to your plan | `public/data/atlas.json`, the drawings in `public/data/plans_*.webp` and the 5,000 distances from `/explain_model` |
| How close the five are | Histogram of the 5,000 distances, the five matches and the median marked | The 5,000 distances from `/explain_model` |
| What each layer sees | Every layer in order: the four most active channels of each conv layer, the 128 numbers of the code, the output | The inner layers of the ONNX file, from `/explain_model` |

The map was computed once for the 5,000 plans, so an uploaded plan is placed at the middle of its five matches. In the Plans view each cell shows the plan closest to its centre, as in the atlas figure of the notebook, and paler drawings are farther from your plan. The atlases of v2 and v3 are the ones saved by the notebooks; v1 was never saved, so `scripts/make_atlas.py` computes it with the same UMAP settings (n_neighbors 30, min_dist 0.1, random_state 42).

| Network | ONNX file | What it compares |
|---|---|---|
| v1 · plain autoencoder | `floorplan_ae.onnx` | The plans exactly as drawn |
| v2 · cleaned lines | `floorplan_ae_v2.onnx` | The plans cleaned down to thin lines, so drawing style counts less |
| **v3 · rooms (recommended, default)** | `floorplan_ae_v3.onnx` | Trained to recognise rooms, so matches share the room layout |

Distances of different networks are not on the same scale and can't be compared.

## One model server for both

The app has no model of its own. The Worker calls the same server on Render as `02_model_server/call_api.ipynb`, with the same two-step Gradio API: `predict_model` for the five matches and `explain_model` for Look inside. Cloudflare keeps the page, the password, D1 and R2; Render keeps the model.

The two also share what they compute. As in class (deck 03, slide 28), the 128 numbers of every uploaded plan are saved in one D1 column as text, and the Worker compares them itself: under the matches, the page lists the earlier uploads closest to this one. The model server only knows the 5,000 plans of CubiCasa5K, so this list can only come from D1.

## Cloudflare services and why

| Service | What we use it for | Why |
|---|---|---|
| **Workers** | `worker/index.ts`: login check, calls to the model server, reading and writing D1 and R2 | The password and the model calls must run on the server, never in the browser |
| **Static assets** | The React page, built by Vite into `dist/client/`, the example plans and the map data in `data/` | Served by the same Worker; `/api/...` and `/data/...` go through the password check first |
| **D1** | Table `searches`: one row per search (date, file name, network, best match, distance, the five match ids, place on the atlas, the 128 numbers of the plan) | Small structured rows we list, sort and compare: a SQL table is the right fit for a catalog this small |
| **R2** | `uploads/<id>`: the uploaded plan · `results/<id>.json`: the answer of `/predict_model` · `explain/<id>.json`: the answer of `/explain_model` | Files and big answers don't belong in database rows; a past search reopens with everything while the model server sleeps |
| **Secret `APP_PASSWORD`** | The team password | Kept by Cloudflare, never in the code or on GitHub |

D1 and R2 are the same ones as in the first version, so the past searches are still there.

## Endpoints (`worker/index.ts`)

| Endpoint | What it does |
|---|---|
| `POST /api/login` | Checks the password, sets a cookie that holds a hash of it (HttpOnly, 7 days) |
| `POST /api/logout` | Deletes the cookie |
| `GET /api/session` | Answers 200 when logged in, 401 otherwise; the page uses it to show the login form |
| `GET /api/wake` | Pokes the model server so it starts waking up when the page opens |
| `POST /api/search` | Sends the plan and the chosen network (v1, v2 or v3) to the model server (`predict_model`), stores the plan and the answer in R2 and a row in D1, answers the page |
| `GET /api/searches/<id>/explain` | What the network computed for that search (`explain_model`); asked once, then read from R2 |
| `GET /api/searches/<id>/earlier` | The three earlier uploads closest to this one with the same network, compared in the Worker from the codes in D1 |
| `GET /api/history` | The 20 latest searches from D1 |
| `GET /api/searches/<id>` | One past search again, from D1 and R2 |
| `GET /api/images/<id>` | The uploaded plan, from R2 |

Every endpoint except login and logout needs the login cookie.

## Files

| File | What it is |
|---|---|
| `wrangler.jsonc` | The Worker, its D1 and R2 bindings and the model server address |
| `worker/index.ts` | The API |
| `src/App.tsx` | The page: login, search, saved searches |
| `src/components/Upload.tsx` | Network choice and upload |
| `src/components/Result.tsx` | Your plan and the five matches, the room key, the larger view |
| `src/components/LookInside.tsx` | The three figures: `Atlas.tsx`, `Distances.tsx`, `Layers.tsx` |
| `src/components/History.tsx` | Saved searches |
| `public/data/` | Map positions of the 5,000 plans for v1, v2 and v3 and their drawings at 64 px, made by `scripts/make_atlas.py` |
| `public/examples/` | Four plans of the collection to try; each should find itself first |
| `schema.sql` | The D1 table |

## Diagrams (`diagrams/`)

- `user_stories.md`: our two user stories
- `system.png`: the parts and who talks to whom
- `sequence_1_search.png`: user story 1, one search
- `sequence_2_history.png`: user story 2, past searches and reopening one

The `.mmd` files are the sources of the PNGs (Mermaid). The same diagrams are on our Miro board: <!-- TODO: Miro link -->

## Our diagrams compared with the app

<!-- TODO Team 6: after drawing your diagrams on Miro, ask your AI tool to compare them with the app and write 3 to 5 lines here, in your own words: what is different, and why. -->

## Run it on your computer

```bash
cd 03_app
npm install                                    # Vite, React and wrangler, pinned in package.json
cp .dev.vars.example .dev.vars                 # then write your own local password in .dev.vars
npm run db:local                               # creates the table in a local copy of D1
npm run db:embedding:local                     # only for a local table made before the codes were saved
npm run dev                                    # open http://localhost:5173
```

Look inside needs `/explain_model` on the model server. Until Render runs the latest `02_model_server`, start the server on your computer (`python app.py` in `02_model_server/`) and set `MODEL_URL=http://localhost:7860` in `.dev.vars`.

`npm run check` type-checks the page and the Worker.

## Put it online

```bash
npx wrangler login                             # once, in your browser
npm run db:remote                              # creates the table in the real D1 database
npm run db:migrate:remote                      # only for a table made before the network tabs: adds the column model
npm run db:embedding:remote                    # only for a table made before the codes were saved: adds the column embedding
npx wrangler secret put APP_PASSWORD           # type the team password when asked
npm run deploy                                 # builds the page and deploys the Worker
```

`.dev.vars` is in `.gitignore`: the password is **never** committed.
