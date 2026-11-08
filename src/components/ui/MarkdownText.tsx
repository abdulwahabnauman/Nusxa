import React, { useMemo } from 'react';
import { Text, View, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/provider';
import { lightTokens, type ThemeTokens } from '../../theme/tokens';

interface MarkdownStyleSet {
  bold: TextStyle;
  italic: TextStyle;
  code: TextStyle;
  paragraph: TextStyle;
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  list: ViewStyle;
  listItem: ViewStyle;
  bullet: TextStyle;
  numberPrefix: TextStyle;
  listText: TextStyle;
  blockquote: ViewStyle;
  blockquoteText: TextStyle;
  spacer: ViewStyle;
}

/** Builds the markdown styles from the live theme so bold/italic spans use
 *  the bundled Inter faces (or Nastaliq in Urdu) instead of fontWeight,
 *  which static font faces ignore on iOS. */
function buildStyles(
  families: { regular: string; bold: string; italic: string },
  base: TextStyle,
  colors: ThemeTokens
): MarkdownStyleSet {
  return StyleSheet.create({
    bold: {
      fontFamily: families.bold,
    },
    italic: {
      fontFamily: families.italic,
    },
    code: {
      fontFamily: 'monospace',
      // Inline code follows the live theme so it does not flash a light chip
      // inside dark-mode answers.
      color: colors.text.primary,
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
    },
    paragraph: {
      ...base,
      fontFamily: families.regular,
      fontSize: base.fontSize,
      lineHeight: base.lineHeight,
      marginBottom: 8,
    },
    h1: {
      ...base,
      fontFamily: families.bold,
      fontSize: (base.fontSize ?? 16) + 4,
      lineHeight: (base.lineHeight ?? 24) + 4,
      marginTop: 6,
      marginBottom: 6,
    },
    h2: {
      ...base,
      fontFamily: families.bold,
      fontSize: (base.fontSize ?? 16) + 2,
      lineHeight: (base.lineHeight ?? 24) + 2,
      marginTop: 4,
      marginBottom: 4,
    },
    h3: {
      ...base,
      fontFamily: families.bold,
      fontSize: base.fontSize,
      lineHeight: base.lineHeight,
      marginTop: 4,
      marginBottom: 2,
    },
    list: {
      marginBottom: 12,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 4,
    },
    bullet: {
      color: colors.text.secondary,
      fontFamily: families.regular,
      fontSize: base.fontSize,
      minWidth: 16,
    },
    numberPrefix: {
      color: colors.text.secondary,
      fontFamily: families.bold,
      fontSize: base.fontSize,
      minWidth: 20,
    },
    listText: {
      ...base,
      flex: 1,
      fontFamily: families.regular,
      fontSize: base.fontSize,
      lineHeight: base.lineHeight,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.border.default,
      paddingLeft: 10,
      marginVertical: 4,
    },
    blockquoteText: {
      ...base,
      fontFamily: families.italic,
      color: colors.text.secondary,
    },
    spacer: {
      height: 4,
    },
  });
}

/** Simple Markdown parser for React Native. `textColor` overrides the
 *  default text color (used for white text on the blue user chat bubble). */
export function parseMarkdown(
  text: string,
  textColor?: string,
  styles?: MarkdownStyleSet
): React.ReactNode[] {
  const s = styles ?? fallbackStyles;
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let numberedItems: { num: string; content: string }[] = [];
  const colorStyle = textColor ? { color: textColor } : undefined;

  const processInline = (content: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      // Pick the earliest complete match by position (bold wins ties with
      // italic), so a code span earlier in the line isn't skipped just
      // because an italic span exists later.
      const candidates = [
        { match: remaining.match(/\*\*([^*]+)\*\*/), style: s.bold },
        { match: remaining.match(/\*([^*]+)\*/), style: s.italic },
        { match: remaining.match(/`([^`]+)`/), style: s.code },
      ].filter((c) => c.match && c.match.index !== undefined);

      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (b.match!.index! < a.match!.index! ? b : a));
        const m = best.match!;
        if (m.index! > 0) {
          parts.push(remaining.slice(0, m.index));
        }
        parts.push(
          <Text key={parts.length} style={best.style}>
            {m[1]}
          </Text>
        );
        remaining = remaining.slice(m.index! + m[0].length);
        continue;
      }

      // Streaming fallback: a marker opened but its closing pair hasn't
      // arrived yet (word-by-word reveal). Complete pairs were already
      // consumed above, so the first remaining marker is unclosed — format
      // everything after it now instead of flashing raw **/* /` until the
      // span closes.
      const danglingMatch = remaining.match(/\*\*|`|\*/);
      if (danglingMatch && danglingMatch.index !== undefined) {
        if (danglingMatch.index > 0) {
          parts.push(remaining.slice(0, danglingMatch.index));
        }
        const marker = danglingMatch[0];
        const danglingStyle =
          marker === '`' ? s.code : marker === '**' ? s.bold : s.italic;
        parts.push(
          <Text key={parts.length} style={danglingStyle}>
            {remaining.slice(danglingMatch.index + marker.length)}
          </Text>
        );
        remaining = '';
        continue;
      }

      break;
    }

    if (parts.length === 0) {
      return remaining;
    }

    if (remaining.length > 0) {
      parts.push(remaining);
    }

    return parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    // Empty line
    if (trimmed === '') {
      nodes.push(<View key={i} style={s.spacer} />);
      continue;
    }

    // Markdown Headings: #, ##, ###
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      nodes.push(
        <Text key={i} style={[s.h3, colorStyle]}>
          {processInline(h3Match[1]!)}
        </Text>
      );
      continue;
    }
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      nodes.push(
        <Text key={i} style={[s.h2, colorStyle]}>
          {processInline(h2Match[1]!)}
        </Text>
      );
      continue;
    }
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      nodes.push(
        <Text key={i} style={[s.h1, colorStyle]}>
          {processInline(h1Match[1]!)}
        </Text>
      );
      continue;
    }

    // Blockquote (> ...)
    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      nodes.push(
        <View key={i} style={s.blockquote}>
          <Text style={[s.blockquoteText, colorStyle]}>
            {processInline(quoteMatch[1]!)}
          </Text>
        </View>
      );
      continue;
    }

    // Numbered list item (e.g. "1. ", "2. ", "1) ", "۱. ")
    const numMatch = trimmed.match(/^([0-9۰-۹]+)[\.\)]\s+(.+)$/);
    if (numMatch) {
      const numPrefix = numMatch[1]!;
      const itemContent = numMatch[2]!;
      numberedItems.push({ num: numPrefix, content: itemContent });

      const nextLine = lines[i + 1]?.trim() ?? '';
      if (!/^[0-9۰-۹]+[\.\)]\s+/.test(nextLine)) {
        nodes.push(
          <View key={i} style={s.list}>
            {numberedItems.map((item, idx) => (
              <View key={idx} style={s.listItem}>
                <Text style={[s.numberPrefix, colorStyle]}>{item.num}.</Text>
                <Text style={[s.listText, { marginStart: 4 }, colorStyle]}>
                  {processInline(item.content)}
                </Text>
              </View>
            ))}
          </View>
        );
        numberedItems = [];
      }
      continue;
    }

    // Unordered list item ("- " or "* ")
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemContent = trimmed.slice(2);
      listItems.push(itemContent);

      const nextLine = lines[i + 1]?.trim() ?? '';
      if (!nextLine.startsWith('- ') && !nextLine.startsWith('* ')) {
        nodes.push(
          <View key={i} style={s.list}>
            {listItems.map((item, idx) => (
              <View key={idx} style={s.listItem}>
                <Text style={[s.bullet, colorStyle]}>•</Text>
                <Text style={[s.listText, { marginStart: 8 }, colorStyle]}>
                  {processInline(item)}
                </Text>
              </View>
            ))}
          </View>
        );
        listItems = [];
      }
      continue;
    }

    // Regular paragraph
    nodes.push(
      <Text key={i} style={[s.paragraph, colorStyle]}>
        {processInline(rawLine)}
      </Text>
    );
  }

  return nodes;
}

/** Theme-aware markdown renderer for chat and education content. */
export function MarkdownText({
  content,
  textColor,
}: {
  content: string;
  textColor?: string;
}) {
  const { typography, colors } = useTheme();
  const styles = useMemo(
    () => buildStyles(typography.families, typography.body.base, colors),
    [typography, colors]
  );
  const nodes = useMemo(
    () => parseMarkdown(content, textColor, styles),
    [content, textColor, styles]
  );
  return <>{nodes}</>;
}

const fallbackStyles = buildStyles(
  {
    regular: 'Inter_400Regular',
    bold: 'Inter_700Bold',
    italic: 'Inter_400Regular_Italic',
  },
  { fontSize: 16, lineHeight: 24 },
  lightTokens
);
