import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SERVER_URL } from "./config";
import { PERSONALITIES, personalityById, type PersonalityId } from "./personalities";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
}

const HEADER_HEIGHT = 72;
const PERSONALITY_STORAGE_KEY = "vigil.personality";

function isPersonalityId(value: string | null): value is PersonalityId {
  return PERSONALITIES.some((p) => p.id === value);
}

const colors = {
  void: "#0A0A0F",
  surface: "#141419",
  surface2: "#1C1C24",
  border: "#2A2A34",
  text: "#F2F1F7",
  textDim: "#96959F",
  textFaint: "#5C5B66",
  violet: "#7C6FFF",
  violetDim: "#463F8F",
  mint: "#4CE0B3",
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Orb({ size = 32, color, initials }: { size?: number; color?: string; initials?: string }) {
  return (
    <View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color ?? colors.violet,
          shadowColor: color ?? colors.violet,
        },
      ]}
    >
      {initials && <Text style={[styles.orbInitials, { fontSize: size * 0.38 }]}>{initials}</Text>}
    </View>
  );
}

function PickerScreen({ onSelect, canDismiss, onDismiss }: { onSelect: (id: PersonalityId) => void; canDismiss: boolean; onDismiss: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.pickerHeader}>
        {canDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={12}>
            <Text style={styles.pickerDismiss}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.pickerIntro}>
        <Text style={styles.pickerTitle}>Choose your coach</Text>
        <Text style={styles.pickerSubtitle}>You can change this later.</Text>
      </View>
      <View style={styles.pickerCards}>
        {PERSONALITIES.map((p) => (
          <TouchableOpacity key={p.id} style={styles.pickerCard} onPress={() => onSelect(p.id)} activeOpacity={0.8}>
            <Orb size={44} color={p.accent} initials={p.initials} />
            <View style={styles.pickerCardText}>
              <Text style={styles.pickerCardName}>{p.name}</Text>
              <Text style={styles.pickerCardEthos}>{p.ethos}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function MessageBubble({ message, coachAccent, coachInitials }: { message: Message; coachAccent: string; coachInitials: string }) {
  const isCoach = message.role === "assistant";
  return (
    <View style={[styles.messageRow, isCoach ? styles.messageRowLeft : styles.messageRowRight]}>
      {isCoach && <Orb size={28} color={coachAccent} initials={coachInitials} />}
      <View
        style={[
          styles.bubble,
          isCoach ? styles.coachBubble : styles.userBubble,
          isCoach ? styles.bubbleTailLeft : styles.bubbleTailRight,
        ]}
      >
        <Text style={isCoach ? styles.bubbleTextCoach : styles.bubbleTextUser}>{message.content}</Text>
      </View>
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.typingDot, { opacity }]} />;
}

function TypingIndicator({ coachAccent, coachInitials }: { coachAccent: string; coachInitials: string }) {
  return (
    <View style={[styles.messageRow, styles.messageRowLeft]}>
      <Orb size={28} color={coachAccent} initials={coachInitials} />
      <View style={[styles.bubble, styles.coachBubble, styles.bubbleTailLeft, styles.typingBubble]}>
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
    </View>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [personality, setPersonality] = useState<PersonalityId | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    AsyncStorage.getItem(PERSONALITY_STORAGE_KEY).then((saved) => {
      if (isPersonalityId(saved)) {
        setPersonality(saved);
      } else {
        setShowPicker(true);
      }
      setLoaded(true);
    });
  }, []);

  async function selectPersonality(id: PersonalityId) {
    // Applies the selection immediately either way — a storage failure
    // (full disk, permission revoked) shouldn't block using the app for
    // this session, it just means the pick won't survive a cold start.
    // Logged, not surfaced: not worth a user-facing error for a
    // preference write, but silently losing the pick with no trace
    // anywhere would make the next cold start's forced re-picker
    // confusing to debug.
    try {
      await AsyncStorage.setItem(PERSONALITY_STORAGE_KEY, id);
    } catch (err) {
      console.warn("Failed to persist personality selection:", err);
    }
    setPersonality(id);
    setShowPicker(false);
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMessage: Message = { id: makeId(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    try {
      const res = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          personality: personality ?? "drill-sergeant",
        }),
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();

      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: "(couldn't reach the coach — check the server and try again)" },
      ]);
    } finally {
      setIsTyping(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  if (!loaded) {
    return <SafeAreaView style={styles.safeArea}><StatusBar style="light" /></SafeAreaView>;
  }

  if (showPicker) {
    return (
      <PickerScreen
        onSelect={selectPersonality}
        canDismiss={personality !== null}
        onDismiss={() => setShowPicker(false)}
      />
    );
  }

  const current = personalityById(personality ?? "drill-sergeant");

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Orb size={22} color={current.accent} initials={current.initials} />
          <View>
            <Text style={styles.headerTitle}>VIGIL · {current.shortLabel}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>LIVE</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowPicker(true)} hitSlop={12}>
          <Text style={styles.headerAction}>Change coach</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={HEADER_HEIGHT}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} coachAccent={current.accent} coachInitials={current.initials} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={isTyping ? <TypingIndicator coachAccent={current.accent} coachInitials={current.initials} /> : null}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message VIGIL…"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={isTyping}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.void,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.void,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  headerAction: {
    color: colors.textDim,
    fontSize: 12.5,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mint,
  },
  statusText: {
    color: colors.mint,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  orb: {
    backgroundColor: colors.violet,
    shadowColor: colors.violet,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  orbInitials: {
    color: colors.void,
    fontWeight: "700",
  },
  messageList: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  coachBubble: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userBubble: {
    backgroundColor: colors.violet,
  },
  bubbleTailLeft: {
    borderBottomLeftRadius: 4,
  },
  bubbleTailRight: {
    borderBottomRightRadius: 4,
  },
  bubbleTextCoach: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: colors.void,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  typingBubble: {
    flexDirection: "row",
    gap: 4,
    paddingVertical: 14,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.void,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: colors.violet,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonText: {
    color: colors.void,
    fontWeight: "700",
  },
  pickerHeader: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  pickerDismiss: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: "600",
  },
  pickerIntro: {
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 28,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 6,
  },
  pickerSubtitle: {
    color: colors.textDim,
    fontSize: 14,
  },
  pickerCards: {
    paddingHorizontal: 20,
    gap: 12,
  },
  pickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  pickerCardText: {
    flex: 1,
  },
  pickerCardName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 3,
  },
  pickerCardEthos: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
});
