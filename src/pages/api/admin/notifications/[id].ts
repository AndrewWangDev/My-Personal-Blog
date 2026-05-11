import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const data = await request.json();
    const { title, summary, content, target_user_id } = data;
    
    await db.prepare('UPDATE notifications SET title = ?, summary = ?, content = ?, target_user_id = ? WHERE id = ?')
      .bind(title, summary || null, content, target_user_id || null, params.id).run();

    return new Response(JSON.stringify({ success: true, message: '通知已更新' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    await db.prepare('DELETE FROM notifications WHERE id = ?').bind(params.id).run();
    return new Response(JSON.stringify({ success: true, message: '通知已删除' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
