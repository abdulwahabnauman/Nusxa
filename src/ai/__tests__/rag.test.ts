import { buildFtsMatchQuery, formatRagContextForPrompt, searchClinicalKnowledge, ClinicalMonographMatch } from '../rag';
import { getDatabase } from '../../db/database';

jest.mock('../../db/database', () => ({
  getDatabase: jest.fn(),
}));

describe('Clinical Knowledge Retrieval (RAG via SQLite FTS5 + BM25)', () => {
  describe('buildFtsMatchQuery', () => {
    it('constructs an exact drug AND topic FTS5 query for ciprofloxacin and milk', () => {
      const result = buildFtsMatchQuery('Can I take ciprofloxacin with milk?');
      expect(result.ftsQuery).not.toBeNull();
      expect(result.ftsQuery).toContain('"ciprofloxacin"');
      expect(result.ftsQuery).toContain('AND');
      expect(result.ftsQuery).toContain('"milk"');
      expect(result.ftsQuery).toContain('"calcium"');
      expect(result.fallbackTerms).toContain('ciprofloxacin');
      expect(result.fallbackTerms).toContain('milk');
    });

    it('resolves Pakistani brand names (Novidat -> Ciprofloxacin) and Roman Urdu terms (doodh)', () => {
      const result = buildFtsMatchQuery('kya me novidat doodh k sath le skta hu?');
      expect(result.ftsQuery).not.toBeNull();
      expect(result.ftsQuery).toContain('"ciprofloxacin"');
      expect(result.ftsQuery).toContain('"novidat"');
      expect(result.ftsQuery).toContain('AND');
      expect(result.ftsQuery).toContain('"doodh"');
      expect(result.ftsQuery).toContain('"milk"');
    });

    it('sanitizes special characters to prevent SQLite FTS5 syntax errors', () => {
      const result = buildFtsMatchQuery('Can I take ciprofloxacin with milk??? (urgent!! * / test)');
      expect(result.ftsQuery).not.toBeNull();
      // Ensure raw punctuation tokens are not bare in the output query
      expect(result.ftsQuery).not.toContain('?');
      expect(result.ftsQuery).not.toContain('!');
      expect(result.ftsQuery).not.toContain('*');
    });

    it('identifies multiple drugs in a combination safety question', () => {
      const result = buildFtsMatchQuery('Is Panadol safe to take with Brufen?');
      expect(result.ftsQuery).not.toBeNull();
      expect(result.ftsQuery).toContain('"paracetamol"');
      expect(result.ftsQuery).toContain('"panadol"');
      expect(result.ftsQuery).toContain('"ibuprofen"');
      expect(result.ftsQuery).toContain('"brufen"');
    });

    it('matches user active prescription medicines passed in options', () => {
      const result = buildFtsMatchQuery('how should i take this medicine with food?', ['Metformin 500mg']);
      expect(result.ftsQuery).not.toBeNull();
      expect(result.ftsQuery).toContain('metformin');
      expect(result.ftsQuery).toContain('food');
    });

    it('binds contextual pronouns (this medicine, ye goli) to active prescriptions', () => {
      const result = buildFtsMatchQuery('Can I take this with milk?', ['Ciprofloxacin 500mg']);
      expect(result.ftsQuery).not.toBeNull();
      expect(result.ftsQuery).toContain('ciprofloxacin');
      expect(result.ftsQuery).toContain('milk');
    });

    it('ignores common English stopwords like "for", "can", and "fine" from false-positive drug matching', () => {
      const result = buildFtsMatchQuery('What is this for?', ['Metformin 500mg']);
      // "for" must not be matched as a drug
      expect(result.fallbackTerms).not.toContain('for');
    });

    it('returns null query for empty or whitespace strings', () => {
      expect(buildFtsMatchQuery('').ftsQuery).toBeNull();
      expect(buildFtsMatchQuery('   ').ftsQuery).toBeNull();
    });
  });

  describe('formatRagContextForPrompt', () => {
    it('returns empty string when no matches exist', () => {
      expect(formatRagContextForPrompt([])).toBe('');
    });

    it('formats clinical monograph chunks with grounding instructions for LLM', () => {
      const matches: ClinicalMonographMatch[] = [
        {
          generic_name: 'Ciprofloxacin',
          brand_names: 'Cipro, Novidat',
          drug_class: 'Fluoroquinolone Antibacterial',
          content: 'Do NOT take ciprofloxacin with milk or calcium supplements.',
          rank: -1.25,
        },
      ];

      const formatted = formatRagContextForPrompt(matches);
      expect(formatted).toContain('[VERIFIED CLINICAL REFERENCE (ON-DEVICE RAG - BM25)]');
      expect(formatted).toContain('Ciprofloxacin (Fluoroquinolone Antibacterial)');
      expect(formatted).toContain('Do NOT take ciprofloxacin with milk or calcium supplements.');
      expect(formatted).toContain('INSTRUCTIONS:');
    });
  });

  describe('searchClinicalKnowledge', () => {
    it('queries SQLite FTS5 table with BM25 ranking when FTS5 is available', async () => {
      const mockGetAllAsync = jest.fn().mockResolvedValue([
        {
          generic_name: 'Ciprofloxacin',
          brand_names: 'Cipro, Novidat',
          drug_class: 'Fluoroquinolone Antibacterial',
          content: 'Do not take with milk or calcium.',
          rank: -2.5,
        },
      ]);

      (getDatabase as jest.Mock).mockReturnValue({
        getAllAsync: mockGetAllAsync,
      });

      const matches = await searchClinicalKnowledge('Can I take ciprofloxacin with milk?', { limit: 2 });
      expect(matches).toHaveLength(1);
      expect(matches[0]?.generic_name).toBe('Ciprofloxacin');
      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT generic_name, brand_names, drug_class, content, bm25(drug_monographs_fts) as rank'),
        expect.any(Array)
      );
    });

    it('gracefully falls back to SQL LIKE when FTS5 virtual table throws', async () => {
      const mockGetAllAsync = jest
        .fn()
        .mockRejectedValueOnce(new Error('no such module: fts5'))
        .mockResolvedValueOnce([
          {
            generic_name: 'Metformin',
            brand_names: 'Glucophage',
            drug_class: 'Biguanide',
            content: 'Take with food to minimize GI upset.',
          },
        ]);

      (getDatabase as jest.Mock).mockReturnValue({
        getAllAsync: mockGetAllAsync,
      });

      const matches = await searchClinicalKnowledge('How to take metformin with meals?');
      expect(matches).toHaveLength(1);
      expect(matches[0]?.generic_name).toBe('Metformin');
      // Second call was the fallback query
      expect(mockGetAllAsync).toHaveBeenCalledTimes(2);
      expect(mockGetAllAsync).toHaveBeenLastCalledWith(
        expect.stringContaining('FROM drug_monographs'),
        expect.any(Array)
      );
    });
  });
});
