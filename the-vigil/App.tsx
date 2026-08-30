import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SERVER_URL } from "./config";
import { SUPABASE_AUTH_EMAIL, SUPABASE_AUTH_PASSWORD } from "./config.local";
import { supabase } from "./supabaseClient";
import { PERSONALITIES, personalityById, type Motion, type MotionCharacter, type PersonalityId } from "./personalities";
import { colors, fonts, fontSizes, glow, radii, shadow, spacing, touchTarget } from "./design-tokens";

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

type Role = "user" | "assistant";
type MessageStatus = "ok" | "error";

interface Message {
  id: string;
  role: Role;
  content: string;
  status?: MessageStatus;
  timestamp: number;
}

// Phase 3's conversational logging: round-trips through the client
// exactly like `messages` already does (the client already resends full
// history every request) — no new persistence. If the app is killed
// mid-confirmation the proposal is simply lost, an accepted v1 limit.
interface PendingLogProposal {
  type: string;
  exercises: { exercise: string; weight_kg: number; reps: number; sets: number; rpe?: number }[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const HEADER_HEIGHT = 72;
const PERSONALITY_STORAGE_KEY = "vigil.personality";
const FALLBACK_TEXT = "Couldn't reach the coach — check the server and try again.";

const DEFAULT_MOTION: Motion = {
  character: "smooth",
  idleDurationMs: 1400,
  idleScale: 1.06,
  speakingDurationMs: 500,
  speakingScale: 1.1,
};

// Reanimated's Easing module mirrors React Native's core Easing API
// (verified live: docs.swmansion.com/react-native-reanimated/docs/animations/withTiming,
// installed version 4.1.7 per the-vigil/package.json) — each personality's
// "character" maps to a genuinely different curve, not just a different
// duration, so the motion itself reads as a different temperament:
//   sharp   — fast deceleration, reads as decisive/controlled.
//   smooth  — a sine ease both ways, the classic organic "breathing" curve.
//   bouncy  — a slight overshoot on the way out, reads as can't-sit-still.
const EASING_BY_CHARACTER: Record<MotionCharacter, (t: number) => number> = {
  sharp: Easing.out(Easing.exp),
  smooth: Easing.inOut(Easing.sin),
  bouncy: Easing.out(Easing.back(1.5)),
};

function isPersonalityId(value: string | null): value is PersonalityId {
  return PERSONALITIES.some((p) => p.id === value);
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The signature element, matching how the brand's own pitch deck draws the
 * Orb: concentric rings around a solid core, not a single filled dot — a
 * watchful/sonar reading that suits a coach whose whole thesis is
 * "notices when you don't show up." Three animated layers:
 *  - a static outer ring: always visible, the persistent identity mark,
 *    so even a Reduce Motion user still sees "the Orb," just not moving.
 *  - a ping ring: expands outward from the core and fades on a loop —
 *    the sonar-style "watching" pulse. Runs one-directional (not a
 *    back-and-forth breathe) so it reads as radiating out, not wobbling.
 *  - the core: the original idle/speaking breathing scale, personality
 *    motion character and all.
 * Reduce Motion collapses the ping to a single, much subtler settle
 * instead of turning it off outright, so the coach still reads as
 * "present" without the continuous movement a reduce-motion user opted
 * out of.
 */
function Orb({
  size = 32,
  color,
  initials,
  motion,
  speaking = false,
}: {
  size?: number;
  color?: string;
  initials?: string;
  motion?: Motion;
  speaking?: boolean;
}) {
  const m = motion ?? DEFAULT_MOTION;
  const reduceMotion = useReducedMotion();
  const coreScale = useSharedValue(1);
  const pingScale = useSharedValue(0.64);
  const pingOpacity = useSharedValue(0);
  const bg = useSharedValue(color ?? colors.violet);

  useEffect(() => {
    bg.value = withTiming(color ?? colors.violet, { duration: 350, easing: Easing.inOut(Easing.quad) });
  }, [color, bg]);

  useEffect(() => {
    const easingFn = EASING_BY_CHARACTER[m.character];
    if (reduceMotion) {
      coreScale.value = withTiming(1.02, { duration: 600, easing: Easing.out(Easing.quad) });
      pingScale.value = withTiming(0.85, { duration: 600, easing: Easing.out(Easing.quad) });
      pingOpacity.value = withTiming(0.3, { duration: 600, easing: Easing.out(Easing.quad) });
      return;
    }
    const duration = speaking ? m.speakingDurationMs : m.idleDurationMs;
    const corePeak = speaking ? m.speakingScale : m.idleScale;
    coreScale.value = withRepeat(withSequence(withTiming(corePeak, { duration, easing: easingFn }), withTiming(1, { duration, easing: easingFn })), -1, true);

    const pingDuration = duration * 2.2;
    pingScale.value = 0.64;
    pingOpacity.value = 0.5;
    pingScale.value = withRepeat(withTiming(1, { duration: pingDuration, easing: Easing.out(Easing.quad) }), -1, false);
    pingOpacity.value = withRepeat(withTiming(0, { duration: pingDuration, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduceMotion, speaking, m.character, m.idleDurationMs, m.idleScale, m.speakingDurationMs, m.speakingScale, coreScale, pingScale, pingOpacity]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
    backgroundColor: bg.value,
    shadowColor: bg.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({ borderColor: bg.value }));
  const pingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pingScale.value }],
    opacity: pingOpacity.value,
    borderColor: bg.value,
  }));

  const coreSize = size * 0.6;
  const ringSize = size * 0.9;
  const centered = (layerSize: number) => (size - layerSize) / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[styles.orbRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, left: centered(ringSize), top: centered(ringSize) }, ringStyle]}
      />
      <Animated.View
        style={[styles.orbPing, { width: coreSize, height: coreSize, borderRadius: coreSize / 2, left: centered(coreSize), top: centered(coreSize) }, pingStyle]}
      />
      <Animated.View
        style={[styles.orbCore, { width: coreSize, height: coreSize, borderRadius: coreSize / 2, left: centered(coreSize), top: centered(coreSize) }, coreStyle]}
      >
        {initials && (
          // Fixed-size badge label, not scaling body text — at very large
          // Dynamic Type sizes this two-letter mark would overflow the
          // circular container it lives in. The coach's full name is always
          // shown as real (scalable) text alongside it, so nothing here is
          // the only copy of that information.
          <Text allowFontScaling={false} style={[styles.orbInitials, { fontSize: coreSize * 0.42 }]}>
            {initials}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

// So the header's accent-colored edge transitions smoothly on a personality
// switch instead of snapping — same withTiming-on-a-color pattern as the Orb.
function AccentEdge({ color }: { color: string }) {
  const bg = useSharedValue(color);
  useEffect(() => {
    bg.value = withTiming(color, { duration: 350, easing: Easing.inOut(Easing.quad) });
  }, [color, bg]);
  const animatedStyle = useAnimatedStyle(() => ({ backgroundColor: bg.value }));
  return <Animated.View style={[styles.headerEdge, animatedStyle]} />;
}

function PickerScreen({
  onSelect,
  canDismiss,
  onDismiss,
  currentId,
}: {
  onSelect: (id: PersonalityId) => void;
  canDismiss: boolean;
  onDismiss: () => void;
  currentId: PersonalityId | null;
}) {
  return (
    <LinearGradient colors={[colors.voidTop, colors.void]} style={styles.gradientRoot}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.pickerHeader}>
          {canDismiss && (
            <TouchableOpacity onPress={onDismiss} hitSlop={12} style={styles.pickerDismissTouchable} accessibilityRole="button" accessibilityLabel="Cancel, keep current coach">
              <Text style={styles.pickerDismiss}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.pickerIntro}>
          <Text style={styles.pickerTitle}>Choose your coach</Text>
          <Text style={styles.pickerSubtitle}>You can change this later.</Text>
        </View>
        <View style={styles.pickerCards}>
          {PERSONALITIES.map((p) => {
            const isCurrent = p.id === currentId;
            return (
              <TouchableOpacity
                key={p.id}
                testID={`picker-card-${p.id}`}
                style={[styles.pickerCard, glow(p.accent, 0.22), { borderTopColor: p.accent }, isCurrent && { borderWidth: 2, borderColor: p.accent }]}
                onPress={() => onSelect(p.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${p.ethos}${isCurrent ? ", currently selected" : ""}`}
              >
                <Orb size={60} color={p.accent} initials={p.initials} motion={p.motion} />
                <View style={styles.pickerCardText}>
                  <View style={styles.pickerCardNameRow}>
                    <Text style={styles.pickerCardName}>{p.name}</Text>
                    {isCurrent && (
                      <View style={[styles.currentBadge, { borderColor: p.accent }]}>
                        <Text style={[styles.currentBadgeText, { color: p.accent }]}>✓ Current</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.pickerCardTag, { color: p.accent }]}>{p.shortLabel.toUpperCase()}</Text>
                  <Text style={styles.pickerCardEthos}>{p.ethos}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

interface HistorySession {
  date: string;
  type: string;
  status: "completed" | "skipped";
  note?: string;
  excuse?: string;
  exercises?: { exercise: string; weight_kg: number; reps: number; sets: number; rpe?: number }[];
}

interface HistoryResponse {
  sessions: HistorySession[];
  trends: Record<string, { date: string; topSetWeight_kg: number }[]>;
}

// BRIEF-PHASE3.md's History screen: reverse-chron session list plus one
// trend element (not a dashboard) — both computed server-side by the
// history edge function; this component only renders what it's given.
function HistoryScreen({ onDismiss, coachAccent }: { onDismiss: () => void; coachAccent: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`${SERVER_URL}/history`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        setData(await res.json());
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  // "One trend element only" per the brief — the exercise with the most
  // logged data points is the one worth showing; ties break alphabetically
  // for a stable, non-arbitrary choice.
  const topTrend = data
    ? Object.entries(data.trends).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]
    : undefined;
  const trendWeights = topTrend ? topTrend[1].map((p) => p.topSetWeight_kg) : [];
  const trendMin = Math.min(...trendWeights);
  const trendMax = Math.max(...trendWeights);
  const trendRange = trendMax - trendMin || 1;

  return (
    <LinearGradient colors={[colors.voidTop, colors.void]} style={styles.gradientRoot}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onDismiss} hitSlop={12} style={styles.pickerDismissTouchable} accessibilityRole="button" accessibilityLabel="Back to chat">
            <Text style={styles.pickerDismiss}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pickerIntro}>
          <Text style={styles.pickerTitle}>History</Text>
          <Text style={styles.pickerSubtitle}>Every session, most recent first.</Text>
        </View>

        {loadError && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>Couldn't load history — check the connection and try again.</Text>
          </View>
        )}

        {!loadError && !data && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>Loading…</Text>
          </View>
        )}

        {data && (
          <FlatList
            data={data.sessions}
            keyExtractor={(item, index) => `${item.date}-${item.type}-${index}`}
            contentContainerStyle={styles.historyList}
            ListHeaderComponent={
              topTrend ? (
                <View style={styles.trendCard}>
                  <Text style={[styles.trendTitle, { color: coachAccent }]}>{topTrend[0].toUpperCase()}</Text>
                  <View style={styles.trendRow}>
                    {topTrend[1].map((point, i) => (
                      <View key={i} style={styles.trendBarWrap}>
                        <View style={[styles.trendBar, { height: 8 + 52 * ((point.topSetWeight_kg - trendMin) / trendRange), backgroundColor: coachAccent }]} />
                        <Text style={styles.trendBarLabel}>{point.topSetWeight_kg}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.historyRow}>
                <View style={styles.historyRowHeader}>
                  <Text style={styles.historyDate}>{item.date}</Text>
                  <Text style={[styles.historyBadge, item.status === "skipped" ? styles.historyBadgeSkipped : { color: coachAccent }]}>
                    {item.type} · {item.status === "skipped" ? "SKIPPED" : "DONE"}
                  </Text>
                </View>
                {item.status === "skipped" ? (
                  <Text style={styles.historyDetail}>{item.excuse ?? "no excuse given"}</Text>
                ) : item.exercises && item.exercises.length > 0 ? (
                  <Text style={styles.historyDetail}>
                    {item.exercises.map((ex) => `${ex.exercise} ${ex.sets}x${ex.reps} @ ${ex.weight_kg}kg${ex.rpe ? ` (RPE ${ex.rpe})` : ""}`).join(", ")}
                  </Text>
                ) : (
                  <Text style={styles.historyDetail}>{item.note || "—"}</Text>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyBody}>Nothing logged yet.</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

interface WeeklyBreakdown {
  weekStart: string;
  completed: number;
  scheduled: number;
}

interface DashboardStats {
  currentStreak: number;
  weeklyBreakdown: WeeklyBreakdown[];
  perTypeCompletion: Record<string, { completed: number; skipped: number }>;
}

// Phase 5's ungated slice: current streak, trailing-4-weeks completion
// vs. plan, per-type completion — all computed server-side by the same
// history edge function History already calls (dashboardStats is a new
// field on that same response, not a second round-trip). No gamification
// beyond the streak number, per the brief's own "Phase Never until users
// ask" — no badges, no new chart library, the trend card's existing bar
// visual is reused for the weekly bars rather than reinvented.
function DashboardScreen({ onDismiss, coachAccent }: { onDismiss: () => void; coachAccent: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`${SERVER_URL}/history`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data = await res.json();
        setStats(data.dashboardStats);
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  const perType = stats ? Object.entries(stats.perTypeCompletion) : [];

  return (
    <LinearGradient colors={[colors.voidTop, colors.void]} style={styles.gradientRoot}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onDismiss} hitSlop={12} style={styles.pickerDismissTouchable} accessibilityRole="button" accessibilityLabel="Back to chat">
            <Text style={styles.pickerDismiss}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pickerIntro}>
          <Text style={styles.pickerTitle}>Dashboard</Text>
          <Text style={styles.pickerSubtitle}>Consistency, computed — not a badge in sight.</Text>
        </View>

        {loadError && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>Couldn't load the dashboard — check the connection and try again.</Text>
          </View>
        )}

        {!loadError && !stats && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>Loading…</Text>
          </View>
        )}

        {stats && (
          <View style={styles.historyList}>
            <View style={styles.statRow}>
              <Text style={[styles.statValue, { color: coachAccent }]}>{stats.currentStreak}</Text>
              <Text style={styles.statLabel}>session{stats.currentStreak === 1 ? "" : "s"} completed in a row</Text>
            </View>

            <View style={styles.trendCard}>
              <Text style={styles.trendTitle}>LAST 4 WEEKS</Text>
              <View style={styles.trendRow}>
                {stats.weeklyBreakdown.map((week, i) => (
                  <View key={i} style={styles.trendBarWrap}>
                    <View
                      style={[
                        styles.trendBar,
                        {
                          height: 8 + 60 * (week.scheduled > 0 ? Math.min(week.completed / week.scheduled, 1) : 0),
                          backgroundColor: week.completed >= week.scheduled && week.scheduled > 0 ? coachAccent : colors.textDim,
                        },
                      ]}
                    />
                    <Text style={styles.trendBarLabel}>
                      {week.completed}/{week.scheduled}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.trendCard}>
              <Text style={styles.trendTitle}>BY TYPE (LAST 4 WEEKS)</Text>
              {perType.length === 0 ? (
                <Text style={styles.emptyBody}>Nothing logged in this window yet.</Text>
              ) : (
                perType.map(([type, counts]) => (
                  <View key={type} style={styles.dashboardTypeRow}>
                    <Text style={[styles.dashboardTypeName, { color: coachAccent }]}>{type}</Text>
                    <Text style={styles.dashboardTypeCounts}>
                      {counts.completed} done · {counts.skipped} skipped
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// No per-message avatar: this is a 1:1 conversation with exactly one
// coach, not a group thread, so repeating its Orb on every line is the
// convention this design deliberately breaks from (every mainstream
// messenger already drops the avatar in 1:1 chats — only the header
// keeps one, singular, watching instrument). Coach vs. user is instead
// carried by alignment, shape, and color alone, which is a stronger,
// non-color-alone accessibility signal than an icon swap would be.
function MessageBubble({ message, coachAccent }: { message: Message; coachAccent: string }) {
  const isCoach = message.role === "assistant";
  const isError = message.status === "error";
  const spineColor = isError ? colors.danger : coachAccent;
  return (
    <View style={[styles.messageRow, isCoach ? styles.messageRowLeft : styles.messageRowRight]}>
      <View
        style={[
          styles.bubble,
          isCoach ? [styles.coachBubble, { borderLeftColor: spineColor }] : [styles.userBubble, styles.bubbleTailRight],
          isError && styles.errorBubble,
        ]}
      >
        {isCoach && (
          <Text style={[styles.entryLabel, { color: spineColor }]}>{isError ? "CONNECTION ISSUE" : formatTime(message.timestamp)}</Text>
        )}
        <Text
          testID={isCoach ? "coach-message" : "user-message"}
          style={[isCoach ? styles.bubbleTextCoach : styles.bubbleTextUser, isError && styles.errorText]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

// A blinking cursor bar, not the three-dot chat-app cliché — reads as "a
// line is being written," in keeping with the dossier/log-entry treatment
// coach bubbles already have, and its blink rate is the same per-personality
// rhythm as the Orb's speaking state rather than a fixed universal timing.
function TypingCursor({ color, durationMs, easingFn }: { color: string; durationMs: number; easingFn: (t: number) => number }) {
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: durationMs, easing: easingFn }),
        withTiming(0.25, { duration: durationMs, easing: easingFn })
      ),
      -1,
      true
    );
  }, [durationMs, easingFn, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, backgroundColor: color }));
  return <Animated.View style={[styles.typingCursor, animatedStyle]} />;
}

function TypingIndicator({ coachAccent, coachMotion }: { coachAccent: string; coachMotion: Motion }) {
  const cursorDuration = Math.max(180, coachMotion.speakingDurationMs * 0.7);
  const easingFn = EASING_BY_CHARACTER[coachMotion.character];
  return (
    <View style={[styles.messageRow, styles.messageRowLeft]} accessibilityLabel="Coach is typing">
      <View style={[styles.bubble, styles.coachBubble, { borderLeftColor: coachAccent }, styles.typingBubble]}>
        <TypingCursor color={coachAccent} durationMs={cursorDuration} easingFn={easingFn} />
      </View>
    </View>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [personality, setPersonality] = useState<PersonalityId | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [screen, setScreen] = useState<"chat" | "history" | "dashboard">("chat");
  const [pendingLog, setPendingLog] = useState<PendingLogProposal | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const sendScale = useSharedValue(1);
  const sendAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    AsyncStorage.getItem(PERSONALITY_STORAGE_KEY).then((saved) => {
      if (isPersonalityId(saved)) {
        setPersonality(saved);
      } else {
        setShowPicker(true);
      }
      setStorageLoaded(true);
    });
  }, []);

  // Headless sign-in: BRIEF-PHASE2.md rules out building a real sign-in
  // screen for this single-user app, so the one dev account signs in
  // automatically on launch. supabase-js persists the session in
  // AsyncStorage afterward, so this only actually hits the network once
  // per install, not once per launch.
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInWithPassword({
          email: SUPABASE_AUTH_EMAIL,
          password: SUPABASE_AUTH_PASSWORD,
        });
        if (error) {
          console.warn("Supabase headless sign-in failed:", error.message);
        }
      }
      setAuthReady(true);
    })();
  }, []);

  async function selectPersonality(id: PersonalityId) {
    try {
      await AsyncStorage.setItem(PERSONALITY_STORAGE_KEY, id);
    } catch (err) {
      console.warn("Failed to persist personality selection:", err);
    }
    setPersonality(id);
    setShowPicker(false);
    AccessibilityInfo.announceForAccessibility(`${personalityById(id).name} selected`);
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMessage: Message = { id: makeId(), role: "user", content: trimmed, timestamp: Date.now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          personality: personality ?? "drill-sergeant",
          pendingLog,
        }),
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();

      setPendingLog(data.pendingLog ?? null);
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: data.reply, timestamp: Date.now() }]);
    } catch (err) {
      console.error("Chat request failed:", err);
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: FALLBACK_TEXT, status: "error", timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  if (!storageLoaded || !fontsLoaded || !authReady) {
    return (
      <LinearGradient colors={[colors.voidTop, colors.void]} style={styles.gradientRoot}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (showPicker) {
    return (
      <PickerScreen
        onSelect={selectPersonality}
        canDismiss={personality !== null}
        onDismiss={() => setShowPicker(false)}
        currentId={personality}
      />
    );
  }

  const current = personalityById(personality ?? "drill-sergeant");

  if (screen === "history") {
    return <HistoryScreen onDismiss={() => setScreen("chat")} coachAccent={current.accent} />;
  }
  if (screen === "dashboard") {
    return <DashboardScreen onDismiss={() => setScreen("chat")} coachAccent={current.accent} />;
  }
  const sendDisabled = isTyping || !input.trim();

  return (
    <LinearGradient colors={[colors.voidTop, colors.void]} style={styles.gradientRoot}>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* The one watching instrument on screen — singular, not repeated
                per message — so it visibly performs (faster/larger ping)
                exactly when the coach is actually composing a reply. */}
            <Orb size={44} color={current.accent} initials={current.initials} motion={current.motion} speaking={isTyping} />
            <Text style={styles.headerTitle}>{current.name}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setScreen("history")}
              hitSlop={12}
              style={styles.headerActionTouchable}
              accessibilityRole="button"
              accessibilityLabel="View history"
            >
              <Text style={styles.headerAction}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setScreen("dashboard")}
              hitSlop={12}
              style={styles.headerActionTouchable}
              accessibilityRole="button"
              accessibilityLabel="View dashboard"
            >
              <Text style={styles.headerAction}>Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowPicker(true)}
              hitSlop={12}
              style={styles.headerActionTouchable}
              accessibilityRole="button"
              accessibilityLabel="Change coach"
            >
              <Text style={styles.headerAction}>Change coach</Text>
            </TouchableOpacity>
          </View>
        </View>
        <AccentEdge color={current.accent} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={HEADER_HEIGHT}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} coachAccent={current.accent} />}
          contentContainerStyle={[styles.messageList, messages.length === 0 && styles.messageListEmpty]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Orb size={96} color={current.accent} initials={current.initials} motion={current.motion} />
              <Text style={styles.emptyTitle}>NOTHING LOGGED YET</Text>
              <Text style={styles.emptyBody}>Say what's going on — {current.name} is listening.</Text>
            </View>
          }
          ListFooterComponent={isTyping ? <TypingIndicator coachAccent={current.accent} coachMotion={current.motion} /> : null}
        />

        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message VIGIL…"
            placeholderTextColor={colors.textPlaceholder}
            multiline
            accessibilityLabel="Message input"
          />
          <AnimatedTouchableOpacity
            testID="send-button"
            style={[styles.sendButton, sendAnimatedStyle, glow(current.accent, 0.5), { backgroundColor: current.accent }, sendDisabled && styles.sendButtonDisabled]}
            onPress={sendMessage}
            onPressIn={() => {
              sendScale.value = withTiming(0.88, { duration: 100 });
            }}
            onPressOut={() => {
              sendScale.value = withTiming(1, { duration: 150 });
            }}
            disabled={isTyping}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: isTyping }}
          >
            <Ionicons name="arrow-up" size={20} color={colors.void} />
          </AnimatedTouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientRoot: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  headerEdge: {
    height: 2,
    width: "100%",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontFamily: fonts.display.bold,
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerActionTouchable: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerAction: {
    color: colors.textDim,
    fontSize: fontSizes.xs,
    fontFamily: fonts.mono.medium,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  orbRing: {
    position: "absolute",
    borderWidth: 1,
    opacity: 0.35,
  },
  orbPing: {
    position: "absolute",
    borderWidth: 1.5,
  },
  orbCore: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.orb,
  },
  orbInitials: {
    color: colors.void,
    fontFamily: fonts.display.bold,
  },
  messageList: {
    padding: spacing.lg,
    gap: spacing.md - 2,
    flexGrow: 1,
  },
  messageListEmpty: {
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textDim,
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.xs,
    letterSpacing: 1.4,
    marginTop: spacing.lg,
  },
  emptyBody: {
    color: colors.textDim,
    fontFamily: fonts.body.regular,
    fontSize: fontSizes.sm + 1.5,
    lineHeight: 20,
    textAlign: "center",
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
  },
  coachBubble: {
    backgroundColor: colors.surface2,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
  },
  userBubble: {
    backgroundColor: colors.violet,
    borderRadius: radii.lg,
  },
  errorBubble: {
    backgroundColor: colors.dangerSoft,
  },
  bubbleTailRight: {
    borderBottomRightRadius: 4,
  },
  entryLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.xs - 1,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  bubbleTextCoach: {
    color: colors.text,
    fontSize: fontSizes.base,
    lineHeight: 20,
    fontFamily: fonts.body.regular,
  },
  bubbleTextUser: {
    color: colors.void,
    fontSize: fontSizes.base,
    lineHeight: 20,
    fontFamily: fonts.body.medium,
  },
  errorText: {
    color: colors.text,
  },
  typingBubble: {
    paddingVertical: spacing.md,
  },
  typingCursor: {
    width: 4,
    height: 16,
    borderRadius: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minHeight: touchTarget.min,
    maxHeight: 160,
    fontSize: fontSizes.base,
    fontFamily: fonts.body.regular,
    ...shadow.card,
  },
  sendButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  pickerHeader: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  pickerDismissTouchable: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    justifyContent: "center",
  },
  pickerDismiss: {
    color: colors.textDim,
    fontSize: fontSizes.base - 1,
    fontFamily: fonts.body.semiBold,
  },
  pickerIntro: {
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.md,
    marginBottom: spacing.xxl + 4,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontFamily: fonts.display.bold,
    marginBottom: spacing.xs + 2,
  },
  pickerSubtitle: {
    color: colors.textDim,
    fontSize: fontSizes.sm + 1.5,
    fontFamily: fonts.body.regular,
  },
  pickerCards: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  pickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 4,
    borderRadius: radii.xl,
    padding: spacing.lg,
    minHeight: 84,
  },
  pickerCardText: {
    flex: 1,
  },
  pickerCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 3,
    flexWrap: "wrap",
  },
  pickerCardName: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontFamily: fonts.display.semiBold,
  },
  currentBadge: {
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
  currentBadgeText: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.xs - 1.5,
    letterSpacing: 0.3,
  },
  pickerCardTag: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.xs - 1,
    letterSpacing: 1,
    marginBottom: 4,
  },
  pickerCardEthos: {
    color: colors.textDim,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    fontFamily: fonts.body.regular,
  },
  historyList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  trendCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  trendTitle: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.xs,
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    minHeight: 76,
  },
  trendBarWrap: {
    alignItems: "center",
    gap: spacing.xs,
  },
  trendBar: {
    width: 14,
    borderRadius: radii.sm,
  },
  trendBarLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono.regular,
    fontSize: fontSizes.xs - 2,
  },
  statRow: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  statValue: {
    fontFamily: fonts.display.bold,
    fontSize: 48,
  },
  statLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono.regular,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
  },
  dashboardTypeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  dashboardTypeName: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.sm,
    letterSpacing: 0.8,
  },
  dashboardTypeCounts: {
    color: colors.textDim,
    fontFamily: fonts.mono.regular,
    fontSize: fontSizes.xs,
  },
  historyRow: {
    backgroundColor: colors.surface2,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    padding: spacing.md,
  },
  historyRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  historyDate: {
    color: colors.text,
    fontFamily: fonts.body.medium,
    fontSize: fontSizes.sm,
  },
  historyBadge: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSizes.xs - 1,
    letterSpacing: 0.6,
  },
  historyBadgeSkipped: {
    color: colors.danger,
  },
  historyDetail: {
    color: colors.textDim,
    fontFamily: fonts.body.regular,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});
