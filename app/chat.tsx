import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../src/theme/provider';
import { useI18n } from '../src/i18n';
import { useReducedMotion } from '../src/hooks/useReducedMotion';
import { ChatMessage } from '../src/ai/types';
import { resolveTextProviderKeys } from '../src/utils/secureStorage';
import { isAiProxyConfigured } from '../src/constants/config';
import { CHAT_SYSTEM_PROMPT, buildChatContext } from '../src/ai/prompts';
import { MarkdownText } from '../src/components/ui/MarkdownText';
import { showToast } from '../src/components/ui/GlobalToast';
import { loadChatHistory, saveChatHistory, clearChatHistory } from '../src/utils/chatHistory';
import { getActiveMedicines } from '../src/db/repositories/medicine';

/** One pulsing dot for the "assistant is typing" bubble */
function TypingDot({ color, delay }: { color: string; delay: number }) {
  const pulse = useSharedValue(0.3);
  useEffect(() => {
    pulse.value = withRepeat(
      withDelay(
        delay,
        withSequence(
          withTiming(1, { duration: 350 }),
          withTiming(0.3, { duration: 350 }),
        ),
      ),
      -1,
      false,
    );
  }, [delay, pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.7 + pulse.value * 0.3 }],
  }));
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]}
    />
  );
}

export default function ChatScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Deep-link context from the medicine detail screen ("Ask AI about this
  // medicine") — previously passed but silently ignored (audit B2).
  const { medicineName } = useLocalSearchParams<{ medicineName?: string }>();
  const reducedMotion = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Last failed user question, so the error state can offer a real retry
  const [failedText, setFailedText] = useState<string | null>(null);
  // Whether the on-screen keyboard is up — drives the input bar padding so
  // the text being typed is never hidden behind the keyboard (edge-to-edge
  // Android ignores adjustResize, so we handle it ourselves on both OSes).
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Word-by-word reveal of the latest assistant answer
  const [reveal, setReveal] = useState<{ id: string; count: number } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const hydratedRef = useRef(false);

  // Restore persisted history + load the user's real medicine list so the
  // assistant actually knows what the user is taking.
  useEffect(() => {
    (async () => {
      const history = await loadChatHistory();
      setMessages(history);
      hydratedRef.current = true;
    })();
  }, []);

  const [medicines, setMedicines] = useState<
    Array<{ name: string | null; dosage: string | null; frequency: string | null; meal_instruction: string | null; purpose: string | null }>
  >([]);
  useEffect(() => {
    getActiveMedicines()
      .then(setMedicines)
      .catch(() => {});
  }, []);

  // Persist every change (except the initial empty state before hydration).
  useEffect(() => {
    if (hydratedRef.current) {
      saveChatHistory(messages);
    }
  }, [messages]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Keep the latest message (and what's being typed) in view above the keyboard
  useEffect(() => {
    if (!keyboardVisible) return;
    const timer = setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [keyboardVisible]);

  const systemPrompt = useMemo(() => {
    const context = `${CHAT_SYSTEM_PROMPT}\n\n${buildChatContext(medicines)}`;
    // When opened from a medicine detail screen, tell the assistant what the
    // user is looking at so answers are immediately relevant.
    if (medicineName) {
      return `${context}\n\nThe user is currently viewing the medicine "${medicineName}" and their questions are most likely about it. Prioritize information about this medicine when relevant.`;
    }
    return context;
  }, [medicines, medicineName]);

  // Reveal the newest assistant answer a few words at a time
  useEffect(() => {
    if (!reveal || reducedMotion) return;
    const target = messages.find((m) => m.id === reveal.id);
    if (!target || reveal.count >= target.content.split(/\s+/).length) {
      setReveal(null);
      return;
    }
    const timer = setTimeout(() => {
      setReveal((r) => (r && r.id === target.id ? { ...r, count: r.count + 3 } : r));
    }, 70);
    return () => clearTimeout(timer);
  }, [reveal, messages, reducedMotion]);

  const displayedContent = (msg: ChatMessage): string => {
    if (reveal && reveal.id === msg.id && !reducedMotion) {
      return msg.content.split(/\s+/).slice(0, reveal.count).join(' ');
    }
    return msg.content;
  };

  const suggestions = useMemo(
    () => [t.chat.chipPurpose, t.chat.chipSideEffects, t.chat.chipHowToTake, t.chat.chipInteractions],
    [t]
  );

  const handleClear = () => {
    Alert.alert(
      t.chat.clearTitle,
      t.chat.clearMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            setMessages([]);
            await clearChatHistory();
          },
        },
      ]
    );
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await Clipboard.setStringAsync(content);
      showToast(t.chat.copiedToast, 'success');
    } catch {
      // clipboard failures are non-critical
    }
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;
    setFailedText(null);
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const keys = await resolveTextProviderKeys();
      if (!isAiProxyConfigured() && !keys.openRouterKey && !keys.groqKey) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: t.chat.errorNoKey,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      const chatMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: text },
      ];

      // Lazy-load the AI client so opening the chat never pays for the
      // network stack up front.
      const { multiTurnChat } = require('../src/ai/client') as typeof import('../src/ai/client');
      const response = await multiTurnChat(chatMessages, keys);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (!reducedMotion) setReveal({ id: assistantMsg.id, count: 3 });
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t.chat.errorRetryMsg,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      // Never a dead-end: offer a one-tap retry for the failed question
      setFailedText(text);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendText(input);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      edges={['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.inner}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border.default, paddingHorizontal: spacing.base }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              {t.chat.companionTitle}
            </Text>
            <Text style={[typography.body.xs, { color: colors.text.secondary }]}>
              {t.chat.companionSubtitle}
            </Text>
          </View>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              accessibilityLabel="Clear chat history"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="delete-outline" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Context banner when opened from a medicine detail screen */}
        {medicineName ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              marginHorizontal: spacing.base,
              marginTop: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: borderRadius.md,
              backgroundColor: colors.accent.subtle,
            }}
          >
            <MaterialCommunityIcons name="pill" size={16} color={colors.accent.primary} />
            <Text style={[typography.label.sm, { color: colors.accent.primary, flex: 1 }]} numberOfLines={1}>
              {t.chat.contextBanner.replace('{name}', medicineName)}
            </Text>
          </View>
        ) : null}

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={{ padding: spacing.base, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.welcomeMessage}>
              <Text style={[typography.body.base, { color: colors.text.secondary, textAlign: 'center' }]}>
                {t.chat.welcome}
              </Text>
              <Text style={[typography.body.sm, { color: colors.text.disabled, textAlign: 'center', marginTop: 8 }]}>
                {t.chat.disclaimer}
              </Text>
              {/* Suggested questions */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md }}>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => sendText(s)}
                    disabled={loading}
                    style={{
                      backgroundColor: colors.background.surface,
                      borderColor: colors.border.default,
                      borderWidth: 1,
                      borderRadius: borderRadius.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={s}
                  >
                    <Text style={[typography.body.sm, { color: colors.accent.primary }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.role === 'user'
                  ? { backgroundColor: colors.accent.primary, alignSelf: 'flex-end' }
                  : { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderWidth: 1, alignSelf: 'flex-start' },
                { borderRadius: borderRadius.lg, maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10 },
              ]}
            >
              <View>
                <MarkdownText
                  content={displayedContent(msg)}
                  textColor={msg.role === 'user' ? '#FFFFFF' : colors.text.primary}
                />
              </View>
              {/* Copy button on assistant answers */}
              {msg.role === 'assistant' && (!reveal || reveal.id !== msg.id) && (
                <TouchableOpacity
                  onPress={() => handleCopyMessage(msg.content)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ alignSelf: 'flex-end', marginTop: 4, padding: 2 }}
                  accessibilityLabel={t.chat.copyMessage}
                >
                  <MaterialCommunityIcons name="content-copy" size={14} color={colors.text.disabled} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* One-tap retry after a failed AI call — never a dead end */}
          {failedText && !loading && (
            <TouchableOpacity
              onPress={() => sendText(failedText)}
              style={{
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: borderRadius.md,
                backgroundColor: colors.accent.subtle,
              }}
              accessibilityLabel={t.common.retry}
            >
              <MaterialCommunityIcons name="refresh" size={16} color={colors.accent.primary} />
              <Text style={[typography.label.sm, { color: colors.accent.primary }]}>{t.common.retry}</Text>
            </TouchableOpacity>
          )}

          {loading && (
            <View style={[styles.messageBubble, { backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.lg, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 12 }]}>
              {reducedMotion ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[0, 150, 300].map((d) => (
                    <TypingDot key={d} color={colors.accent.primary} delay={d} />
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={[styles.inputContainer, { borderTopColor: colors.border.default, backgroundColor: colors.background.surface, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, paddingBottom: keyboardVisible ? spacing.sm : Math.max(spacing.sm, insets.bottom) }]}>
          <TextInput
            style={[
              styles.textInput,
              typography.body.base,
              {
                backgroundColor: colors.background.subtle,
                color: colors.text.primary,
                borderRadius: borderRadius.md,
                paddingHorizontal: spacing.md,
                borderColor: colors.border.default,
              },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder={t.chat.placeholder}
            placeholderTextColor={colors.text.disabled}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Type your question"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: input.trim() ? colors.accent.primary : colors.border.default },
            ]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
            accessibilityLabel="Send message"
          >
            <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  messagesContainer: { flex: 1 },
  welcomeMessage: {
    paddingVertical: 32,
  },
  messageBubble: {},
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    paddingVertical: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});