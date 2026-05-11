import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

// GET: List all restricted emails
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const db = env.DB;
    const { results } = await db.prepare('SELECT email, expires_at FROM deleted_users ORDER BY expires_at DESC').all();
    return new Response(JSON.stringify({ success: true, restrictions: results }), { status: 200 });
  } catch (err: any) {
    console.error('Admin list restrictions error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

// POST: Manually add a restriction
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const db = env.DB;
    const data = await request.json();
    const { email, expires_at } = data;

    if (!email || !expires_at) {
      return new Response(JSON.stringify({ error: '请提供邮箱和限制截止时间' }), { status: 400 });
    }

    await db.prepare(`
      INSERT INTO deleted_users (email, expires_at) 
      VALUES (?, ?) 
      ON CONFLICT(email) DO UPDATE SET expires_at = ?
    `).bind(email, expires_at, expires_at).run();

    return new Response(JSON.stringify({ success: true, message: '限制已添加' }), { status: 200 });
  } catch (err: any) {
    console.error('Admin add restriction error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
