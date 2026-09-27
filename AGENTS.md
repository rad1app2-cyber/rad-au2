<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- AI calls use the user's own free Google Gemini key (GEMINI_API_KEY) directly, not the Lovable AI Gateway — user requires zero paid API usage.
- Onboarding is an AI chat at "/" (src/lib/onboard.functions.ts) using Gemini function calling to create agents and generate real WhatsApp pairing codes — the AI can't link WhatsApp itself.
- Button motion lives in the shared Button styling; prominent action buttons use the animated action control with Arabic action labels so all actions stay consistent and accessible.
