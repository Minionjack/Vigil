// Single source of truth for every color, spacing, radius, and type value
// in the-vigil. Everything else in this app references these — no raw hex
// or magic number anywhere past this file.
//
// The dark theme, the Orb motif, and the three personality accents
// (violet/mint/orange) are the existing brand (marketing/vigil-landing.html,
// personalities.ts) — this file inherits them rather than replacing them.

export const colors = {
  void: "#0A0A0F",
  // A hair lighter than void, used only as the top stop of the screen's
  // background gradient — flat void everywhere read as unlit; this gives
  // the dark theme actual depth instead of a single flat fill, the same
  // way a physical dark room isn't one uniform shade of black.
  voidTop: "#16161F",
  surface: "#141419",
  surface2: "#1C1C24",
  border: "#2A2A34",

  text: "#F2F1F7",
  textDim: "#96959F",
  textFaint: "#5C5B66", // decorative use only (dots, dividers) — see textPlaceholder below for actual text
  // #5C5B66 on #0A0A0F is 2.96:1 — fails WCAG AA even for large text (3:1).
  // Verified computationally, not eyeballed. Never use textFaint for text a
  // person is meant to read; use textPlaceholder (4.97:1) instead.
  textPlaceholder: "#7F7E90",

  violet: "#7C6FFF",
  violetDim: "#463F8F",
  mint: "#4CE0B3",
  orange: "#FF9F4C",

  // Not previously in the app's palette — pulled from
  // marketing/vigil-landing.html's --red (#FF6B6B), not invented, for the
  // one semantic case the existing three accents don't cover: a connection
  // failure has to read as distinct from a normal coach reply.
  danger: "#FF6B6B",
  dangerSoft: "#3A2323", // danger tinted into the dark surface family, for backgrounds
} as const;

// Loaded via @expo-google-fonts/{space-grotesk,inter,ibm-plex-mono} in
// App.tsx's useFonts call — these string keys must match the exported
// font names exactly (SpaceGrotesk_600SemiBold etc.).
export const fonts = {
  // Space Grotesk — coach names, headers, anything that has to feel like
  // an identity rather than UI chrome. A geometric grotesk with just
  // enough character (open apertures, a slightly wide-set lowercase) to
  // read as confident and current without going cold or corporate —
  // already the marketing site's display face, so using it here is
  // continuity, not a new decision.
  display: {
    medium: "SpaceGrotesk_500Medium",
    semiBold: "SpaceGrotesk_600SemiBold",
    bold: "SpaceGrotesk_700Bold",
  },
  // Inter — chat body text. The highest-legibility-per-pixel UI face
  // available at small sizes; a coach that's blunt should still be
  // effortless to read, not fighting the typeface for attention.
  body: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semiBold: "Inter_600SemiBold",
  },
  // IBM Plex Mono — status/data fragments only (LIVE indicator, personality
  // short-label in small caps contexts). Signals "verified, computed,
  // exact" — the same register the Verified-stats-only prompt rules use
  // for numbers; the type system echoes that discipline visually.
  mono: {
    regular: "IBMPlexMono_400Regular",
    medium: "IBMPlexMono_500Medium",
  },
} as const;

export const fontSizes = {
  xs: 11,
  sm: 12.5,
  base: 15,
  md: 16,
  lg: 19,
  xl: 26,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 10,
  lg: 14,
  xl: 16,
  xxl: 20,
  full: 999,
} as const;

// WCAG 2.5.5 / Apple HIG both land on 44pt as the practical minimum for a
// reliably tappable target — applied to every interactive element's
// hitSlop or minimum box size, not just the visually-obvious buttons.
export const touchTarget = {
  min: 44,
} as const;

export const shadow = {
  orb: {
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  // A neutral, always-black elevation shadow for surfaces that don't carry
  // an accent color (the input bar) — real lift, not just a flat fill.
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

// A soft colored glow behind an accent-bearing surface (a picker card, the
// send button) — this, plus the background gradient, is most of the gap
// between "flat colored boxes" and something that reads as designed rather
// than assembled: real light and depth, not just fills and borders.
export function glow(color: string, opacity = 0.35) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } as const;
}
