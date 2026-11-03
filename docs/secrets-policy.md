# Secrets policy

## Rules

1. Never commit real credentials. Local values live in `.env.local`, which git ignores.
2. `.env.example` holds placeholders and harmless defaults only.
3. Only values that are public by design carry the `NEXT_PUBLIC_` prefix, because Next.js inlines those into the browser bundle.
4. Use separate Supabase projects and keys for development and production.
5. Rotate any key that is exposed, then check the provider's logs for misuse.
6. Logs carry context, never tokens, keys or request bodies containing personal data.

## Variables

| Variable | Exposure | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | The anon (publishable) key. Safe in the browser because row-level security protects every table |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Bypasses RLS. Used only by `npm run seed:demo` on a trusted machine; the app never reads it |
| `SUPABASE_ACCESS_TOKEN` | **Secret** | Personal token for the Supabase CLI or MCP server; not read by the app |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **Secret** (token) | Optional cache |
| `GEMINI_API_KEY` | **Secret** | Copilot and receipt scanning. Server-only; requests are made from route handlers |
| `GEMINI_MODEL` | Config | Model id for the copilot |
| `RECEIPT_EXTRACTOR` | Config | Key in `src/lib/receipt/registry.ts`, or `none` |
| `LOG_LEVEL` | Config | `debug`, `info`, `warn` or `error` |

Google's OAuth client ID and secret are entered in the Supabase dashboard (*Authentication → Sign In / Providers → Google*), not in this app's environment.

## What is committed on purpose

`.mcp.json` names the Supabase project ref. A project ref is an identifier, not a credential; access through the MCP server still requires the user's own OAuth authorisation.

## Checks

- `src/lib/env.ts` validates the environment lazily, so `next build` succeeds with no secrets and a missing value fails clearly at the point of use. CI builds with no secrets to keep it that way.
- No secret is read in a client component. Search for `process.env` under `src/components` before merging; only `NEXT_PUBLIC_` values may appear there.
