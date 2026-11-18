import { useState } from "react";
import { api, ApiError } from "../api";

// The app is private: one team password, checked by the worker, kept in an HttpOnly cookie for 7 days
export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="login">
      <form
        className="sheet"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/login", { method: "POST", body: new FormData(event.currentTarget) });
            onLoggedIn();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not reach the app. Check your connection.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Plan precedents</h1>
        <p className="muted">Team 6 · floor-plan similarity search on CubiCasa5K. Enter the team password.</p>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus
          aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
        <button type="submit" className="primary" disabled={busy}>{busy ? "Checking…" : "Log in"}</button>
        {error && <p id="login-error" className="status" data-tone="error">{error}</p>}
      </form>
    </main>
  );
}
