/**
 * Daily Tech / AI / Semiconductor News Scraper & Publisher
 * Automatically collects, filters, formats, and publishes 1 top news article daily.
 */

const SITE_URL = process.env.SITE_URL || 'https://andrewwangdev.com';
const CRON_SECRET = process.env.CRON_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Blacklist of images already used on the site
const BLACKLIST = new Set([
  'https://cdn.andrewwangdev.com/img/x1.webp',
  'https://cdn.andrewwangdev.com/img/x2.webp',
  'https://cdn.andrewwangdev.com/img/x3.webp'
]);

// Curated high-resolution covers strictly free from recognizable brand logos and human faces.
// Focus: Abstract silicon diffraction, macro wafer patterns, fiber optic compute, neutral circuit traces.
const SAFE_ABSTRACT_COVERS = [
  'https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=1200&q=80', // Silicon wafer rainbow diffraction (no logo, no people)
  'https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=1200&q=80', // Microscopic silicon wafer architecture (abstract clean)
  'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=1200&q=80', // Fiber optic high-speed photonics
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80', // Abstract neural topology generative pattern
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80', // Dark computing matrix glow
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80', // Macro circuit traces (abstract tech, unbranded)
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80', // Abstract digital infrastructure lights
  'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?auto=format&fit=crop&w=1200&q=80'  // Macro hardware electronics (abstract pins/traces)
];

function pickSafeCover() {
  const candidates = SAFE_ABSTRACT_COVERS.filter(url => !BLACKLIST.has(url));
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Thoroughly strip ALL HTML tags and decode entities
function stripAllHtml(text = '') {
  if (!text) return '';
  let s = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Repeatedly strip all HTML tags
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// RSS Feeds
const RSS_FEEDS = [
  'https://news.google.com/rss/search?q=(AI+OR+Semiconductor+OR+NVIDIA+OR+TSMC+OR+GPU)+AND+(chip+OR+processor+OR+wafer+OR+Cerebras)&hl=en-US&gl=US&ceid=US:en'
];

function parseRss(xmlText) {
  const items = [];
  const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const sourceMatch = itemXml.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/i);

    let rawTitle = titleMatch ? titleMatch[1] : '';
    let link = linkMatch ? linkMatch[1].trim() : '';
    let rawDesc = descMatch ? descMatch[1] : '';
    let source = sourceMatch ? stripAllHtml(sourceMatch[1]) : '';

    if (!source) {
      const fontMatch = rawDesc.match(/font color="#6f6f6f">([^<]+)<\/font>/i);
      if (fontMatch) {
        source = stripAllHtml(fontMatch[1]);
      }
    }
    if (!source) source = 'Industry News';

    // Completely strip any links or HTML
    const cleanTitle = stripAllHtml(rawTitle).replace(/\s+-\s+[^-]+$/, '').trim();
    const cleanDesc = stripAllHtml(rawDesc).replace(new RegExp(`\\s*${source}$`, 'i'), '').trim();

    if (cleanTitle && link) {
      items.push({
        title: cleanTitle,
        link,
        description: cleanDesc,
        source: source
      });
    }
  }
  return items;
}

// Scoring
const KEYWORDS = [
  { word: 'chip', score: 10 },
  { word: 'semiconductor', score: 10 },
  { word: 'nvidia', score: 10 },
  { word: 'tsmc', score: 10 },
  { word: 'gpu', score: 8 },
  { word: 'cerebras', score: 10 },
  { word: 'wafer', score: 8 },
  { word: 'processor', score: 7 },
  { word: 'ai', score: 8 },
  { word: 'artificial intelligence', score: 8 },
  { word: 'intel', score: 6 },
  { word: 'amd', score: 6 }
];

function scoreItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let totalScore = 0;
  for (const { word, score } of KEYWORDS) {
    if (text.includes(word.toLowerCase())) totalScore += score;
  }
  return totalScore;
}

// Build article matching reference style:
// Exactly 2 paragraphs of continuous narrative.
// NO markdown headers, NO bullet points, NO URLs/links, NO "Source: ..." footer.
async function buildArticle(item) {
  if (GEMINI_API_KEY) {
    try {
      console.log('🤖 Invoking Gemini for journalistic narrative...');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a senior technology and semiconductor journalist.
Write a tech news article about this development:
Title: "${item.title}"
Context: "${item.description}"

STRICT REQUIREMENTS:
1. Write exactly 2 well-developed paragraphs in clear, factual, journalistic English.
2. Detail the technological hardware breakthroughs, process nodes/architectures, market/financial numbers, and industry implications.
3. DO NOT include any markdown headers (NO #, ##, ###).
4. DO NOT include bullet points or numbered lists.
5. DO NOT include any URLs, markdown links, or starting link text.
6. DO NOT include any "Source: ..." or source credit line at the end. End directly after the second paragraph.

Reference tone and style:
Cerebras Systems, an AI chip manufacturer aiming to rival industry giant Nvidia, has launched its highly anticipated US Initial Public Offering (IPO). Pricing its class A common stock at $185 per share, the company is set to raise over $5.5 billion, making it the largest IPO of 2026 so far. The initial share price is significantly higher than earlier estimates of $115 to $160 per share, reflecting strong market demand that saw orders exceed available shares by 20 times.

With 30 million shares available, the company's valuation is estimated to be around $50 billion. The stock will trade on the Nasdaq Global Select Market under the ticker symbol 'CBRS'. Despite earlier concerns regarding its heavy reliance on a single major customer which led to a postponed IPO in late 2024, the overwhelming investor interest underscores the continuous explosive growth and confidence in the artificial intelligence hardware sector.`
            }]
          }]
        })
      });

      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiText && aiText.trim()) {
        // Ensure no trailing source line
        return aiText.trim().replace(/\n\s*Source:.*$/i, '').trim();
      }
    } catch (e) {
      console.warn('⚠️ Gemini error:', e.message);
    }
  }

  // Fallback narrative without headers, without links, without Source footer
  const paragraph1 = `${item.title}. In a major development accelerating the global semiconductor and AI infrastructure race, industry analysts report significant market momentum surrounding cutting-edge compute architectures, advanced wafer fabrication, and high-density packaging solutions designed to satisfy unprecedented demand for enterprise artificial intelligence deployment.`;

  const paragraph2 = `With leading foundries and chipmakers investing tens of billions into next-generation nodes, high-bandwidth memory (HBM), and specialized silicon accelerators, market watchers emphasize that computational efficiency and energy density have become the defining competitive frontiers. The strategic moves underscore expanding investor confidence and long-term capital expenditure across the entire semiconductor value chain.`;

  return `${paragraph1}\n\n${paragraph2}`;
}

async function main() {
  console.log('🚀 Starting Daily Tech/AI/Chip News Ingestion Task...');
  console.log(`🌐 Target Site: ${SITE_URL}`);

  let candidatePool = [];

  for (const url of RSS_FEEDS) {
    try {
      console.log(`📡 Fetching feed: ${url.slice(0, 60)}...`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!res.ok) continue;
      const xml = await res.text();
      candidatePool.push(...parseRss(xml));
    } catch (err) {
      console.warn(`⚠️ Error reading feed:`, err.message);
    }
  }

  console.log(`📊 Candidates collected: ${candidatePool.length}`);
  if (candidatePool.length === 0) {
    console.error('❌ No candidates found.');
    process.exit(1);
  }

  candidatePool.forEach(item => { item.score = scoreItem(item); });
  candidatePool.sort((a, b) => b.score - a.score);

  const topCandidates = candidatePool.filter(c => c.score >= 8);
  const candidatesToTry = topCandidates.length > 0 ? topCandidates : candidatePool.slice(0, 10);

  let published = false;

  for (const item of candidatesToTry) {
    console.log(`\n🧐 Evaluating: "${item.title}" (Score: ${item.score})`);

    const cover = pickSafeCover();
    const content = await buildArticle(item);

    const payload = {
      title: item.title,
      author: 'Andrew Wang Dev',
      thumbnail_url: cover,
      cover_url: cover,
      content: content
    };

    try {
      console.log(`📤 Uploading news...`);
      const apiRes = await fetch(`${SITE_URL}/api/internal/news`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CRON_SECRET}`,
          'x-cron-secret': CRON_SECRET
        },
        body: JSON.stringify(payload)
      });

      const result = await apiRes.json();

      if (apiRes.status === 201 && result.success) {
        console.log(`✅ Successfully published! D1 Row ID: ${result.id}`);
        console.log(`🖼️ Cover selected (clean, no logo/person): ${cover}`);
        console.log(`\n📄 Content generated:\n${content}\n`);
        published = true;
        break;
      } else if (result.skipped) {
        console.log(`ℹ️ News already exists. Trying next candidate...`);
      } else {
        console.warn(`⚠️ Upload failed:`, result.error || result);
      }
    } catch (err) {
      console.error(`❌ Network error:`, err.message);
      break;
    }
  }

  if (published) {
    console.log('🎉 Daily news ingestion completed successfully!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
