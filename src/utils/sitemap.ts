import { env } from "cloudflare:workers";

export const BASE_URL = 'https://andrewwangdev.com';

export interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
}

export function formatLastMod(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export async function generateSitemapXml(): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  
  // 核心静态页面
  const urls: SitemapEntry[] = [
    { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'daily', lastmod: today },
    { loc: `${BASE_URL}/resources`, priority: '0.9', changefreq: 'daily', lastmod: today },
    { loc: `${BASE_URL}/news`, priority: '0.9', changefreq: 'daily', lastmod: today },
    { loc: `${BASE_URL}/about`, priority: '0.8', changefreq: 'weekly', lastmod: today },
    { loc: `${BASE_URL}/guestbook`, priority: '0.8', changefreq: 'daily', lastmod: today },
    { loc: `${BASE_URL}/privacy`, priority: '0.5', changefreq: 'monthly', lastmod: '2026-10-23' },
    { loc: `${BASE_URL}/terms`, priority: '0.5', changefreq: 'monthly', lastmod: '2026-10-23' },
  ];

  try {
    const db = (env as any).DB;
    if (db) {
      // 博客文章
      const blogs = await db.prepare('SELECT id, created_at FROM blog_posts ORDER BY created_at DESC').all();
      blogs.results?.forEach((b: any) => {
        urls.push({
          loc: `${BASE_URL}/blog/${b.id}`,
          priority: '0.7',
          changefreq: 'weekly',
          lastmod: formatLastMod(b.created_at)
        });
      });

      // 资源
      const resources = await db.prepare('SELECT id, created_at FROM resources ORDER BY created_at DESC').all();
      resources.results?.forEach((r: any) => {
        urls.push({
          loc: `${BASE_URL}/resources/${r.id}`,
          priority: '0.7',
          changefreq: 'weekly',
          lastmod: formatLastMod(r.created_at)
        });
      });

      // 新闻前沿
      const news = await db.prepare('SELECT id, created_at FROM news ORDER BY created_at DESC').all();
      news.results?.forEach((n: any) => {
        urls.push({
          loc: `${BASE_URL}/news/${n.id}`,
          priority: '0.7',
          changefreq: 'weekly',
          lastmod: formatLastMod(n.created_at)
        });
      });
    }
  } catch (error) {
    console.error("Error fetching sitemap dynamic records:", error);
  }

  const xmlEntries = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
}
