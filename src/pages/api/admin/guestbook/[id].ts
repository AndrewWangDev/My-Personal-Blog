import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

// PUT: Edit guestbook message content
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const data = await request.json();
    const { content } = data;
    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400 });
    }
    await db.prepare('UPDATE comments SET content = ? WHERE id = ? AND post_id = ?')
      .bind(content.trim(), params.id, 'guestbook').run();
    return new Response(JSON.stringify({ success: true, message: '留言已更新' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

// DELETE: Soft-delete guestbook message
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    await db.prepare("UPDATE comments SET is_deleted = 1, content = '此留言已被管理员删除' WHERE id = ? AND post_id = ?")
      .bind(params.id, 'guestbook').run();
    return new Response(JSON.stringify({ success: true, message: '留言已删除' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
