import React, { useMemo } from 'react';
import { Text, View, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/provider';

interface MarkdownStyleSet {
  bold: TextStyle;
  italic: TextStyle;
  code: TextStyle;
  paragraph: TextStyle;
  list: ViewStyle;
  listItem: ViewStyle;
  bullet: TextStyle;
  listText: TextStyle;
  spacer: ViewStyle;
}

/** Builds the markdown styles from the live theme so bold/italic spans use
 *  the bundled Inter faces (or Nastaliq in Urdu) instead of fontWeight,
 *  which static font faces ignore on iOS. */
function buildStyles(
  families: { regular: string; bold: string; italic: string },
  base: TextStyle
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
      // Fixed dark-on-light chip so code spans stay readable in both themes
      color: '#1F2937',
      backgroundColor: '#F3F3F0',
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
    list: {
      marginBottom: 12,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 4,
    },
    bullet: {
      color: '#686863',
      fontFamily: families.regular,
      fontSize: base.fontSize,
      minWidth: 16,
    },
    listText: {
      ...base,
      flex: 1,
      fontFamily: families.regular,
      fontSize: base.fontSize,
      lineHeight: base.lineHeight,
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
    const line = lines[i] ?? '';

    // Unordered list item
    if (line.trim().startsWith('- ')) {
      const itemContent = line.trim().slice(2);
      listItems.push(itemContent);

      // If next line is not a list item, render the list
      const nextLine = lines[i + 1];
      if (!nextLine || !nextLine.trim().startsWith('- ')) {
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

    // Empty line
    if (line.trim() === '') {
      nodes.push(<View key={i} style={s.spacer} />);
      continue;
    }

    // Regular paragraph
    nodes.push(
      <Text key={i} style={[s.paragraph, colorStyle]}>
        {processInline(line)}
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
  const { typography } = useTheme();
  const styles = useMemo(
    () => buildStyles(typography.families, typography.body.base),
    [typography]
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
  { fontSize: 16, lineHeight: 24 }
);
