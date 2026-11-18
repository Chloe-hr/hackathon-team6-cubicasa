import { useEffect, useRef, useState } from "react";
import { api, ApiError, untilAwake, type Atlas as AtlasData, type Earlier, type Explain, type Model, type SavedSearch, type SearchResult } from "./api";
import { Atlas } from "./components/Atlas";
import { History } from "./components/History";
import { Login } from "./components/Login";
import { LookInside } from "./components/LookInside";
import { Result } from "./components/Result";
import { Upload } from "./components/Upload";

type Status = { text: string; tone: "info" | "waking" | "error" } | null;
const WAKING = "The model is waking up, about one minute.";

export function App() {
  const [session, setSession] = useState<"checking" | "in" | "out">("checking");
  const [view, setView] = useState<"search" | "history">("search");
  const [model, setModel] = useState<Model>("v3");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [shown, setShown] = useState<{ result: SearchResult; uploadedUrl: string } | null>(null);
  const [explain, setExplain] = useState<Explain | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [atlas, setAtlas] = useState<AtlasData | null>(null);
  const [earlier, setEarlier] = useState<Earlier[] | null>(null);
  const [history, setHistory] = useState<SavedSearch[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [focusRoom, setFocusRoom] = useState<string | null>(null);
  const [hoverRank, setHoverRank] = useState<number | null>(null);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const current = useRef<string | null>(null);

  useEffect(() => {
    api("/api/session").then(() => setSession("in"), () => setSession("out"));
  }, []);

  useEffect(() => {
    if (session !== "in") return;
    fetch("/api/wake"); // a sleeping Render server starts waking while the user chooses a plan
    fetch("/data/atlas.json").then((r) => r.json()).then(setAtlas, () => setAtlas(null));
  }, [session]);

  useEffect(() => {
    if (session !== "in" || view !== "history") return;
    setHistory(null);
    setHistoryError(null);
    api<SavedSearch[]>("/api/history").then(setHistory, (err) => failed(err, setHistoryError));
  }, [session, view]);

  function failed(err: unknown, show: (text: string) => void) {
    if (err instanceof ApiError && err.status === 401) return setSession("out");
    show(err instanceof ApiError ? (err.waking ? `${WAKING} Please try again in a minute.` : err.message) : "Could not reach the app. Check your connection.");
  }

  async function loadExplain(id: string) {
    setExplain(null);
    setExplainError(null);
    setEarlier(null);
    try {
      const answer = await untilAwake(() => api<Explain>(`/api/searches/${id}/explain`), () => {}, 3);
      if (current.current !== id) return;
      setExplain(answer);
      // the explain call saved this plan's code in D1, so the worker can now compare it with earlier uploads
      const others = await api<Earlier[]>(`/api/searches/${id}/earlier`);
      if (current.current === id) setEarlier(others);
    } catch (err) {
      if (current.current === id) failed(err, setExplainError);
    }
  }

  function show(result: SearchResult, uploadedUrl: string) {
    current.current = result.id;
    setShown({ result, uploadedUrl });
    setFocusRoom(null);
    setSelectedRank(null);
    loadExplain(result.id);
  }

  async function search() {
    if (!file) return;
    setBusy(true);
    setStatus({ text: `Searching with ${model}…`, tone: "info" });
    const slow = setTimeout(() => setStatus({ text: `${WAKING} Your search continues by itself.`, tone: "waking" }), 4000);
    try {
      const body = new FormData();
      body.append("plan", file);
      body.append("model", model);
      const result = await untilAwake(
        () => api<SearchResult>("/api/search", { method: "POST", body }),
        (attempt) => setStatus({ text: `${WAKING} Trying again (${attempt}/3)…`, tone: "waking" }),
      );
      show(result, URL.createObjectURL(file));
      setStatus(null);
    } catch (err) {
      failed(err, (text) => setStatus({ text, tone: "error" }));
    } finally {
      clearTimeout(slow);
      setBusy(false);
    }
  }

  async function open(id: string) {
    try {
      const result = await api<SearchResult>(`/api/searches/${id}`);
      setModel(result.model);
      show(result, `/api/images/${id}`);
      setView("search");
      window.scrollTo({ top: 0 });
    } catch (err) {
      failed(err, setHistoryError);
    }
  }

  if (session === "checking") return null;
  if (session === "out") return <Login onLoggedIn={() => setSession("in")} />;

  return (
    <>
      <header className="bar">
        <div className="bar-inner">
          <p className="product">Plan precedents <span>Team 6 · CubiCasa5K</span></p>
          <nav aria-label="Views">
            <button type="button" aria-current={view === "search" ? "page" : undefined} onClick={() => setView("search")}>Search</button>
            <button type="button" aria-current={view === "history" ? "page" : undefined} onClick={() => setView("history")}>Saved searches</button>
          </nav>
          <button type="button" className="logout" onClick={() => api("/api/logout", { method: "POST" }).finally(() => setSession("out"))}>
            Log out
          </button>
        </div>
      </header>

      <main className="page">
        {view === "history" ? (
          <History rows={history} error={historyError} onOpen={open} />
        ) : (
          <>
            <h1 className="visually-hidden">Find similar floor plans</h1>
            <div className="workspace">
              <Upload model={model} setModel={setModel} file={file} setFile={setFile} onSearch={search} busy={busy} status={status} />
              {shown ? (
                <Result result={shown.result} uploadedUrl={shown.uploadedUrl} earlier={earlier} onOpen={open} focusRoom={focusRoom} setFocusRoom={setFocusRoom}
                  hoverRank={hoverRank} setHoverRank={setHoverRank} selectedRank={selectedRank} setSelectedRank={setSelectedRank} />
              ) : (
                <section className="results empty" aria-labelledby="empty-title">
                  <h2 id="empty-title">Five closest homes</h2>
                  <p className="muted">
                    Choose a plan and a network. The five most similar of the 5,000 CubiCasa5K homes appear here, next to
                    yours, with their rooms. Below them, the app shows what the network computed to find them.
                  </p>
                  <div className="sheet collection">
                    {atlas ? (
                      <Atlas atlas={atlas} model={model} distances={null} matches={[]} uploadedUrl={null} hoverRank={null}
                        setHoverRank={() => {}} initialMode="plans" label={`The 5,000 plans of CubiCasa5K, arranged by ${model}`} />
                    ) : (
                      <div className="skeleton strip" />
                    )}
                    <p className="reading">
                      The 5,000 homes of the collection, arranged by {model}: plans the network finds alike sit together.
                      Choose another network and watch them move. Drag to look around, pinch or double-click to zoom.
                    </p>
                  </div>
                </section>
              )}
            </div>
            {shown && (
              <LookInside result={shown.result} uploadedUrl={shown.uploadedUrl} explain={explain} explainError={explainError} retryExplain={() => loadExplain(shown.result.id)}
                atlas={atlas} hoverRank={hoverRank} setHoverRank={setHoverRank} />
            )}
          </>
        )}
      </main>

      <footer className="colophon">
        <div>
          <p><b>Plan precedents</b> · Team 6, AI Methods I, IAAC 2026</p>
          <p>Plans and rooms from CubiCasa5K, Kalervo et al., 2019</p>
          <p>The model runs on Render, the page and the data on Cloudflare</p>
          <p><a href="/humans.txt">humans.txt</a></p>
        </div>
      </footer>
    </>
  );
}
