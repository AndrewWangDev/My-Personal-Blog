import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: '请先登录' }), { status: 401 });
  }

  try {
    const db = env.DB;
    const userId = locals.user.id;

    // 获取所有全员通知或发给该用户的定向通知，并联合查询已读状态
    const { results } = await db.prepare(`
      SELECT 
        n.id, 
        n.title, 
        n.summary, 
        n.content, 
        n.created_at,
        CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END AS is_read
      FROM notifications n
      LEFT JOIN notification_reads nr 
        ON nr.notification_id = n.id AND nr.user_id = ?
      WHERE n.target_user_id IS NULL OR n.target_user_id = ?
      ORDER BY n.created_at DESC
    `).bind(userId, userId).all();

    const notifications = results || [];
    const unreadCount = notifications.filter((n: any) => !n.is_read).length;

    return new Response(JSON.stringify({ 
      success: true, 
      notifications,
      unread_count: unreadCount
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Notifications fetch error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
