import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ request }) => {
  const hostname = new URL(request.url).hostname;
  const isBeta = hostname.includes('beta.andrewwangdev.com') || hostname.includes('workers.dev');

  // Beta 域名完全屏蔽爬虫
  if (isBeta) {
    return new Response(`User-agent: *\nDisallow: /\n`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // 正式域名规则
  const content = `
User-agent: Baiduspider
Disallow: /

User-agent: Baiduspider-image
Disallow: /

User-agent: Baiduspider-video
Disallow: /

User-agent: Sogou web spider
Disallow: /

User-agent: Sogou inst spider
Disallow: /

User-agent: Sogou spider2
Disallow: /

User-agent: Sogou blog
Disallow: /

User-agent: Sogou News Spider
Disallow: /

User-agent: Sogou Orion spider
Disallow: /

User-agent: 360Spider
Disallow: /

User-agent: YisouSpider
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: *
Disallow: /admin
Disallow: /api
Disallow: /publickey.asc

Sitemap: https://andrewwangdev.com/sitemap.xml
Sitemap: https://andrewwangdev.com/sitemap-index.xml
`.trim();

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};
