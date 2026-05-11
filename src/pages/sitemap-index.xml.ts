import type { APIRoute } from 'astro';
import { generateSitemapXml } from '../utils/sitemap';

export const GET: APIRoute = async () => {
  try {
    const xml = await generateSitemapXml();

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch (error) {
    console.error("Sitemap index generation error:", error);
    return new Response("Error generating sitemap", { status: 500 });
  }
};
