import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

/** Simple Markdown parser for React Native. `textColor` overrides the
 *  default text color (used for white text on the blue user chat bubble). */
export function parseMarkdown(text: string, textColor?: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listStartIndex = -1;
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
        { match: remaining.match(/\*\*([^*]+)\*\*/), style: styles.bold },
        { match: remaining.match(/\*([^*]+)\*/), style: styles.italic },
        { match: remaining.match(/`([^`]+)`/), style: styles.code },
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
          marker === '`' ? styles.code : marker === '**' ? styles.bold : styles.italic;
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
          <View key={i} style={styles.list}>
            {listItems.map((item, idx) => (
              <View key={idx} style={styles.listItem}>
                <Text style={[styles.bullet, colorStyle]}>•</Text>
                <Text style={[styles.listText, { marginLeft: 8 }, colorStyle]}>
                  {processInline(item)}
                </Text>
              </View>
            ))}
          </View>
        );
        listItems = [];
        listStartIndex = -1;
      }
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      nodes.push(<View key={i} style={styles.spacer} />);
      continue;
    }

    // Regular paragraph
    nodes.push(
      <Text key={i} style={[styles.paragraph, colorStyle]}>
        {processInline(line)}
      </Text>
    );
  }

  return nodes;
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
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
    marginBottom: 8,
    lineHeight: 20,
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
    fontSize: 16,
    minWidth: 16,
  },
  listText: {
    flex: 1,
    lineHeight: 20,
  },
  spacer: {
    height: 4,
  },
});
