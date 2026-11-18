// GET /api/wake: pokes the model server so a sleeping Render server starts waking up
// as soon as the page opens, before the user has even chosen a plan.
export async function onRequestGet({ env }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${env.MODEL_URL}/`, { signal: controller.signal });
    return Response.json({ awake: response.ok });
  } catch {
    return Response.json({ awake: false }); // still starting: the next search will wait for it
  } finally {
    clearTimeout(timer);
  }
}
