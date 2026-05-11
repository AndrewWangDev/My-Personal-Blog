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
    const { name, author, logo_url, cover_image_url, summary, details, tags, github_url, download_url } = data;

    if (!name || !summary) {
      return new Response(JSON.stringify({ error: "名称和简述是必填项" }), { status: 400 });
    }

    const db = env.DB;
    const { success } = await db.prepare(`
      UPDATE resources
      SET name = ?, author = ?, logo_url = ?, cover_image_url = ?, summary = ?, details = ?, tags = ?, github_url = ?, download_url = ?
      WHERE id = ?
    `).bind(
      name,
      author || 'Andrew Wang',
      logo_url || null,
      cover_image_url || null,
      summary,
      details || null,
      tags || '[]',
      github_url || null,
      download_url || null,
      id
    ).run();

    if (success) {
      return new Response(JSON.stringify({ success: true, message: "更新成功" }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "更新失败" }), { status: 500 });
    }
  } catch (error) {
    console.error("Error updating resource:", error);
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
    const { success } = await db.prepare('DELETE FROM resources WHERE id = ?').bind(id).run();

    if (success) {
      // Also delete related interactions and comments
      await db.prepare("DELETE FROM interactions WHERE target_type IN ('resource_like', 'resource_bookmark') AND target_id = ?").bind(`res_${id}`).run();
      // Wait, comments are stored with post_id = `res_${id}`. Delete them too.
      await db.prepare("DELETE FROM comments WHERE post_id = ?").bind(`res_${id}`).run();
      
      return new Response(JSON.stringify({ success: true, message: "删除成功" }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "删除失败" }), { status: 500 });
    }
  } catch (error) {
    console.error("Error deleting resource:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};
