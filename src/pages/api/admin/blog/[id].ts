import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const post = await db.prepare('SELECT * FROM blog_posts WHERE id = ?').bind(params.id).first();
    if (!post) return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404 });
    return new Response(JSON.stringify({ success: true, post }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    const db = env.DB;
    const data = await request.json();
    const { title, author, summary, thumbnail_url, content } = data;
    if (!title || !content) {
      return new Response(JSON.stringify({ error: '标题和正文不能为空' }), { status: 400 });
    }
    await db.prepare('UPDATE blog_posts SET title=?, author=?, summary=?, thumbnail_url=?, content=? WHERE id=?')
      .bind(title, author || 'Andrew Wang', summary || '', thumbnail_url || '', content, params.id).run();
    return new Response(JSON.stringify({ success: true, message: '文章已更新' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });

  try {
    const db = env.DB;
    // 使用 batch 原子级联清理所有关联 interactions 和 comments
    await db.batch([
      db.prepare("DELETE FROM interactions WHERE target_type IN ('post_like', 'post_bookmark', 'blog_like', 'blog_bookmark') AND target_id = ?").bind(`blog_${id}`),
      db.prepare("DELETE FROM comments WHERE post_id = ?").bind(`blog_${id}`),
      db.prepare("DELETE FROM blog_posts WHERE id = ?").bind(id)
    ]);
    return new Response(JSON.stringify({ success: true, message: '文章已删除' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
