// POST /api/logout: deletes the login cookie and goes back to the login page
export async function onRequestPost({ request }) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": "auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    },
  });
}
