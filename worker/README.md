# Nusxa AI Proxy (Cloudflare Worker)

Holds all AI provider keys server-side so app users never have to obtain or
configure API keys. Free tier: 100,000 requests/day on Cloudflare Workers.

## Deploy (one time)

```bash
npm install -g wrangler
wrangler login
cd worker

# Provider keys — create them once on your own accounts:
#   Gemini:      https://aistudio.google.com/app/apikey
#   OpenRouter:  https://openrouter.ai/keys
#   Groq:        https://console.groq.com/keys
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put GROQ_API_KEY

# Any random string; the app sends it with every request
wrangler secret put APP_KEY

wrangler deploy
```

After deploying, note the worker URL, e.g. `https://nusxa-ai-proxy.<you>.workers.dev`.

## Point the app at the proxy

Create `.env` in the app root (see `env.example`):

```
EXPO_PUBLIC_AI_PROXY_URL=https://nusxa-ai-proxy.<you>.workers.dev
EXPO_PUBLIC_AI_PROXY_APP_KEY=<the same APP_KEY secret>
```

Restart Metro (`npm start`) so the new env vars are picked up. When
`EXPO_PUBLIC_AI_PROXY_URL` is set, the app routes all AI calls through the
proxy and ignores user-provided keys; when empty, it falls back to the
bring-your-own-key mode.

## Rate Limiting & Protection

- `APP_KEY` is required. The worker refuses every POST without an `x-app-key` header (the `GET /`
  health check still answers), so a deploy missing the secret fails loudly.
- **Built-in per-IP rate limiting**: The worker enforces in-memory sliding-window throttling
  (20 vision requests/hour, 60 chat requests/hour per client IP) using `CF-Connecting-IP`
  or `X-Forwarded-For`. An LRU memory cap prevents instance memory exhaustion.
- When rate-limited, the worker returns `429 Too Many Requests` accompanied by standard
  `Retry-After: <seconds>` headers, which the client application parses to display precise
  backoff timers.
- For additional enterprise DDoS protection, Cloudflare WAF rate limiting rules can also be
  layered on the `/chat` and `/vision` paths.
- Free model quotas are per-key and shared by all app users (Groq is primary
  at ~1,000 req/day; Nemotron fills in automatically). For a larger audience,
  upgrade the provider plans.
- Model names mirror `src/constants/config.ts` in the app — keep both in sync.
