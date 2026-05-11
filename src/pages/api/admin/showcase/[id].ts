import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const PUT: APIRoute = async ({ locals, request, params }) => {
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  const { id } = params;
  const { image_url, link_url, display_order } = await request.json();

  const db = env.DB;
  try {
    await db.prepare('UPDATE showcase SET image_url = ?, link_url = ?, display_order = ? WHERE id = ?')
      .bind(image_url, link_url, display_order, id)
      .run();
    return new Response(JSON.stringify({ success: true }));
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  const { id } = params;
  const db = env.DB;
  try {
    await db.prepare('DELETE FROM showcase WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }));
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};
