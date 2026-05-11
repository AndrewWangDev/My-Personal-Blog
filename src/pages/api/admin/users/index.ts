import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const db = env.DB;
    const { results } = await db.prepare('SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC').all();
    return new Response(JSON.stringify({ success: true, users: results }), { status: 200 });
  } catch (err: any) {
    console.error('Admin list users error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
