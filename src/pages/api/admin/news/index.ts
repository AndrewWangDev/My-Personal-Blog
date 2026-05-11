import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const db = env.DB;
    const { results } = await db.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
    return new Response(JSON.stringify({ success: true, news: results }), { status: 200 });
  } catch (error) {
    console.error("Error fetching admin news:", error);
    return new Response(JSON.stringify({ error: "获取新闻失败" }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const data = await request.json();
    const { title, author, thumbnail_url, cover_url, content } = data;

    if (!title || !content) {
      return new Response(JSON.stringify({ error: "标题和内容是必填项" }), { status: 400 });
    }

    const db = env.DB;
    const { success } = await db.prepare(`
      INSERT INTO news (title, author, thumbnail_url, cover_url, content)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      title,
      author || 'Andrew Wang',
      thumbnail_url || null,
      cover_url || null,
      content
    ).run();

    if (success) {
      return new Response(JSON.stringify({ success: true, message: "创建成功" }), { status: 201 });
    } else {
      return new Response(JSON.stringify({ error: "创建失败" }), { status: 500 });
    }
  } catch (error) {
    console.error("Error creating news:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};
