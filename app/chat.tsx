import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { ChatMessage } from '../src/ai/types';
import { multiTurnChat } from '../src/ai/client';
import { resolveOpenRouterKey } from '../src/utils/secureStorage';
import { CHAT_SYSTEM_PROMPT, buildChatContext } from '../src/ai/prompts';

export default function ChatScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const systemPrompt = `${CHAT_SYSTEM_PROMPT}\n\n${buildChatContext([])}`;

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiKey = await resolveOpenRouterKey();
      if (!apiKey) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'I am unable to connect to the AI service right now. Please configure your API key in the settings to use the companion feature.',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      const chatMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: userMsg.content },
      ];

      const response = await multiTurnChat(chatMessages, apiKey);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I had trouble responding. Please try again in a moment.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
        keyboardVerticalOffset={80}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border.default, paddingHorizontal: spacing.base }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ marginLeft: 12 }}>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              Nusxa Companion
            </Text>
            <Text style={[typography.body.xs, { color: colors.text.secondary }]}>
              Ask about your medicines
            </Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={{ padding: spacing.base, gap: spacing.md }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.welcomeMessage}>
              <Text style={[typography.body.base, { color: colors.text.secondary, textAlign: 'center' }]}>
                Hi! I'm your Nusxa companion. Ask me anything about your medicines, schedules, or prescriptions.
              </Text>
              <Text style={[typography.body.sm, { color: colors.text.disabled, textAlign: 'center', marginTop: 8 }]}>
                I provide general information, not medical advice.
              </Text>
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
              <Text
                style={[
                  typography.body.sm,
                  { color: msg.role === 'user' ? '#FFFFFF' : colors.text.primary },
                ]}
              >
                {msg.content}
              </Text>
            </View>
          ))}

          {loading && (
            <View style={[styles.messageBubble, { backgroundColor: colors.background.surface, borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.lg, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10 }]}>
              <ActivityIndicator size="small" color={colors.accent.primary} />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={[styles.inputContainer, { borderTopColor: colors.border.default, backgroundColor: colors.background.surface, paddingHorizontal: spacing.base, paddingVertical: spacing.sm }]}>
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
            placeholder="Ask about your medicines..."
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