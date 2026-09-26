# Status: Gemini API + what's broken

## Answers to your questions

**1. Does the app use the free Gemini API?** Yes.
The WhatsApp webhook (`src/routes/api/public/evolution/$agentId.ts`) calls Google's Gemini API directly:
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Auth: the `GEMINI_API_KEY` secret you just updated (read server-side via `process.env`).
- This is the Google AI Studio endpoint (free tier available), not the Lovable AI Gateway. Your key drives it, so replies stop if the key is invalid or its quota runs out.

**2. Is everything working?** No — there is one build-breaking bug that also breaks every AI reply at runtime.

### The bug
`tsgo --noEmit` reports two errors in `src/routes/api/public/evolution/$agentId.ts`:

```
(209,31): error TS2304: Cannot find name 'userContent'.
(213,15): error TS2345: Argument of type 'string' is not assignable to parameter of type 'Record<string, unknown>[]'.
```

- Line 209 calls `askAI(userContent)`, but `userContent` is never declared — the built-up array is `userParts`. This throws a `ReferenceError` at runtime, so the AI never replies to any WhatsApp message. It's also a TypeScript error, so the build fails.
- Line 213 is the media-fallback path: it passes a plain string to `askAI`, but `askAI` expects `Record<string, unknown>[]` (an array of parts). That's the second type error.

Everything else checks out:
- Database tables exist: `agents`, `messages`, `knowledge_files`, `data_sources`, `profiles`.
- Secrets (`AUTHENTICATION_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `GEMINI_API_KEY`) are now set.
- Evolution API helper, server functions, dashboard, and auth flow are wired correctly.

## The fix (one file, two lines)

File: `src/routes/api/public/evolution/$agentId.ts`

1. Line 209 — pass the parts array, not the undefined name:
   `reply = await askAI(userContent);` → `reply = await askAI(userParts);`

2. Lines 212–214 — wrap the fallback text as a proper parts array so it matches `askAI`'s signature:
   `reply = await askAI(\`${userText}\n(تعذّر تحليل المرفق...)\`)` →
   `reply = await askAI([{ text: \`${userText}\n(تعذّر تحليل المرفق، اعتذر بلطف واطلب من العميل توضيح طلبه كتابةً)\` }])`

After the edit: `tsgo --noEmit` should pass clean, and incoming WhatsApp messages will reach Gemini and get a reply.
