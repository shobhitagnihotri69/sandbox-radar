# Sandbox Radar

Live map of ~500 AI sandbox startups: open-source activity, communities, founders and hiring.

- `public/data.json` is refreshed every 6 hours by a scraper running 24/7 on a BoxLite Cloud microVM, which pushes it here; Vercel redeploys on each push.
- Sources: company websites, GitHub, Y Combinator company pages, Discord invite counts, Hacker News.
- Founder links come from YC profiles (high confidence) or top GitHub maintainers (medium). Verify before reaching out.

```bash
npm install && npm run dev
```
