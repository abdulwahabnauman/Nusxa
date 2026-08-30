import { isValidElement } from 'react';
import { parseMarkdown } from '../MarkdownText';

type Styled = { style: any; text: string };

function collect(node: unknown, acc: { allText: string[]; styled: Styled[] }): void {
  if (node == null || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    acc.allText.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, acc));
    return;
  }
  if (isValidElement(node)) {
    const props = node.props as { style?: any; children?: unknown };
    if (typeof props.children === 'string') {
      acc.styled.push({ style: props.style, text: props.children });
      acc.allText.push(props.children);
      return;
    }
    collect(props.children, acc);
  }
}

function parse(text: string) {
  const acc = { allText: [] as string[], styled: [] as Styled[] };
  collect(parseMarkdown(text), acc);
  return { joined: acc.allText.join(''), styled: acc.styled };
}

describe('parseMarkdown during word-by-word reveal (unclosed markers)', () => {
  it('formats an unclosed ** span as bold instead of showing raw markers', () => {
    const { joined, styled } = parse('Side effects: **nausea');
    expect(joined).not.toContain('**');
    expect(styled.some((s) => s.style?.fontWeight === '700' && s.text === 'nausea')).toBe(true);
  });

  it('formats an unclosed * span as italic', () => {
    const { joined, styled } = parse('This is *important');
    expect(joined).not.toMatch(/\*/);
    expect(styled.some((s) => s.style?.fontStyle === 'italic' && s.text === 'important')).toBe(true);
  });

  it('formats an unclosed ` span as code', () => {
    const { joined, styled } = parse('Take `paracetamol');
    expect(joined).not.toContain('`');
    expect(styled.some((s) => s.style?.fontFamily === 'monospace' && s.text === 'paracetamol')).toBe(true);
  });

  it('still formats completed spans', () => {
    const { joined, styled } = parse('Take **500 mg** once, then `rest` and *sleep*');
    expect(joined).not.toMatch(/[*`]/);
    expect(styled.some((s) => s.style?.fontWeight === '700' && s.text === '500 mg')).toBe(true);
    expect(styled.some((s) => s.style?.fontFamily === 'monospace' && s.text === 'rest')).toBe(true);
    expect(styled.some((s) => s.style?.fontStyle === 'italic' && s.text === 'sleep')).toBe(true);
  });

  it('handles a completed span followed by an unclosed one', () => {
    const { styled } = parse('**bold part** then **still going');
    expect(styled.filter((s) => s.style?.fontWeight === '700').map((s) => s.text)).toEqual([
      'bold part',
      'still going',
    ]);
  });

  it('renders bullet lists while they are still being typed', () => {
    const { joined } = parse('- drink water');
    expect(joined).toContain('•');
  });
});
