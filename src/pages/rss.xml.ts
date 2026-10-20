import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async () => {
  try {
    const db = (env as any).DB;
    const baseUrl = 'https://andrewwangdev.com';
    
    let items: any[] = [];

    if (db) {
      // Query blogs
      const blogsRes = await db.prepare('SELECT id, title, summary, content, created_at FROM blog_posts ORDER BY created_at DESC LIMIT 20').all();
      const blogs = (blogsRes.results || []).map((b: any) => ({
        title: b.title,
        link: `${baseUrl}/blog/${b.id}`,
        description: b.summary || (b.content ? b.content.substring(0, 150) + '...' : ''),
        pubDate: new Date(b.created_at).toUTCString(),
        guid: `blog-${b.id}`
      }));

      // Query news
      const newsRes = await db.prepare('SELECT id, title, content, created_at FROM news ORDER BY created_at DESC LIMIT 20').all();
      const newsList = (newsRes.results || []).map((n: any) => ({
        title: n.title,
        link: `${baseUrl}/news/${n.id}`,
        description: n.content ? n.content.substring(0, 150) + '...' : '',
        pubDate: new Date(n.created_at).toUTCString(),
        guid: `news-${n.id}`
      }));

      items = [...blogs, ...newsList];
      // Sort desc by date
      items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      // Take latest 20 overall
      items = items.slice(0, 20);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Andrew Wang Dev</title>
    <link>${baseUrl}</link>
    <description>Software Engineer focused on Edge Computing &amp; Distributed AI. Currently working on Cloud-Native Architecture and Edge AI &amp; LLM. Open for internships.</description>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
    ${items.map(item => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="false">${item.guid}</guid>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
    </item>`).join('')}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: { 
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (error) {
    console.error("RSS generation error:", error);
    return new Response("Error generating RSS feed", { status: 500 });
  }
};
