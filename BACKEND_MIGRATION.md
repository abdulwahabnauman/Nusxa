# Moving AI Calls Fully to the Backend Proxy

Goal: stop shipping AI provider API keys inside the APK and route every AI
request through the Cloudflare Worker in `worker/` (service name
`nusxa-ai-proxy`), which holds the keys server-side.

## Current state (why this is needed)

Right now the keys ARE bundled in the APK:

1. `.env` declares `EXPO_PUBLIC_GEMINI_API_KEY`, `EXPO_PUBLIC_OPENROUTER_API_KEY`,
   and `EXPO_PUBLIC_GROQ_API_KEY`. Expo inlines every `EXPO_PUBLIC_*` variable
   into the JS bundle at build time, so they ship inside the APK/AAB as plain
   text.
2. `src/utils/secureStorage.ts` resolves each key as: user's SecureStore key,
   else the bundled `EXPO_PUBLIC_*` value. Users who never enter a key silently
   use the bundled ones.
3. The backend already exists and the client already supports it:
   - `worker/src/index.js` exposes `POST /chat` and `POST /vision`, reads the
     provider keys from Cloudflare secrets, and validates a shared `x-app-key`
     header.
   - `src/ai/client.ts` checks `isAiProxyConfigured()` on every call
     (`chatCompletion`, `visionCompletion`, `multiTurnChat`) and routes through
     the proxy when it is on, so the device never sends a provider key.
4. The proxy is NOT activated: `isAiProxyConfigured()` in
   `src/constants/config.ts` is only true when `EXPO_PUBLIC_AI_PROXY_URL` is
   set, and the current `.env` has no such variable.

## Prerequisites

- A Cloudflare account (Workers free tier: 100,000 requests/day).
- Wrangler CLI: `npm install -g wrangler`, then `wrangler login`.
- Provider accounts with fresh keys (create or rotate):
  - Gemini: https://aistudio.google.com/app/apikey
  - OpenRouter: https://openrouter.ai/keys
  - Groq: https://console.groq.com/keys

IMPORTANT: the three keys currently in `.env` (and previously shared via
`project.zip`) must be treated as compromised. Rotate all of them at the
provider consoles BEFORE putting them into the worker, and delete/revoke the
old ones.

## Step 1: Deploy the worker and set its secrets

Run from the `worker/` directory:

```bash
cd worker

wrangler secret put GEMINI_API_KEY       # paste the rotated Gemini key
wrangler secret put OPENROUTER_API_KEY   # paste the rotated OpenRouter key
wrangler secret put GROQ_API_KEY         # paste the rotated Groq key
wrangler secret put APP_KEY              # any long random string

wrangler deploy
```

Notes:

- Secrets are encrypted on Cloudflare; they never appear in the repo, in
  `wrangler.toml`, or in the app.
- `APP_KEY` can be generated with `openssl rand -hex 32` or any password
  manager. Keep a copy; the app needs the exact same value in Step 3.
- After deploy, note the worker URL, e.g.
  `https://nusxa-ai-proxy.<your-subdomain>.workers.dev`.

## Step 2: Verify the worker is healthy

```bash
curl https://nusxa-ai-proxy.<your-subdomain>.workers.dev/
# expect: {"ok":true,"service":"nusxa-ai-proxy"}

curl -X POST https://nusxa-ai-proxy.<your-subdomain>.workers.dev/chat ^
  -H "Content-Type: application/json" ^
  -H "x-app-key: <APP_KEY>" ^
  -d "{\"system\":\"Reply with the single word: ok\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"
# expect: {"content":"..."}   (anything else, e.g. 401/502, means secrets are wrong)
```

## Step 3: Point the app at the proxy and delete bundled keys

Edit `.env` in the app root so it contains ONLY the proxy settings:

```
EXPO_PUBLIC_AI_PROXY_URL=https://nusxa-ai-proxy.<your-subdomain>.workers.dev
EXPO_PUBLIC_AI_PROXY_APP_KEY=<the same APP_KEY value>
```

Then DELETE these three lines from `.env` entirely:

```
EXPO_PUBLIC_GEMINI_API_KEY=...
EXPO_PUBLIC_OPENROUTER_API_KEY=...
EXPO_PUBLIC_GROQ_API_KEY=...
```

This deletion is the step that actually removes the keys from the APK.
Even with the proxy active, any `EXPO_PUBLIC_*` key still present at build
time gets inlined into the bundle as a dead but extractable string. The
fallback code in `secureStorage.ts` simply resolves to an empty string when
they are absent, and it is never reached anyway because the proxy branch in
`client.ts` runs first.

Do the same for EAS build environments if you use them:

```bash
eas secret:create --name EXPO_PUBLIC_AI_PROXY_URL --value "https://nusxa-ai-proxy.<your-subdomain>.workers.dev"
eas secret:create --name EXPO_PUBLIC_AI_PROXY_APP_KEY --value "<APP_KEY>"
eas secret:delete --name EXPO_PUBLIC_GEMINI_API_KEY
eas secret:delete --name EXPO_PUBLIC_OPENROUTER_API_KEY
eas secret:delete --name EXPO_PUBLIC_GROQ_API_KEY
```

Update `env.example` to reflect this (proxy settings filled, fallback keys
removed) so nobody re-adds the keys by copying the template.

## Step 4: Clean rebuild

Env vars are inlined at bundle time, so a stale cache must be cleared:

```bash
# Local development
npx expo start --clear

# Local release build
npx expo run:android --clear

# Or EAS
eas build --platform android --profile production
```

## Step 5: Verify keys are gone

1. Open the app, go to Settings. The three API key cards (Gemini, OpenRouter,
   Groq) should be replaced by the "Ready to use" card, because
   `isAiProxyConfigured()` is now true. That alone confirms the proxy path is
   active.
2. Functional check: scan a prescription (vision path) and open the chat tab
   (text path). Both should work with no keys entered anywhere.
3. Bundle check (optional, belt and braces): build a release APK, unzip it,
   and search the JS bundle for any old key fragment:
   ```bash
   strings app/build/outputs/apk/release/app-release.apk | findstr "AIza"
   strings app/build/outputs/apk/release/app-release.apk | findstr "sk-or-"
   ```
   Both should return nothing.

## Optional hardening

- Rate limiting: Cloudflare dashboard -> Security -> WAF -> Rate limiting
  rules, applied to `/chat` and `/vision`. The `APP_KEY` header only deters
  casual abuse because it is itself embedded in the binary.
- Free model quotas are per-key and shared by all users (Nemotron free is
  about 50 requests/day; Groq fills in automatically). Upgrade provider plans
  as the audience grows.
- Model names are duplicated in `src/constants/config.ts` and
  `worker/src/index.js`. Keep both in sync when changing models.
- To make re-bundling keys structurally impossible, you can later remove the
  `EXPO_PUBLIC_*` fallbacks from `src/utils/secureStorage.ts` and the
  fallback lines from `env.example`. Not required for the migration itself.

## Rollback

To return to bring-your-own-key mode: set `EXPO_PUBLIC_AI_PROXY_URL=` (empty)
in `.env`, restore the three `EXPO_PUBLIC_*_API_KEY` values if desired, and
rebuild. The Settings key cards reappear automatically.

## Checklist summary

- [ ] All three provider keys rotated at the consoles, old ones revoked
- [ ] `wrangler secret put` run for GEMINI_API_KEY, OPENROUTER_API_KEY,
      GROQ_API_KEY, APP_KEY
- [ ] `wrangler deploy` succeeded, health endpoint returns `{"ok":true}`
- [ ] `.env` has proxy URL + APP_KEY only; all EXPO_PUBLIC provider keys deleted
- [ ] EAS secrets updated (if used); `env.example` cleaned
- [ ] Clean rebuild done (`--clear`)
- [ ] Settings shows "Ready to use"; scan and chat work without local keys
- [ ] `strings` search of the release APK finds no key fragments
