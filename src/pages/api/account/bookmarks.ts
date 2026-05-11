import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: '请先登录' }), { status: 401 });
  }

  try {
    const db = env.DB;
    // Get all bookmarked blog post IDs for this user
    const { results: bookmarks } = await db.prepare(
      "SELECT target_id FROM interactions WHERE user_id = ? AND target_type = 'post_bookmark' ORDER BY created_at DESC"
    ).bind(locals.user.id).all();

    if (!bookmarks || bookmarks.length === 0) {
      return new Response(JSON.stringify({ success: true, posts: [] }), { status: 200 });
    }

    // Extract numeric IDs from target_id (format: "blog_123")
    const postIds = bookmarks
      .map((b: any) => {
        const id = String(b.target_id).replace('blog_', '');
        return parseInt(id, 10);
      })
      .filter((id: number) => !isNaN(id));

    if (postIds.length === 0) {
      return new Response(JSON.stringify({ success: true, posts: [] }), { status: 200 });
    }

    // Fetch post details
    const placeholders = postIds.map(() => '?').join(',');
    const { results: posts } = await db.prepare(
      `SELECT id, title, author, summary, thumbnail_url, created_at FROM blog_posts WHERE id IN (${placeholders}) ORDER BY created_at DESC`
    ).bind(...postIds).all();

    return new Response(JSON.stringify({ success: true, posts: posts || [] }), { status: 200 });
  } catch (err: any) {
    console.error('Bookmarks fetch error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
