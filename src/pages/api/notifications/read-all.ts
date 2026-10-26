import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: '请先登录' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const db = env.DB;
    const userId = locals.user.id;

    // 一键批量插入当前用户所有可访问通知的已读记录
    await db.prepare(`
      INSERT OR IGNORE INTO notification_reads (user_id, notification_id)
      SELECT ?, n.id FROM notifications n
      WHERE (n.target_user_id IS NULL OR n.target_user_id = ?)
    `).bind(userId, userId).run();

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Notification mark read-all error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
