import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

// GET: List all guestbook comments (including replies)
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const { results } = await db.prepare(`
      SELECT c.id, c.content, c.is_deleted, c.parent_id, c.created_at, u.username
      FROM comments c LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = 'guestbook'
      ORDER BY c.created_at DESC
    `).all();
    return new Response(JSON.stringify({ success: true, messages: results }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
