import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const { results } = await db.prepare(`
      SELECT n.id, n.title, n.summary, n.content, n.target_user_id, n.created_at, u.username as target_username
      FROM notifications n LEFT JOIN users u ON n.target_user_id = u.id
      ORDER BY n.created_at DESC
    `).all();
    return new Response(JSON.stringify({ success: true, notifications: results }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const data = await request.json();
    const { title, summary, content, target_user_id } = data;
    
    if (!title || !content) {
      return new Response(JSON.stringify({ error: '标题和正文不能为空' }), { status: 400 });
    }

    if (Array.isArray(target_user_id)) {
      if (target_user_id.length === 0) {
        return new Response(JSON.stringify({ error: '未选择用户' }), { status: 400 });
      }
      const stmt = db.prepare('INSERT INTO notifications (title, summary, content, target_user_id) VALUES (?, ?, ?, ?)');
      const batch = target_user_id.map(uid => stmt.bind(title, summary || null, content, uid));
      await db.batch(batch);
    } else {
      await db.prepare('INSERT INTO notifications (title, summary, content, target_user_id) VALUES (?, ?, ?, ?)')
        .bind(title, summary || null, content, target_user_id || null).run();
    }

    return new Response(JSON.stringify({ success: true, message: '通知已发布' }), { status: 201 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
