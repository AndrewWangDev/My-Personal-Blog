import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async () => {
  try {
    const db = env.DB;
    const { results } = await db.prepare('SELECT id, title, author, summary, thumbnail_url, content, created_at FROM blog_posts ORDER BY created_at DESC').all();
    return new Response(JSON.stringify({ success: true, posts: results }), { status: 200 });
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
    const { title, author, summary, thumbnail_url, content } = data;
    if (!title || !content) {
      return new Response(JSON.stringify({ error: '标题和正文不能为空' }), { status: 400 });
    }
    await db.prepare('INSERT INTO blog_posts (title, author, summary, thumbnail_url, content) VALUES (?, ?, ?, ?, ?)')
      .bind(title, author || 'Andrew Wang', summary || '', thumbnail_url || '', content).run();
    return new Response(JSON.stringify({ success: true, message: '文章已创建' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
