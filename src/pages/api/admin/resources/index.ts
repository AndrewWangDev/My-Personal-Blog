import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

// 获取资源列表
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const db = env.DB;
    const { results } = await db.prepare('SELECT * FROM resources ORDER BY created_at DESC').all();
    return new Response(JSON.stringify({ success: true, resources: results }), { status: 200 });
  } catch (error) {
    console.error("Error fetching admin resources:", error);
    return new Response(JSON.stringify({ error: "获取资源失败" }), { status: 500 });
  }
};

// 创建新资源
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const data = await request.json();
    const { name, author, logo_url, cover_image_url, summary, details, tags, github_url, download_url } = data;

    if (!name || !summary) {
      return new Response(JSON.stringify({ error: "名称和简述是必填项" }), { status: 400 });
    }

    const db = env.DB;
    const { success } = await db.prepare(`
      INSERT INTO resources (name, author, logo_url, cover_image_url, summary, details, tags, github_url, download_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      name,
      author || 'Andrew Wang',
      logo_url || null,
      cover_image_url || null,
      summary,
      details || null,
      tags || '[]',
      github_url || null,
      download_url || null
    ).run();

    if (success) {
      return new Response(JSON.stringify({ success: true, message: "创建成功" }), { status: 201 });
    } else {
      return new Response(JSON.stringify({ error: "创建失败" }), { status: 500 });
    }
  } catch (error) {
    console.error("Error creating resource:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};
