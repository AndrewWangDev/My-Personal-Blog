import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  const db = env.DB;
  try {
    const { results } = await db.prepare('SELECT * FROM showcase ORDER BY display_order ASC, created_at DESC').all();
    return new Response(JSON.stringify({ success: true, showcase: results || [] }));
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
  }

  const { image_url, link_url, display_order } = await request.json();
  if (!image_url || !link_url) {
    return new Response(JSON.stringify({ success: false, error: 'Missing fields' }), { status: 400 });
  }

  const db = env.DB;
  try {
    // 检查是否超过5个
    const { results } = await db.prepare('SELECT COUNT(*) as count FROM showcase').all();
    if (results[0].count >= 5) {
      return new Response(JSON.stringify({ success: false, error: '橱窗最多只能展示5张图' }), { status: 400 });
    }

    await db.prepare('INSERT INTO showcase (image_url, link_url, display_order) VALUES (?, ?, ?)')
      .bind(image_url, link_url, display_order || 0)
      .run();
    return new Response(JSON.stringify({ success: true }));
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};
