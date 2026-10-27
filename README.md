# Andrew Wang Dev | Personal Blog & Edge Portfolio

[![Astro](https://img.shields.io/badge/Astro-6.0+-BC52EE?style=flat-square&logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4+-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> 🚀 **Live Site**: [https://andrewwangdev.com](https://andrewwangdev.com)  
> 📦 **Repository**: [https://github.com/AndrewWangDev/My-Personal-Blog](https://github.com/AndrewWangDev/My-Personal-Blog)

An edge-native, high-performance personal blog and technical showcase, built with **Astro 6 (SSR)** and deployed to **Cloudflare Workers**. Powered by **Cloudflare D1** distributed SQLite database, stateless signed cookie sessions, and **Tailwind CSS**.
---

## 🌟 Key Architecture & Features

### 1. 📰 Content & Ecosystem
- **Technical Blog**: Markdown-driven articles with real-time comments, nested replies, bookmarking, and liking.
- **Resource Center**: Curated tool showcase, downloads, external repositories, and tag-filtered indexing.
- **Tech News Ingestion**: Curated tech news pipeline (`scripts/fetch-daily-news.mjs` via `npm run news:fetch` or Admin Dashboard), using Google Gemini AI to synthesize, format, and publish technology news directly to Cloudflare D1.
- **Interactive Guestbook**: Moderated community wall with rate limits and Turnstile bot challenge.
- **Comprehensive Admin Dashboard** (`/admin`): Complete back-office management for articles, news, resources, user restrictions, and DMCA/complaint tickets.

### 2. 🛡️ Security, Authentication & Privacy Protection
- **Biometric Passwordless Auth (Passkeys & WebAuthn / FIDO2)**: Hardware-backed secure login (Touch ID, Face ID, Windows Hello) using native Web Crypto API with anti-replay signature counters.
- **Bot Mitigation**: Cloudflare Turnstile protects login, registration, password modification, and ticket submission forms.
- **Edge Rate Limiting**: In-memory sliding-window rate limiter in middleware (`src/middleware.ts`) with admin bypass.
- **DOM XSS Sanitization**: Strict HTML entity escaping for user comments, admin forms, and dynamic notification payloads.
- **Anti-Scraping Email Protection**: Sitewide email addresses are dynamically assembled at runtime to block crawler scrapers.
- **SEO & Multilingual RSS**: Dynamic runtime XML Sitemap (`/sitemap.xml`) querying D1 directly, auto-generated RSS Feed (`/rss.xml`), native 5-language i18n support, and semantic meta tags.

---

## 📂 Project Directory Structure

```text
.
├── .github/
│   └── workflows/
│       └── daily-news.yml        # Manual news ingestion workflow (workflow_dispatch)
├── public/                       # Static assets (favicons, manifests, PGP keys)
├── scripts/
│   └── fetch-daily-news.mjs      # Gemini-powered news scraper & edge ingestion
├── src/
│   ├── components/               # Reusable UI modules (Comments, Modals, Navbars)
│   ├── i18n/
│   │   └── ui.ts                 # Multilingual localization dictionaries (5 languages)
│   ├── layouts/
│   │   └── Layout.astro          # Global master layout, sticky header, drawer, and footer
│   ├── pages/
│   │   ├── api/                  # Edge API routes (Auth, Passkey, Admin, Comments, OAuth)
│   │   ├── admin/                # Admin management console
│   │   ├── blog/                 # Blog post dynamic routes (/blog/:id)
│   │   ├── news/                 # News list & detail pages (/news/:id)
│   │   ├── resources/            # Resource center & download details (/resources/:id)
│   │   ├── 404.astro             # Custom localized 404 error page
│   │   ├── about.astro           # Single-page A4 print-optimized developer portfolio
│   │   ├── account.astro         # User settings, passkey & OAuth binding center
│   │   ├── guestbook.astro       # Community guestbook
│   │   ├── index.astro           # Homepage & featured technical showcases
│   │   ├── login.astro           # Unified login portal (Password, Passkey, OAuth)
│   │   ├── register.astro        # User registration with email code verification
│   │   ├── privacy.astro         # GDPR/CCPA Privacy Policy
│   │   ├── terms.astro           # Terms of Service
│   │   ├── robots.txt.ts         # Edge robots.txt crawler directive endpoint
│   │   ├── rss.xml.ts            # Dynamic RSS 2.0 feed generator
│   │   └── sitemap.xml.ts        # Dynamic D1-backed sitemap generator
│   ├── styles/
│   │   └── global.css            # Tailwind directives, animations, and print styling
│   ├── utils/                    # Session signing, sanitization, WebAuthn, DB helpers
│   └── middleware.ts             # Global rate-limiting, session validation, and i18n routing
├── schema.sql                    # Cloudflare D1 SQLite database table schema
├── astro.config.mjs              # Astro configuration & Cloudflare adapter setup
├── wrangler.json                 # Cloudflare Workers bindings & D1 database mapping
└── package.json                  # Dependencies & npm scripts
```

---

## 🛠️ Tech Stack Breakdown

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Astro 6](https://astro.build/) (`output: 'server'`) |
| **Edge Runtime** | [Cloudflare Workers](https://workers.cloudflare.com/) via `@astrojs/cloudflare` |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (Distributed Serverless SQLite) |
| **Session & Auth** | Stateless HMAC-SHA256 Signed Cookies + [Cloudflare D1](https://developers.cloudflare.com/d1/) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) + `@tailwindcss/typography` |
| **Bot Protection** | [Cloudflare Turnstile](https://www.cloudflare.com/application-services/products/turnstile/) |
| **Email Service** | [Resend](https://resend.com/) |
| **Type Safety** | [TypeScript](https://www.typescriptlang.org/) |

---

## 🚀 Getting Started Locally

### 1. Prerequisites
- **Node.js**: `>= 22.12.0`
- **npm** or **pnpm**
- **Cloudflare Wrangler CLI**: `npm install -g wrangler` (or via `npx wrangler`)

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/AndrewWangDev/My-Personal-Blog.git
cd My-Personal-Blog
npm install
```

### 3. Configure Environment Variables
Copy the example configuration templates:
```bash
# Frontend environment variables
cp .env.example .env

# Serverless Workers local secrets
cp .dev.vars.example .dev.vars
```

Edit `.env` and `.dev.vars` with your respective API keys:
- `PUBLIC_TURNSTILE_SITE_KEY`: Cloudflare Turnstile Site Key
- `PUBLIC_GOOGLE_CLIENT_ID`: Google Cloud OAuth Web Client ID
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile Secret Key
- `RESEND_API_KEY`: Resend API key for sending registration codes
- `SESSION_SECRET`: Strong 32+ character random string for HMAC-SHA256 session signing
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`: GitHub OAuth App credentials
- `GEMINI_API_KEY`: Google AI Studio API Key (for automated tech news synthesis)
- `CRON_SECRET`: Secret token for authenticating news ingestion webhooks

### 4. Initialize Local D1 Database
Execute the database schema locally using Wrangler:
```bash
npx wrangler d1 execute DB --local --file=schema.sql
```

### 5. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## 🚢 Production Deployment

### 1. Initialize Cloudflare D1 Database (Remote)
Create your D1 database on Cloudflare:
```bash
npx wrangler d1 create my_website_db
```
Update `wrangler.json` with the generated `database_id`, then apply the schema:
```bash
npx wrangler d1 execute DB --remote --file=schema.sql
```

### 2. Configure Cloudflare Secrets
Set your production environment secrets via Wrangler:
```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put CRON_SECRET
```

### 3. Build & Deploy
```bash
npm run build
npx wrangler deploy
```

---

## 📜 Database Schema Summary (`schema.sql`)

The Cloudflare D1 database includes 16 core tables:
- `users`: Core user accounts (email, password hash, role, provider, profile)
- `deleted_users`: 30-day cool-down protection against email registration spam
- `comments`: Multi-level hierarchical discussions with soft deletion
- `interactions`: Unified store for post likes, resource bookmarks, and news likes
- `resources`: Developer software, tools, and downloadable packages
- `news`: Automated daily technology news articles
- `blog_posts`: Technical articles with Markdown text and summaries
- `notifications`: System broadcast and user-targeted notifications
- `notification_reads`: Per-user read receipt tracking for system broadcasts
- `showcase`: Featured project hero banners and external portfolio showcases
- `settings`: Key-value dynamic system configuration (e.g. daily complaint limits)
- `complaints`: User ticket submissions, feedback, and DMCA dispute records
- `user_passkeys`: Registered WebAuthn FIDO2 public keys, counters, and transport types
- `user_oauth_accounts`: Bound third-party accounts (Google, GitHub)
- `email_verifications`: Email one-time passcode (OTP) verification records
- `email_logs`: Audit log for outbound email rate limiting and domain tracking

---

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). You are free to fork, adapt, and build upon it with attribution.

---

<p align="center">
  Crafted with care by <a href="https://andrewwangdev.com">Andrew Wang Dev</a>.
</p>
