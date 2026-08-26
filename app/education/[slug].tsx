/**
 * Education Article Detail Screen
 * View individual educational articles with bookmark + reading progress
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import {
  getContent,
  toggleBookmark,
  isBookmarked,
  getReadingProgress,
  updateReadingProgress,
  markArticleComplete,
  type EducationContent,
} from '../../src/db/repositories/education';

/** Local single-user identifier for bookmarks/reading history */
const LOCAL_USER_ID = 'local-user';

type ContentBlock = { type: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string };

/** Parse simple HTML (h1-h3, p, li) into renderable blocks */
function parseHtmlBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const tagRegex = /<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1];
    const inner = match[2];
    if (!tag || inner === undefined) continue;
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (text) {
      blocks.push({ type: tag.toLowerCase() as ContentBlock['type'], text });
    }
  }

  // Fallback: strip all tags and render as a single paragraph
  if (blocks.length === 0) {
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain) blocks.push({ type: 'p', text: plain });
  }

  return blocks;
}

export default function EducationDetailScreen() {
  const { colors, typography: typ, spacing, isDark } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [article, setArticle] = useState<EducationContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    async function loadArticle() {
      if (!slug) return;

      try {
        const data = await getContent(slug);
        if (!data) {
          Alert.alert(t.common.error, t.education.noArticlesMessage);
          router.back();
          return;
        }

        setArticle(data);

        const [isBm, progress] = await Promise.all([
          isBookmarked(LOCAL_USER_ID, data.id),
          getReadingProgress(LOCAL_USER_ID, data.id),
        ]);
        setBookmarked(isBm);
        setReadingProgress(progress);
      } catch (error) {
        console.error('Failed to load article:', error);
        Alert.alert(t.common.error, t.education.noArticlesMessage);
        router.back();
      } finally {
        setLoading(false);
      }
    }

    loadArticle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Track reading time while the article is open
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(Math.round((Date.now() - openedAt.current) / 1000));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleBookmarkToggle = async () => {
    if (!article) return;

    try {
      const isNowBookmarked = await toggleBookmark(LOCAL_USER_ID, article.id);
      setBookmarked(isNowBookmarked);

      Alert.alert(
        t.education.bookmarkTitle,
        isNowBookmarked ? t.education.addedToBookmarks : t.education.removedFromBookmarks,
        [{ text: t.common.ok }],
      );
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  const handleScrolled = (event: any) => {
    if (!article) return;

    const scrollY = event.nativeEvent.contentOffset.y;
    const maxScroll =
      event.nativeEvent.contentSize.height - event.nativeEvent.layoutMeasurement.height;
    if (maxScroll <= 0) return;

    const progress = Math.min(Math.max(Math.round((scrollY / maxScroll) * 100), 0), 100);
    setReadingProgress((prev) => {
      if (progress > prev && progress % 10 === 0) {
        updateReadingProgress(LOCAL_USER_ID, article.id, progress);
      }
      return Math.max(prev, progress);
    });
  };

  const handleFinishedReading = async () => {
    if (!article) return;

    try {
      await updateReadingProgress(LOCAL_USER_ID, article.id, 100, timeSpent);
      await markArticleComplete(LOCAL_USER_ID, article.id, timeSpent);
      setCompleted(true);
      Alert.alert(t.education.completed, t.education.congratulationsRead, [{ text: t.common.ok }]);
    } catch (error) {
      console.error('Failed to mark article complete:', error);
    }
  };

  if (loading || !article) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  const title = language === 'ur' ? article.title_ur || article.title_en : article.title_en;
  const summary = language === 'ur' ? article.summary_ur || article.summary_en : article.summary_en;
  const body = language === 'ur' ? article.content_ur || article.content_en : article.content_en;
  const blocks = parseHtmlBlocks(body ?? '');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
      {/* Header */}
      <View
        style={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.sm,
          backgroundColor: colors.background.surface,
          borderBottomColor: colors.border.default,
          borderBottomWidth: 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 4 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={isRTL ? 'arrow-right' : 'arrow-left'}
              size={24}
              color={colors.text.primary}
            />
          </TouchableOpacity>

          <View style={{ flex: 1, marginHorizontal: spacing.md }}>
            <Text numberOfLines={2} style={[typ.heading.h4, { color: colors.text.primary }]}>
              {title}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleBookmarkToggle}
            style={{ padding: 4 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons
              name={bookmarked ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={bookmarked ? colors.accent.primary : colors.text.secondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Reading progress bar */}
      <View style={{ height: 3, backgroundColor: colors.border.default }}>
        <View
          style={{
            width: `${readingProgress}%`,
            backgroundColor: colors.accent.primary,
            height: '100%',
          }}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        onScroll={handleScrolled}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: spacing.xl + 40 }}
      >
        {/* Meta info */}
        <View
          style={{
            borderBottomWidth: 1,
            borderTopWidth: 1,
            borderColor: colors.border.default,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.base,
            flexDirection: 'row',
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text.disabled} />
            <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
              ~{article.read_time_minutes} {t.education.min}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <MaterialCommunityIcons name="eye-outline" size={16} color={colors.text.disabled} />
            <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
              {article.view_count} {t.education.views}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: spacing.base, paddingVertical: spacing.lg }}>
          {article.author && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
              <MaterialCommunityIcons name="account-edit" size={16} color={colors.accent.primary} />
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                {t.education.by} {article.author}
              </Text>
            </View>
          )}

          {summary && (
            <Text style={[typ.body.lg, { color: colors.text.secondary, marginBottom: spacing.lg }]}>
              {summary}
            </Text>
          )}

          {blocks.map((block, index) => {
            if (block.type === 'h1') {
              return (
                <Text key={index} style={[typ.heading.h3, { color: colors.text.primary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                  {block.text}
                </Text>
              );
            }
            if (block.type === 'h2' || block.type === 'h3') {
              return (
                <Text key={index} style={[typ.heading.h4, { color: colors.text.primary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                  {block.text}
                </Text>
              );
            }
            if (block.type === 'li') {
              return (
                <View key={index} style={{ flexDirection: 'row', marginBottom: spacing.xs, paddingLeft: spacing.sm }}>
                  <Text style={[typ.body.lg, { color: colors.text.primary, minWidth: 16 }]}>•</Text>
                  <Text style={[typ.body.lg, { color: colors.text.primary, flex: 1 }]}>
                    {block.text}
                  </Text>
                </View>
              );
            }
            return (
              <Text key={index} style={[typ.body.lg, { color: colors.text.primary, marginBottom: spacing.md }]}>
                {block.text}
              </Text>
            );
          })}

          {/* Completion button */}
          {readingProgress >= 100 && !completed && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                borderRadius: 8,
                backgroundColor: colors.accent.primary,
                marginTop: spacing.xl,
              }}
              onPress={handleFinishedReading}
              activeOpacity={0.9}
            >
              <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text style={[typ.label.base, { color: '#FFFFFF', marginLeft: spacing.sm }]}>
                {t.education.markComplete}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
