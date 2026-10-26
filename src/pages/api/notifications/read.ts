import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: '请先登录' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json().catch(() => ({}));
    const id = Number(data.id);
    if (!id || isNaN(id)) {
      return new Response(JSON.stringify({ error: '无效的通知ID' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = env.DB;
    const userId = locals.user.id;

    // 校验通知是否存在且属于全员或当前用户
    const noti = await db.prepare(
      'SELECT id FROM notifications WHERE id = ? AND (target_user_id IS NULL OR target_user_id = ?)'
    ).bind(id, userId).first();

    if (!noti) {
      return new Response(JSON.stringify({ error: '通知不存在或无权访问' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await db.prepare(
      'INSERT OR IGNORE INTO notification_reads (user_id, notification_id) VALUES (?, ?)'
    ).bind(userId, id).run();

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Notification mark read error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
