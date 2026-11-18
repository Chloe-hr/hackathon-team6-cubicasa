// GET /api/history: the 20 most recent searches, read from D1
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, file_name, best_id, best_distance, match_ids, model FROM searches ORDER BY created_at DESC LIMIT 20",
  ).all();
  return Response.json(results.map((row) => ({ ...row, match_ids: JSON.parse(row.match_ids) })));
}
