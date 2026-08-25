/**
 * Education Library Screen
 * Browse medication guides and educational content
 */

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { useTranslation } from '../src/i18n';
import { typography } from '../src/theme/tokens';
import { Card } from '../src/components/ui/Card';
import { EmptyState } from '../src/components/ui/EmptyState';
import { getContentByCategory, getCategories, type EducationContent } from '../src/db/repositories/education';

interface Category {
  id: number;
  slug: string;
  title: string;
  description?: string;
  icon_name: string;
  color: string;
}

export default function EducationScreen() {
  const { colors, typography: typ } = useTheme();
  const t = useTranslation();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [articles, setArticles] = useState<EducationContent[]>([]);

  // Load categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const catData = await getCategories();
        setCategories(catData);
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCategories();
  }, []);

  // Load articles when category changes
  useEffect(() => {
    async function loadArticles() {
      if (!selectedCategory) {
        setArticles([]);
        return;
      }

      try {
        const data = await getContentByCategory(selectedCategory);
        setArticles(data);
      } catch (error) {
        console.error('Failed to load articles:', error);
        setArticles([]);
      }
    }
    loadArticles();
  }, [selectedCategory]);

  const handleSelectCategory = (categoryId: number) => {
    setSelectedCategory(categoryId === selectedCategory ? null : categoryId);
  };

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
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <StatusBar barStyle={typ.style.darkMode ? 'light-content' : 'dark-content'} />
      
      <View style={[styles.header, { backgroundColor: colors.background.surface }]}>
        <Text style={[typ.heading.md, { color: colors.text.primary }]}>{t.education.title}</Text>
        <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.education.subtitle}</Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl + 20 }}
      >
        {/* Featured Categories */}
        {!selectedCategory && (
          <View style={{ paddingVertical: spacing.md }}>
            <Text style={[typ.label.lg, { color: colors.text.secondary, paddingHorizontal: spacing.base }]}>
              {t.education.categories}
            </Text>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: spacing.sm, paddingHorizontal: spacing.base }}
              contentContainerStyle={{ gap: spacing.sm }}
            >
              {categories.map((category) => {
                const isSelected = selectedCategory === category.id;
                
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryCard,
                      { 
                        backgroundColor: isSelected ? category.color : colors.background.subtle,
                        borderColor: isSelected ? category.color : colors.border.default,
                      }
                    ]}
                    onPress={() => handleSelectCategory(category.id)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons 
                      name={category.icon_name} 
                      size={28} 
                      color={isSelected ? '#FFFFFF' : colors.text.primary} 
                    />
                    <Text style={[typ.label.md, { color: isSelected ? '#FFFFFF' : colors.text.primary }]}>
                      {category.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              
              {categories.length === 0 && (
                <View style={{ alignItems: 'center', paddingHorizontal: 40 }}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={48} color={colors.text.disabled} />
                  <Text style={[typ.body.md, { color: colors.text.disabled }]}>{t.education.noCategories}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Articles in Selected Category or All Categories */}
        {(selectedCategory || categories.length > 0) && (
          <View style={{ paddingVertical: spacing.md }}>
            <Text style={[typ.label.lg, { color: colors.text.secondary, paddingHorizontal: spacing.base }]}>
              {selectedCategory 
                ? t.education.articlesInCategory 
                : t.education.popularArticles}
            </Text>

            {articles.length > 0 ? (
              <View style={{ marginTop: spacing.sm, paddingHorizontal: spacing.base }}>
                {articles.map((article, index) => {
                  const langTitle = article.title_ur;
                  const summary = article.summary_ur;
                  
                  return (
                    <TouchableOpacity
                      key={article.id}
                      style={[
                        styles.articleCard,
                        { 
                          backgroundColor: colors.background.subtle,
                          borderTopColor: colors.border.default,
                          borderBottomColor: colors.border.default,
                        }
                      ]}
                      onPress={() => handleReadArticle(article.slug)}
                      activeOpacity={0.8}
                    >
                      {/* First card has no top border, others have both */}
                      {index > 0 && (
                        <View style={{ height: 1, backgroundColor: colors.border.default }} />
                      )}
                      
                      <View style={{ padding: spacing.md }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: spacing.sm }}>
                            <Text style={[typ.label.lg, { color: colors.text.primary, marginBottom: spacing.xs }]}>{langTitle || article.title_en}</Text>
                            
                            {summary && (
                              <Text style={[typ.body.sm, { color: colors.text.secondary, lineHeight: 20 }]}>
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
                          <MaterialCommunityIcons 
                            name="clock-outline" 
                            size={14} 
                            color={colors.text.disabled} 
                          />
                          <Text style={[typ.body.xs, { color: colors.text.disabled }]}>
                            {article.read_time_minutes} {t.common.min}
                          </Text>
                          
                          {article.view_count > 0 && (
                            <>
                              <MaterialCommunityIcons 
                                name="eye-outline" 
                                size={14} 
                                color={colors.text.disabled} 
                              />
                              <Text style={[typ.body.xs, { color: colors.text.disabled }]}>
                                {article.view_count}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <EmptyState
                icon="book-open-page-variant"
                title={!selectedCategory ? t.education.noArticles : t.education.noCategories}
                message={t.education.noArticlesMessage}
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = {
  header: {
    paddingTop: spacing.lg + spacing.xs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  categoryCard: {
    width: 120,
    height: 140,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  articleCard: {
    borderRadius: 12,
    borderWidth: 0.5,
    marginVertical: spacing.xs / 2,
  },
};
