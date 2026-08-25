/**
 * Education Article Detail Screen
 * View individual educational articles
 */

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useTranslation } from '../../src/i18n';
import { spacing, typography } from '../../src/theme/tokens';
import { getContent, toggleBookmark, isBookmarked, updateReadingProgress, markArticleComplete } from '../../src/db/repositories/education';

export default function EducationDetailScreen() {
  const { colors, typography: typ } = useTheme();
  const t = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const lastScrollTime = React.useRef(Date.now());

  useEffect(() => {
    async function loadArticle() {
      if (!slug) return;

      try {
        const data = await getContent(slug);
        setArticle(data);

        // Check bookmark status
        const isBm = await isBookmarked('user', data.id);
        setBookmarked(isBm);

        // Get reading progress
        const progress = await getReadingProgress('user', data.id);
        setReadingProgress(progress);
      } catch (error) {
        console.error('Failed to load article:', error);
        Alert.alert(t.common.error, 'Failed to load article content.');
        router.back();
      } finally {
        setLoading(false);
      }
    }

    loadArticle();
  }, [slug]);

  // Track reading time
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastScrollTime.current) / 1000;
      setTimeSpent(prev => prev + elapsed);
      lastScrollTime.current = now;
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleBookmarkToggle = async () => {
    if (!article) return;

    const wasBookmarked = await toggleBookmark('user', article.id);
    setBookmarked(!wasBookmarked);
    
    Alert.alert(
      t.education.bookmarkTitle,
      wasBookmarked ? t.education.removedFromBookmarks : t.education.addedToBookmarks,
      [{ text: t.common.ok }]
    );
  };

  const handleScrolled = (event: any) => {
    if (!article) return;

    const scrollY = event.nativeEvent.contentOffset.y;
    const maxScroll = event.nativeEvent.contentSize.height - event.nativeEvent.layoutMeasurement.height;
    const progress = Math.min(Math.round((scrollY / maxScroll) * 100), 100);
    
    setReadingProgress(progress);

    // Update database every 10%
    if (progress % 10 === 0 && progress > readingProgress) {
      updateReadingProgress('user', article.id, progress);
    }
  };

  const handleFinishedReading = async () => {
    if (!article) return;

    await markArticleComplete('user', article.id, timeSpent);
    Alert.alert(t.education.completed, t.education.congratulationsRead, [{ text: t.common.ok }]);
  };

  if (loading || !article) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  const langContent = article.content_ur || article.content_en;
  const title = article.title_ur || article.title_en;
  const summary = article.summary_ur || article.summary_en;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <StatusBar barStyle={typ.style.darkMode ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background.surface, borderBottomColor: colors.border.default, borderBottomWidth: 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          
          <View style={{ flex: 1, marginHorizontal: spacing.md }}>
            <Text style={[typ.heading.sm, { color: colors.text.primary, numberOfLines: 2 }]}>{title}</Text>
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

      {/* Progress Bar */}
      {readingProgress > 0 && (
        <View style={{ height: 3, backgroundColor: colors.border.default }}>
          <View 
            style={{ 
              width: `${readingProgress}%`, 
              backgroundColor: colors.accent.primary,
              height: '100%',
            }} 
          />
        </View>
      )}

      <ScrollView 
        style={{ flex: 1 }}
        onScroll={handleScrolled}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: spacing.xl + 40 }}
      >
        {/* Meta Info */}
        <View style={[styles.metaBar, { borderTopColor: colors.border.default, borderBottomColor: colors.border.default }]}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={colors.text.disabled} />
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                ~{article.read_time_minutes} {t.common.min}
              </Text>
            </View>
            
            {summary && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <MaterialCommunityIcons name="information-outline" size={16} color={colors.text.disabled} />
                <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                  {summary.length} chars
                </Text>
              </View>
            )}
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <MaterialCommunityIcons name="eye-outline" size={16} color={colors.text.disabled} />
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                {article.view_count} {t.education.views}
              </Text>
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: spacing.base, paddingVertical: spacing.lg }}>
          {/* Author Section */}
          {article.author && (
            <View style={{ marginBottom: spacing.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <MaterialCommunityIcons name="account-edit" size={16} color={colors.accent.primary} />
                <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                  {t.education.by} {article.author}
                </Text>
              </View>
            </View>
          )}

          {/* Article Body */}
          <Text style={[typ.body.lg, { color: colors.text.primary, lineHeight: 28 }]}>
            {langContent}
          </Text>

          {/* Completion Button */}
          {readingProgress >= 100 && (
            <TouchableOpacity
              style={[styles.completeBtn, { backgroundColor: colors.accent.primary, marginTop: spacing.xl }]}
              onPress={handleFinishedReading}
              activeOpacity={0.9}
            >
              <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text style={[typ.label.md, { color: '#FFFFFF', marginLeft: spacing.sm }]}>
                {t.education.markComplete}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = {
  header: {
    paddingTop: spacing.lg + spacing.xs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  metaBar: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
};
