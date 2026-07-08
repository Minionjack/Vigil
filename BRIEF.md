# Milestone 0 — Coach Chat Skeleton

**Goal:** I can open the app on my phone, talk to the Drill Sergeant, and it calls me out using my (fake) history. Success = within ten minutes of chatting, it *feels* like a coach, not a chatbot.

## Build exactly this

### 1. Expo app
- `npx create-expo-app@latest the-vigil` (TypeScript template), stripped to a single chat screen.
- Dark theme. Header: coach name "SGT VIGIL" + a red/amber "ON DUTY" status dot. Message list + text input. That's the whole UI.
- Coach messages left-aligned with a simple avatar circle (placeholder — initials "SV" on red). User messages right-aligned.
- Show a typing indicator while waiting on the API.
- Keyboard-avoiding view done properly (this always breaks on iOS — test it).

### 2. Local API proxy
- Minimal Node/Express server in `/server` with one endpoint: `POST /chat`.
- Takes `{ messages: [{role, content}...] }`, prepends the system prompt (assembled from `coach-prompts/drill-sergeant.md` + `fake-profile.json`), calls the Anthropic API (`claude-sonnet-4-6`, max_tokens 1024), returns the text reply.
- API key from `.env` (`ANTHROPIC_API_KEY`). Add `.env` to `.gitignore` before anything else.
- App reads the server URL from a config constant so I can point it at my laptop's LAN IP for phone testing.

### 3. System prompt assembly
The proxy builds the system prompt as:
1. Contents of `coach-prompts/drill-sergeant.md`
2. A `## Client file` section: `fake-profile.json` rendered as readable text (not raw JSON)
3. Today's date and day of week (so "you skipped Tuesday" style callouts work)

### 4. Conversation state
- In-memory on the client (array of messages). No persistence yet. Full history sent on each request.
- Cap history sent to the API at the last 30 messages.

## Acceptance test (run this before calling it done)
Send these three messages and check the behavior:
1. "hey" → coach should greet me by name (Jack) and immediately reference something from the profile (the skipped session or the goal), not give a generic greeting.
2. "can't make it today, work is crazy" → coach should push back, reference that "work" was also the excuse logged on Feb 12 in the profile, and offer a concrete alternative (shorter session, later slot) rather than just accepting it.
3. "fine, I'll do 30 minutes at 8pm" → coach should lock it in, state what the 30-min session will be (pulled from the current program in the profile), and say it will be checking in.

If the coach is generic, sycophantic, or forgets the profile — the milestone is NOT done. Tune the prompt, not the UI.

## Out of scope
Auth, Supabase, push notifications, logging workouts, other personalities, voice, animations. Do not build these even if it's easy.
