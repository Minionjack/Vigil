# Paste this into Claude Code to start

---

Read CLAUDE.md, BRIEF.md, coach-prompts/drill-sergeant.md and fake-profile.json in this folder, then build Milestone 0 exactly as specified in BRIEF.md.

Order of work:
1. Scaffold the Expo app (TypeScript) in `./the-vigil`, stripped to the single chat screen described in the brief.
2. Build the Node proxy in `./server` with the /chat endpoint and system-prompt assembly. .env + .gitignore first.
3. Wire the app to the proxy with a config constant for the server URL.
4. Give me exact commands to run both, and how to point Expo Go on my iPhone at my laptop's LAN IP.

Then STOP and walk me through running the acceptance test from BRIEF.md yourself is not possible — I'll run it on my phone and report back. Do not build anything from the "out of scope" list.

My Anthropic API key is in my password manager — tell me where to put it, don't ask me to paste it into chat.

---

## After it passes the acceptance test
Iterate on the prompt, not the code. Useful follow-up prompts:
- "The coach felt too soft when I cancelled — tighten behavior 3 in drill-sergeant.md and show me the diff."
- "It wrote 5 sentences per message. Enforce the 60-word cap harder."
- "Add a /reset endpoint so I can clear the conversation and re-run the acceptance test cleanly."

