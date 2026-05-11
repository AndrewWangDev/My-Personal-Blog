import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q || q.trim().length < 1) {
    return new Response(JSON.stringify({ success: true, results: [] }));
  }

  try {
    const db = env.DB;
    const term = `%${q}%`;

    // 1. Search Blog Posts
    const blogPromise = db.prepare(
      "SELECT id, title as name, summary, 'blog' as type FROM blog_posts WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? LIMIT 5"
    ).bind(term, term, term).all();

    // 2. Search Resources
    const resourcePromise = db.prepare(
      "SELECT id, name, summary, 'resource' as type FROM resources WHERE name LIKE ? OR summary LIKE ? OR details LIKE ? LIMIT 5"
    ).bind(term, term, term).all();

    // 3. Search News
    const newsPromise = db.prepare(
      "SELECT id, title as name, SUBSTR(REPLACE(REPLACE(REPLACE(content, '#', ''), '*', ''), '_', ''), 1, 80) || '...' as summary, 'news' as type FROM news WHERE title LIKE ? OR content LIKE ? LIMIT 5"
    ).bind(term, term).all();

    const [blogs, resources, news] = await Promise.all([blogPromise, resourcePromise, newsPromise]);

    const allResults = [
      ...(blogs.results || []),
      ...(resources.results || []),
      ...(news.results || [])
    ];

    return new Response(JSON.stringify({ success: true, results: allResults }));
  } catch (err: any) {
    console.error("Search error:", err);
    return new Response(JSON.stringify({ error: 'Search failed' }), { status: 500 });
  }
};
