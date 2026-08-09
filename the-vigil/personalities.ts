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

export interface Personality {
  id: PersonalityId;
  name: string;
  shortLabel: string;
  ethos: string;
  initials: string;
  accent: string;
}

export const PERSONALITIES: Personality[] = [
  {
    id: "drill-sergeant",
    name: "SGT VIGIL",
    shortLabel: "Drill Sergeant",
    ethos: "Direct, demanding, impossible to bullshit.",
    initials: "SV",
    accent: "#7C6FFF",
  },
  {
    id: "mentor",
    name: "The Mentor",
    shortLabel: "Mentor",
    ethos: "Plays the long game. Pushes with questions, not orders.",
    initials: "M",
    accent: "#4CE0B3",
  },
  {
    id: "hype",
    name: "The Hype",
    shortLabel: "Hype",
    ethos: "Treats every session like the main event.",
    initials: "H",
    accent: "#FF9F4C",
  },
];

export function personalityById(id: PersonalityId): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}
