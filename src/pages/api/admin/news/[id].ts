import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });

  try {
    const data = await request.json();
    const { title, author, thumbnail_url, cover_url, content } = data;

    if (!title || !content) {
      return new Response(JSON.stringify({ error: "标题和内容是必填项" }), { status: 400 });
    }

    const db = env.DB;
    const { success } = await db.prepare(`
      UPDATE news
      SET title = ?, author = ?, thumbnail_url = ?, cover_url = ?, content = ?
      WHERE id = ?
    `).bind(
      title,
      author || 'Andrew Wang',
      thumbnail_url || null,
      cover_url || null,
      content,
      id
    ).run();

    if (success) {
      return new Response(JSON.stringify({ success: true, message: "更新成功" }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "更新失败" }), { status: 500 });
    }
  } catch (error) {
    console.error("Error updating news:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });

  try {
    const db = env.DB;
    const { success } = await db.prepare('DELETE FROM news WHERE id = ?').bind(id).run();

    if (success) {
      // Also delete related interactions and comments
      await db.prepare("DELETE FROM interactions WHERE target_type IN ('news_like', 'news_bookmark') AND target_id = ?").bind(`news_${id}`).run();
      await db.prepare("DELETE FROM comments WHERE post_id = ?").bind(`news_${id}`).run();
      
      return new Response(JSON.stringify({ success: true, message: "删除成功" }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "删除失败" }), { status: 500 });
    }
  } catch (error) {
    console.error("Error deleting news:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};
