// GET /api/searches/<id>: a past search again, with its five matches, read from D1 and R2
export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT id, created_at, file_name, result_key FROM searches WHERE id = ?")
    .bind(params.id)
    .first();
  if (!row) {
    return Response.json({ error: "No such search." }, { status: 404 });
  }
  const object = await env.BUCKET.get(row.result_key);
  if (!object) {
    return Response.json({ error: "The stored result is missing." }, { status: 404 });
  }
  const result = await object.json();
  return Response.json({ id: row.id, created_at: row.created_at, file_name: row.file_name, ...result });
}
