import { MODELS, planNumber, type SavedSearch } from "../api";

// The 20 most recent searches, stored in D1; "Open" reads the full answer back from R2
export function History({ rows, error, onOpen }: { rows: SavedSearch[] | null; error: string | null; onOpen: (id: string) => void }) {
  return (
    <section className="sheet history" aria-labelledby="history-title">
      <h2 id="history-title">Saved searches</h2>
      <p className="muted">Every search is stored in the D1 database and R2, so it is still here after a reload, also while the model server sleeps.</p>
      {error && <p className="status" data-tone="error">{error}</p>}
      {rows === null && !error && <div className="skeleton strip" />}
      {rows?.length === 0 && <p>No searches yet. Search once and it appears here.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">When, UTC</th><th scope="col">Network</th><th scope="col">File</th><th scope="col">Most similar</th><th scope="col" className="num">Distance</th><th scope="col"><span className="visually-hidden">Open</span></th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="when">{new Date(row.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}</td>
                  <td>{row.model ?? "v3"}<span className="network-name-long"> · {MODELS[row.model ?? "v3"].name.toLowerCase()}</span></td>
                  <td className="file">{row.file_name ?? "unnamed"}</td>
                  <td>Plan {planNumber(row.best_id)}</td>
                  <td className="num">{row.best_distance.toFixed(1)}</td>
                  <td><button type="button" className="quiet" onClick={() => onOpen(row.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
