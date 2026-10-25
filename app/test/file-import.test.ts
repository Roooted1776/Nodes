import { describe, expect, it } from 'vitest';
import {
  parseJsonMemory,
  parseMarkdownMemory,
  parseCsvMemory,
  importMemoryItems,
  exportMemoryJson,
  exportMemoryMarkdown,
} from '../src/lib/file-import';
import { blankMem, type Mem } from '../src/lib/memory';

describe('file-import', () => {
  describe('parseJsonMemory', () => {
    it('parses standard entries array', () => {
      const json = JSON.stringify({
        entries: [
          { title: 'Alpha', note: 'First concept note', type: 'concept', project: 'Brain' },
          { title: 'Beta', note: 'Second entity note', type: 'entity', project: 'Core' },
        ],
      });
      const items = parseJsonMemory(json, 'DefaultProj');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Alpha');
      expect(items[0].note).toBe('First concept note');
      expect(items[0].type).toBe('concept');
      expect(items[0].project).toBe('Brain');
      expect(items[1].project).toBe('Core');
    });

    it('parses raw array of objects', () => {
      const json = JSON.stringify([{ name: 'Model Routing', content: 'Grok leads, Claude reasons' }]);
      const items = parseJsonMemory(json, 'Brain');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Model Routing');
      expect(items[0].note).toBe('Grok leads, Claude reasons');
    });

    it('parses key-value dictionary', () => {
      const json = JSON.stringify({
        'Supervised Fine-Tuning': 'Training with input-output pairs.',
        'Reinforcement Learning': 'Policy optimization with rewards.',
      });
      const items = parseJsonMemory(json, 'Research');
      expect(items).toHaveLength(2);
      expect(items.map(i => i.title)).toContain('Supervised Fine-Tuning');
      expect(items[0].project).toBe('Research');
    });

    it('returns empty array on invalid JSON', () => {
      expect(parseJsonMemory('{ not valid json', 'Brain')).toEqual([]);
    });
  });

  describe('parseMarkdownMemory', () => {
    it('parses multi-heading markdown into separate entries', () => {
      const md = `
# System Architecture
The system uses Zustand with Supabase sync and 3D force nodes.

# Error Recovery
Quota errors trigger automatic agent failover to preserve budget.
      `.trim();
      const items = parseMarkdownMemory(md, 'architecture.md', 'Architecture');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('System Architecture');
      expect(items[0].note).toContain('Zustand with Supabase');
      expect(items[1].title).toBe('Error Recovery');
      expect(items[1].note).toContain('Quota errors trigger');
    });

    it('parses single-document markdown using filename as fallback', () => {
      const md = 'Brain nodes connect memory items to active project clusters.';
      const items = parseMarkdownMemory(md, 'brain-nodes.md', 'Brain');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('brain nodes');
      expect(items[0].note).toBe(md);
    });
  });

  describe('parseCsvMemory', () => {
    it('parses CSV with headers', () => {
      const csv = `title,note,type,project\n"Vector Search","Embeddings index with cosine similarity",concept,Search\n"Postgres Vault","AES-256 encrypted database table",entity,Storage`;
      const items = parseCsvMemory(csv, 'Default');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Vector Search');
      expect(items[0].note).toBe('Embeddings index with cosine similarity');
      expect(items[0].type).toBe('concept');
      expect(items[0].project).toBe('Search');
      expect(items[1].project).toBe('Storage');
    });
  });

  describe('importMemoryItems & export', () => {
    it('merges new items and updates existing ones', () => {
      const mem: Mem = blankMem();
      const items = [
        { title: 'Quantum Computing', note: 'Qubits in superposition', type: 'concept' as const },
        {
          title: 'Quantum Computing',
          note: 'Entanglement allows parallel state computation',
          type: 'concept' as const,
        },
      ];

      const res = importMemoryItems(mem, items, 'Physics', 1000);
      expect(res.added).toBe(1);
      expect(res.updated).toBe(1);
      expect(res.total).toBe(2);

      const entry = mem.entries.find(e => e.title === 'Quantum Computing');
      expect(entry).toBeDefined();
      expect(entry?.note).toContain('Qubits in superposition');
      expect(entry?.note).toContain('Entanglement allows');

      // Export JSON
      const jsonStr = exportMemoryJson(mem);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.entries).toHaveLength(mem.entries.length);

      // Export Markdown
      const mdStr = exportMemoryMarkdown(mem);
      expect(mdStr).toContain('# Quantum Computing');
    });
  });
});
