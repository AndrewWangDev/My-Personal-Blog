import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: '请先登录' }), { status: 401 });
  }

  try {
    const db = env.DB;
    // Get all bookmarked resource IDs for this user
    const { results: bookmarks } = await db.prepare(
      "SELECT target_id FROM interactions WHERE user_id = ? AND target_type = 'resource_bookmark' ORDER BY created_at DESC"
    ).bind(locals.user.id).all();

    if (!bookmarks || bookmarks.length === 0) {
      return new Response(JSON.stringify({ success: true, resources: [] }), { status: 200 });
    }

    // Extract numeric IDs from target_id (format: "res_123")
    const resourceIds = bookmarks
      .map((b: any) => {
        const id = String(b.target_id).replace('res_', '');
        return parseInt(id, 10);
      })
      .filter((id: number) => !isNaN(id));

    if (resourceIds.length === 0) {
      return new Response(JSON.stringify({ success: true, resources: [] }), { status: 200 });
    }

    // Fetch resource details along with likes count in a single query (PERF-01: eliminate N+1 queries)
    const placeholders = resourceIds.map(() => '?').join(',');
    const { results: resources } = await db.prepare(`
      SELECT r.id, r.name, r.author, r.summary, r.logo_url, r.tags, r.created_at,
             COUNT(i.id) as likes_count
      FROM resources r
      LEFT JOIN interactions i ON i.target_type = 'resource_like' AND i.target_id = ('res_' || r.id)
      WHERE r.id IN (${placeholders})
      GROUP BY r.id
    `).bind(...resourceIds).all();

    // Sort by original bookmark order
    const sortedResources = resourceIds.map(id => (resources || []).find((r: any) => r.id === id)).filter(Boolean);

    return new Response(JSON.stringify({ success: true, resources: sortedResources }), { status: 200 });
  } catch (err: any) {
    console.error('Resource bookmarks fetch error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
