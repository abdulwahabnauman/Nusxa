/**
 * Education Library Tab
 * Browse medication guides and educational content by category
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { EmptyState } from '../../src/components/ui/EmptyState';
import {
  getCategories,
  getContentByCategory,
  getAllContent,
  type EducationCategoryDisplay,
  type EducationContent,
} from '../../src/db/repositories/education';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Resolve a stored icon name to a valid glyph, falling back gracefully */
function resolveIcon(name: string): IconName {
  return name in MaterialCommunityIcons.glyphMap ? (name as IconName) : 'book-outline';
}

export default function EducationScreen() {
  const { colors, typography: typ, spacing } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<EducationCategoryDisplay[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [articles, setArticles] = useState<EducationContent[]>([]);

  // Load categories (re-run when language changes)
  useEffect(() => {
    async function loadCategories() {
      try {
        const catData = await getCategories(language);
        setCategories(catData);
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, [language]);

  // Load articles: all when no category selected, filtered otherwise
  useEffect(() => {
    async function loadArticles() {
      try {
        const data = selectedCategory
          ? await getContentByCategory(selectedCategory, language)
          : await getAllContent();
        setArticles(data);
      } catch (error) {
        console.error('Failed to load articles:', error);
        setArticles([]);
      }
    }
    loadArticles();
  }, [selectedCategory, language]);

  const handleSelectCategory = useCallback((categoryId: number) => {
    setSelectedCategory((current) => (current === categoryId ? null : categoryId));
  }, []);

  const handleReadArticle = (slug: string) => {
    router.push(`/education/${slug}`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.background.surface }}>
        <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.education.title}</Text>
        <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.education.subtitle}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl + 20 }}
      >
        {/* Category chips */}
        <View style={{ paddingVertical: spacing.md }}>
          <Text style={[typ.label.base, { color: colors.text.secondary, paddingHorizontal: spacing.base }]}>
            {t.education.categories}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: spacing.sm }}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.base }}
          >
            {categories.map((category) => {
              const isSelected = selectedCategory === category.id;

              return (
                <TouchableOpacity
                  key={category.id}
                  style={{
                    minWidth: 120,
                    minHeight: 108,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    padding: spacing.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.sm,
                    backgroundColor: isSelected ? category.color : colors.background.subtle,
                    borderColor: isSelected ? category.color : colors.border.default,
                  }}
                  onPress={() => handleSelectCategory(category.id)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={resolveIcon(category.icon_name)}
                    size={28}
                    color={isSelected ? '#FFFFFF' : colors.text.primary}
                  />
                  <Text
                    numberOfLines={2}
                    style={[
                      typ.label.base,
                      { color: isSelected ? '#FFFFFF' : colors.text.primary, textAlign: 'center' },
                    ]}
                  >
                    {category.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {categories.length === 0 && (
            <View style={{ alignItems: 'center', paddingHorizontal: 40, paddingTop: spacing.md }}>
              <MaterialCommunityIcons name="book-open-page-variant" size={48} color={colors.text.disabled} />
              <Text style={[typ.body.base, { color: colors.text.disabled }]}>
                {t.education.noCategories}
              </Text>
            </View>
          )}
        </View>

        {/* Articles */}
        <View style={{ paddingVertical: spacing.md }}>
          <Text style={[typ.label.base, { color: colors.text.secondary, paddingHorizontal: spacing.base }]}>
            {selectedCategory ? t.education.articlesInCategory : t.education.popularArticles}
          </Text>

          {articles.length > 0 ? (
            <View style={{ marginTop: spacing.sm, paddingHorizontal: spacing.base, gap: spacing.sm }}>
              {articles.map((article) => {
                const title = language === 'ur'
                  ? article.title_ur || article.title_en
                  : article.title_en;
                const summary = language === 'ur'
                  ? article.summary_ur || article.summary_en
                  : article.summary_en;

                return (
                  <TouchableOpacity
                    key={article.id}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      backgroundColor: colors.background.subtle,
                      borderColor: colors.border.default,
                      padding: spacing.md,
                    }}
                    onPress={() => handleReadArticle(article.slug)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={[typ.label.base, { color: colors.text.primary, marginBottom: spacing.xs }]}>
                          {title}
                        </Text>

                        {!!summary && (
                          <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                            {summary}
                          </Text>
                        )}
                      </View>

                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={colors.text.disabled}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm }}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color={colors.text.disabled} />
                      <Text style={[typ.body.xs, { color: colors.text.disabled }]}>
                        {article.read_time_minutes} {t.education.min}
                      </Text>

                      {article.view_count > 0 && (
                        <>
                          <MaterialCommunityIcons name="eye-outline" size={14} color={colors.text.disabled} />
                          <Text style={[typ.body.xs, { color: colors.text.disabled }]}>
                            {article.view_count} {t.education.views}
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <EmptyState
              icon="book-open-page-variant"
              title={t.education.noArticles}
              description={t.education.noArticlesMessage}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
