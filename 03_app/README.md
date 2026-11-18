# 03 · The app (Wednesday)

**Team 6 · Plan precedents: floor-plan similarity search**

**Public URL:** `https://hackathon-team6-cubicasa-app.pages.dev`

**Log in:** the app asks for one team password. We give it to you in the course hand-in, **not** in this repository.

⚠️ The model server runs on Render's free plan and sleeps after 15 minutes without requests. The page starts waking it as soon as it opens. If it is still asleep when you search, the page says **"The model is waking up, about one minute"** and tries again by itself (up to 3 times, 10 s apart).

## What the app does

An architect chooses one of our three neural networks, then uploads a floor plan (PNG or JPEG). The app sends both to our model server on Render, which turns the plan into a code of 128 numbers and finds the five closest codes among the 5,000 homes of CubiCasa5K. The page shows the uploaded plan, what the network sees in it, and the five most similar plans with their rooms. Clicking a match opens it large (plan and rooms side by side; arrow keys move between the five). Every search is saved with the network used: the page lists the past searches, and "Open" shows one again without calling the model.

| Tab | Network | What it compares |
|---|---|---|
| v1 · plain autoencoder | `floorplan_ae.onnx` | The plans exactly as drawn |
| v2 · cleaned lines | `floorplan_ae_v2.onnx` | The plans cleaned down to thin lines, so drawing style counts less |
| **v3 · rooms (recommended, default)** | `floorplan_ae_v3.onnx` | Trained to recognise rooms, so matches share the room layout |

Distances of different networks are not on the same scale and can't be compared.

## Cloudflare services and why

| Service | What we use it for | Why |
|---|---|---|
| **Pages** | Serves the page (`public/`) | Free static hosting with a public `*.pages.dev` URL |
| **Pages Functions** | The server code in `functions/`: login check, call to the model server, reading and writing D1 and R2 | The password and the model call must run on the server, never in the browser |
| **D1** | Table `searches`: one row per search (date, file name, network, best match, distance, the five match ids, place on the atlas) | Small structured rows we list and sort: a SQL table is the right fit |
| **R2** | `uploads/<id>`: the uploaded plan · `results/<id>.json`: the full answer of the model server (with the match images) | Files and big answers don't belong in database rows; R2 also lets us reopen a search without calling the model again |
| **Secret `APP_PASSWORD`** | The team password | Kept by Cloudflare, never in the code or on GitHub |

## Endpoints (`functions/`)

| Endpoint | What it does |
|---|---|
| `POST /api/login` | Checks the password, sets a cookie that holds a hash of it (HttpOnly, 7 days) |
| `POST /api/logout` | Deletes the cookie |
| `GET /api/wake` | Pokes the model server so it starts waking up when the page opens |
| `POST /api/search` | Sends the plan and the chosen network (v1, v2 or v3) to the model server (`predict_model`), stores the plan and the answer in R2 and a row in D1, answers the page |
| `GET /api/history` | The 20 latest searches from D1 |
| `GET /api/searches/<id>` | One past search again, from D1 and R2 |
| `GET /api/images/<id>` | The uploaded plan, from R2 |

`functions/_middleware.js` runs before every request: without the login cookie you only get the login page.

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
npm install                                    # installs wrangler (pinned in package.json)
cp .dev.vars.example .dev.vars                 # then write your own local password in .dev.vars
npm run db:local                               # creates the table in a local copy of D1
npm run dev                                    # open http://localhost:8788
```

## Put it online

```bash
npx wrangler login                             # once, in your browser
npm run db:remote                              # creates the table in the real D1 database
npm run db:migrate:remote                      # only for a table made before the network tabs: adds the column model
npx wrangler pages deploy                      # first time: creates the Pages project hackathon-team6-cubicasa-app
npx wrangler pages secret put APP_PASSWORD     # type the team password when asked, then deploy once more
npx wrangler pages deploy
```

`.dev.vars` is in `.gitignore`: the password is **never** committed.
