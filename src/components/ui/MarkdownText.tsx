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
      // Bold: **text** or __text__
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(remaining.slice(0, boldMatch.index));
        }
        parts.push(
          <Text key={parts.length} style={styles.bold}>
            {boldMatch[1]}
          </Text>
        );
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
        continue;
      }

      // Italic: *text* or _text_
      const italicMatch = remaining.match(/\*([^*]+)\*/);
      if (italicMatch && italicMatch.index !== undefined) {
        if (italicMatch.index > 0) {
          parts.push(remaining.slice(0, italicMatch.index));
        }
        parts.push(
          <Text key={parts.length} style={styles.italic}>
            {italicMatch[1]}
          </Text>
        );
        remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
        continue;
      }

      // Code: `code`
      const codeMatch = remaining.match(/`([^`]+)`/);
      if (codeMatch && codeMatch.index !== undefined) {
        if (codeMatch.index > 0) {
          parts.push(remaining.slice(0, codeMatch.index));
        }
        parts.push(
          <Text key={parts.length} style={styles.code}>
            {codeMatch[1]}
          </Text>
        );
        remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
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
