// Deliberately NOT imported from @vigil/core, unlike server/ and
// proactive/: this app is bundled by Metro, not run under Node/tsx, and
// wiring a workspace TS package into Metro (watchFolders, nodeModulesPaths)
// is a real config change this environment can't verify actually resolves
// on-device. Keeping this list in sync by hand across three files (this
// one plus @vigil/core's, which server and proactive both use) is the
// known tradeoff — if a fourth personality is ever added, update all four
// call sites: this file, coach-prompts/personalities/, and the two
// KNOWN_PERSONALITIES consumers now unified in packages/core/src/personality.ts.
export type PersonalityId = "drill-sergeant" | "mentor" | "hype";

export type MotionCharacter = "sharp" | "smooth" | "bouncy";

// Motion as an extension of voice, the same way coach-prompts/personalities/
// already differentiate tone in words. Values are half-cycle durations (ms)
// and scale multipliers for the Orb's breathing/speaking animation — see
// App.tsx's useOrbMotion. Not decorative tuning: each personality's numbers
// are a deliberate, distinct character —
//   drill-sergeant: fast, small amplitude, sharp snap — controlled intensity.
//   mentor: slow, moderate amplitude, smooth ease — unhurried and steady.
//   hype: fast AND large amplitude, bouncy overshoot — can't sit still.
export interface Motion {
  character: MotionCharacter;
  idleDurationMs: number;
  idleScale: number; // peak scale multiplier during idle "breathing"
  speakingDurationMs: number;
  speakingScale: number; // peak scale multiplier while the coach is "speaking"
}

export interface Personality {
  id: PersonalityId;
  name: string;
  shortLabel: string;
  ethos: string;
  initials: string;
  accent: string;
  motion: Motion;
}

export const PERSONALITIES: Personality[] = [
  {
    id: "drill-sergeant",
    name: "SGT VIGIL",
    shortLabel: "Drill Sergeant",
    ethos: "Direct, demanding, impossible to bullshit.",
    initials: "SV",
    accent: "#7C6FFF",
    motion: { character: "sharp", idleDurationMs: 700, idleScale: 1.05, speakingDurationMs: 260, speakingScale: 1.1 },
  },
  {
    id: "mentor",
    name: "The Mentor",
    shortLabel: "Mentor",
    ethos: "Plays the long game. Pushes with questions, not orders.",
    initials: "M",
    accent: "#4CE0B3",
    motion: { character: "smooth", idleDurationMs: 2200, idleScale: 1.07, speakingDurationMs: 900, speakingScale: 1.09 },
  },
  {
    id: "hype",
    name: "The Hype",
    shortLabel: "Hype",
    ethos: "Treats every session like the main event.",
    initials: "H",
    accent: "#FF9F4C",
    motion: { character: "bouncy", idleDurationMs: 550, idleScale: 1.12, speakingDurationMs: 220, speakingScale: 1.16 },
  },
];

export function personalityById(id: PersonalityId): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}
