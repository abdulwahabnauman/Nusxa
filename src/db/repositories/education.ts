/**
 * Education Content Repository
 * Data access layer for educational content library
 */

import { getDatabase } from '../database';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface EducationCategory {
  id: number;
  slug: string;
  title_en: string;
  title_ur: string;
  description_en?: string;
  description_ur?: string;
  icon_name: string;
  color: string;
  sort_order: number;
  is_active: number;
}

export interface EducationContent {
  id: number;
  category_id: number;
  slug: string;
  title_en: string;
  title_ur: string;
  summary_en?: string;
  summary_ur?: string;
  content_en?: string;
  content_ur?: string;
  author?: string;
  last_reviewed?: string;
  read_time_minutes: number;
  view_count: number;
  is_published: number;
  sort_order: number;
}

export interface EducationBookmark {
  user_id: string;
  content_id: number;
  added_at: string;
}

export interface EducationReadingHistory {
  user_id: string;
  content_id: number;
  last_read_position: number;
  completed_at?: string;
  started_at: string;
  total_time_spent_seconds: number;
}

// Get all categories (active ones)
export async function getCategories(language: 'en' | 'ur' = 'en'): Promise<EducationCategory[]> {
  const db = getDatabase();
  
  const column = language === 'ur' ? 'title_ur' : 'title_en';
  
  const results = await db.getAllAsync<EducationCategory>(
    `SELECT *, ${column} as title FROM education_categories 
     WHERE is_active = 1 
     ORDER BY sort_order ASC`,
  );
  
  return results.map(row => ({
    ...row,
    title: row.title!,
  }));
}

// Get categories with Urdu titles
export async function getCategoriesUrdu(): Promise<EducationCategory[]> {
  return getCategories('ur');
}

// Get content by slug
export async function getContent(slug: string, language: 'en' | 'ur' = 'en'): Promise<EducationContent | null> {
  const db = getDatabase();
  
  // First get the content to increment view count
  const content = await db.getFirstAsync<EducationContent>(
    'SELECT * FROM education_content WHERE slug = ?', [slug]
  );
  
  if (!content || !content.is_published) return null;
  
  // Increment view count
  await db.runAsync(
    'UPDATE education_content SET view_count = view_count + 1 WHERE id = ?',
    [content.id]
  );
  
  return content;
}

// Get content in specific language
export async function getContentBySlugUrdu(slug: string): Promise<EducationContent | null> {
  return getContent(slug, 'ur');
}

// Get all published content in a category
export async function getContentByCategory(categoryId: number, language: 'en' | 'ur' = 'en'): Promise<EducationContent[]> {
  const db = getDatabase();
  
  const results = await db.getAllAsync<EducationContent>(
    `SELECT * FROM education_content 
     WHERE category_id = ? AND is_published = 1 
     ORDER BY sort_order ASC`,
    [categoryId]
  );
  
  return results;
}

// Check if user has bookmarked content
export async function isBookmarked(userId: string, contentId: number): Promise<boolean> {
  const db = getDatabase();
  
  const result = await db.getFirstAsync<{ exists: number }>(
    'SELECT 1 as exists FROM education_bookmarks WHERE user_id = ? AND content_id = ?',
    [userId, contentId]
  );
  
  return result?.exists === 1;
}

// Add bookmark
export async function addBookmark(userId: string, contentId: number): Promise<void> {
  const db = getDatabase();
  
  await db.runAsync(
    'INSERT OR IGNORE INTO education_bookmarks (user_id, content_id) VALUES (?, ?)',
    [userId, contentId]
  );
}

// Remove bookmark
export async function removeBookmark(userId: string, contentId: number): Promise<void> {
  const db = getDatabase();
  
  await db.runAsync(
    'DELETE FROM education_bookmarks WHERE user_id = ? AND content_id = ?',
    [userId, contentId]
  );
}

// Toggle bookmark (add if not present, remove if present)
export async function toggleBookmark(userId: string, contentId: number): Promise<boolean> {
  const wasBookmarked = await isBookmarked(userId, contentId);
  
  if (wasBookmarked) {
    await removeBookmark(userId, contentId);
    return false;
  } else {
    await addBookmark(userId, contentId);
    return true;
  }
}

// Get all bookmarks for user
export async function getBookmarks(userId: string): Promise<EducationContent[]> {
  const db = getDatabase();
  
  const results = await db.getAllAsync<EducationContent>(
    `SELECT c.* FROM education_content c
     INNER JOIN education_bookmarks b ON c.id = b.content_id
     WHERE b.user_id = ? AND c.is_published = 1
     ORDER BY b.added_at DESC`,
    [userId]
  );
  
  return results;
}

// Update reading progress
export async function updateReadingProgress(
  userId: string, 
  contentId: number, 
  position: number,
  timeSpent?: number
): Promise<void> {
  const db = getDatabase();
  
  try {
    await db.runAsync(
      `INSERT INTO education_reading_history 
       (user_id, content_id, last_read_position, started_at, total_time_spent_seconds)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(user_id, content_id) DO UPDATE SET
       last_read_position = ?,
       total_time_spent_seconds = total_time_spent_seconds + COALESCE(?, 0)`,
      [userId, contentId, position, timeSpent ?? 0, position, timeSpent ?? 0]
    );
  } catch (error) {
    console.log('[DB] Failed to save reading progress:', error);
  }
}

// Mark article as complete
export async function markArticleComplete(
  userId: string, 
  contentId: number,
  totalTime: number
): Promise<void> {
  const db = getDatabase();
  
  await db.runAsync(
    `UPDATE education_reading_history 
     SET completed_at = CURRENT_TIMESTAMP, total_time_spent_seconds = ?
     WHERE user_id = ? AND content_id = ?`,
    [totalTime, userId, contentId]
  );
}

// Get reading progress for content
export async function getReadingProgress(userId: string, contentId: number): Promise<number> {
  const db = getDatabase();
  
  const result = await db.getFirstAsync<{ last_read_position: number }>(
    'SELECT last_read_position FROM education_reading_history WHERE user_id = ? AND content_id = ?',
    [userId, contentId]
  );
  
  return result?.last_read_position ?? 0;
}

// Search content across all categories
export async function searchContent(query: string, language: 'en' | 'ur' = 'en'): Promise<EducationContent[]> {
  const db = getDatabase();
  
  const column = language === 'ur' ? 'title_ur, summary_ur, content_ur' : 'title_en, summary_en, content_en';
  
  const results = await db.getAllAsync<EducationContent>(
    `SELECT * FROM education_content 
     WHERE is_published = 1 AND (
       ${column} LIKE '%${query}%' OR
       title_en LIKE '%${query}%'
     )
     ORDER BY view_count DESC
     LIMIT 20`,
    []
  );
  
  return results;
}
