import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: '请先登录' }), { status: 401 });
  }

  try {
    const db = env.DB;
    // 获取所有全员通知或发给该用户的定向通知
    const { results } = await db.prepare(
      'SELECT id, title, summary, content, created_at FROM notifications WHERE target_user_id IS NULL OR target_user_id = ? ORDER BY created_at DESC'
    ).bind(locals.user.id).all();

    return new Response(JSON.stringify({ success: true, notifications: results || [] }), { status: 200 });
  } catch (err: any) {
    console.error('Notifications fetch error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
