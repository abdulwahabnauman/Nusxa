# Prescription Scan Fix — AI Proxy Deployment

**Status:** Resolved (2026-08-30)
**Symptom:** Prescription scanning always failed at the "Reading prescription"
stage with *"Could not reach the AI service. Check your internet connection
and try again."*

## Root cause

`.env` still contained the **template placeholder** proxy URL from
`env.example` / `worker/README.md`:

```
EXPO_PUBLIC_AI_PROXY_URL=https://nusxa-ai-proxy.YOUR_SUBDOMAIN.workers.dev
```

Three problems compounded:

1. `YOUR_SUBDOMAIN.workers.dev` does not exist, so every `/vision` OCR
   request died at DNS resolution — the scan pipeline never reached any AI
   service.
2. `isAiProxyConfigured()` (`src/constants/config.ts`) only checks that the
   URL is non-empty, so the placeholder counted as "configured" and the app
   **skipped the bring-your-own-key Gemini fallback entirely**.
3. The worker had never been deployed and no secrets were set, so even the
   correct URL would have failed until deployment happened.

## What was done

1. **Installed wrangler** — `npm install -g wrangler` (v4.127.1).
2. **Authenticated** — `wrangler login` (browser OAuth).
3. **Deployed the worker** from `worker/`:
   ```
   https://nusxa-ai-proxy.abdulwahabnauman2006.workers.dev
   ```
4. **Set the four worker secrets** (values taken from the app `.env`, never
   logged or committed):
   - `GEMINI_API_KEY` — prescription OCR (vision)
   - `OPENROUTER_API_KEY` — text fallback (Nemotron)
   - `GROQ_API_KEY` — primary text provider
   - `APP_KEY` — shared secret sent as `x-app-key` on every request
   Note: wrangler v4 no longer supports `secret put --stdin`; pipe the value
   into the interactive prompt instead:
   `printf '%s' "$VALUE" | wrangler secret put <NAME>`
5. **Updated `.env`** — `EXPO_PUBLIC_AI_PROXY_URL` now points at the deployed
   worker URL above. `EXPO_PUBLIC_AI_PROXY_APP_KEY` already matched the
   `APP_KEY` secret.

## Verification (all passed)

| Check | Expected | Result |
|---|---|---|
| `GET /` health | `{"ok":true,...}` | ✅ |
| `POST /vision` without `x-app-key` | `401 Unauthorized` | ✅ |
| `POST /vision` with key, bad body | `400 Invalid request body` | ✅ |
| `POST /vision` with key + 1×1 test JPEG | `200` with Gemini content | ✅ (Gemini described the image correctly) |

## Important: restart Metro after any `.env` change

`EXPO_PUBLIC_*` variables are baked into the bundle when Metro starts.
After editing `.env`, stop the dev server and run `npm start` again before
testing the scan flow.

## Re-deploying or rotating secrets later

```bash
cd worker
wrangler deploy                        # push code changes
printf '%s' "$NEW_VALUE" | wrangler secret put GEMINI_API_KEY   # rotate one
wrangler secret list                   # show names only (values stay hidden)
```

If the proxy ever breaks again, quick triage is:

```bash
curl https://nusxa-ai-proxy.abdulwahabnauman2006.workers.dev/        # health
curl -X POST .../vision -H 'Content-Type: application/json' -d '{}'  # expect 401 without x-app-key
```

## Optional hardening (not done)

`isAiProxyConfigured()` could reject obvious placeholder values (e.g. URLs
containing `YOUR_SUBDOMAIN` or `<`), so a template value can never silently
disable the bring-your-own-key fallback again.
