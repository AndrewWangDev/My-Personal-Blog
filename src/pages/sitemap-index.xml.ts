import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://andrewwangdev.com/sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`.trim();

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch (error) {
    console.error("Sitemap index generation error:", error);
    return new Response("Error generating sitemap index", { status: 500 });
  }
};
