import { ensureProjectNode, link, mkEntry, type EntryType, type Mem, type Source } from './memory';
import { redact } from './redact';
import { keywords } from './text';

export interface RawMemoryItem {
  title: string;
  note: string;
  type?: EntryType;
  project?: string;
  kws?: string[];
  sources?: Source[];
}

const VALID_TYPES = new Set<EntryType>(['concept', 'entity', 'workstream']);

/** Parse any JSON memory file (backup, export, array of items, or key-value map). */
export function parseJsonMemory(text: string, defaultProject = 'Brain'): RawMemoryItem[] {
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object') return [];

    const obj = data as Record<string, unknown>;

    // Format 1: Direct array of items or entries
    let list: unknown[] | null = null;
    if (Array.isArray(data)) {
      list = data;
    } else if (Array.isArray(obj.entries)) {
      list = obj.entries;
    } else if (Array.isArray(obj.memories)) {
      list = obj.memories;
    }

    if (list) {
      const items: RawMemoryItem[] = [];
      for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue;
        const it = raw as Record<string, unknown>;
        const titleStr = typeof it.title === 'string' ? it.title : typeof it.name === 'string' ? it.name : '';
        const noteStr =
          typeof it.note === 'string'
            ? it.note
            : typeof it.content === 'string'
              ? it.content
              : typeof it.text === 'string'
                ? it.text
                : typeof it.description === 'string'
                  ? it.description
                  : '';
        const title = titleStr.trim();
        const note = noteStr.trim();
        if (!title || !note) continue;

        const rawType = typeof it.type === 'string' ? it.type.toLowerCase() : '';
        const type: EntryType = VALID_TYPES.has(rawType as EntryType) ? (rawType as EntryType) : 'concept';
        const project = typeof it.project === 'string' && it.project.trim() ? it.project.trim() : defaultProject;
        const kws = Array.isArray(it.kws) ? it.kws.map(String) : undefined;
        items.push({ title, note, type, project, kws });
      }
      return items;
    }

    // Format 2: Key-value dictionary { "Title": "Note" } or { "Title": { note: "..." } }
    const items: RawMemoryItem[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.trim() && k.trim()) {
        items.push({ title: k.trim(), note: v.trim(), type: 'concept', project: defaultProject });
      } else if (v && typeof v === 'object') {
        const valObj = v as Record<string, unknown>;
        if (typeof valObj.note === 'string' && valObj.note.trim()) {
          const title = typeof valObj.title === 'string' && valObj.title.trim() ? valObj.title.trim() : k.trim();
          const note = valObj.note.trim();
          const rawType = typeof valObj.type === 'string' ? valObj.type.toLowerCase() : '';
          const type: EntryType = VALID_TYPES.has(rawType as EntryType) ? (rawType as EntryType) : 'concept';
          const project =
            typeof valObj.project === 'string' && valObj.project.trim() ? valObj.project.trim() : defaultProject;
          items.push({ title, note, type, project });
        }
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** Parse Markdown text into one or multiple memory entries. */
export function parseMarkdownMemory(text: string, filename: string, defaultProject = 'Brain'): RawMemoryItem[] {
  const clean = text.trim();
  if (!clean) return [];

  const baseTitle = filename.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]/g, ' ');

  // Check if the document has multiple markdown sections (# or ##)
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const sections: { title: string; body: string }[] = [];
  const matches: { index: number; title: string; length: number }[] = [];

  let match = headingRegex.exec(clean);
  while (match !== null) {
    matches.push({ index: match.index, title: match[2].trim(), length: match[0].length });
    match = headingRegex.exec(clean);
  }

  if (matches.length > 1) {
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const start = cur.index + cur.length;
      const end = i + 1 < matches.length ? matches[i + 1].index : clean.length;
      const body = clean.slice(start, end).trim();
      if (body) {
        sections.push({
          title: cur.title.slice(0, 80),
          body: body.slice(0, 1000),
        });
      }
    }
  } else if (matches.length === 1) {
    const cur = matches[0];
    const body = clean.slice(cur.index + cur.length).trim();
    sections.push({
      title: cur.title.slice(0, 80),
      body: (body || clean).slice(0, 1000),
    });
  }

  if (sections.length > 0) {
    return sections.map(s => ({
      title: s.title,
      note: s.body,
      type: 'concept',
      project: defaultProject,
    }));
  }

  // Single file entry without markdown headings - use baseTitle from filename
  return [
    {
      title: (baseTitle || 'Note').slice(0, 80),
      note: clean.slice(0, 1000),
      type: 'concept',
      project: defaultProject,
    },
  ];
}

/** Parse CSV text into memory items (title, note, type, project). */
export function parseCsvMemory(text: string, defaultProject = 'Brain'): RawMemoryItem[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const items: RawMemoryItem[] = [];
  const startIdx = lines[0].toLowerCase().includes('title') && lines[0].toLowerCase().includes('note') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV column splitting with quote handling
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());

    if (cols.length >= 2 && cols[0] && cols[1]) {
      const title = cols[0].replace(/^"|"$/g, '').slice(0, 80);
      const note = cols[1].replace(/^"|"$/g, '').slice(0, 1000);
      const rawType = (cols[2] || '').toLowerCase().replace(/^"|"$/g, '');
      const type: EntryType = VALID_TYPES.has(rawType as EntryType) ? (rawType as EntryType) : 'concept';
      const project = (cols[3] || defaultProject).replace(/^"|"$/g, '');
      items.push({ title, note, type, project });
    }
  }
  return items;
}

/** Parse any uploaded File object into RawMemoryItem array. */
export async function parseMemoryFile(file: File, defaultProject = 'Brain'): Promise<RawMemoryItem[]> {
  const name = file.name.toLowerCase();
  const text = await file.text();

  if (name.endsWith('.json')) {
    return parseJsonMemory(text, defaultProject);
  }
  if (name.endsWith('.csv')) {
    return parseCsvMemory(text, defaultProject);
  }
  // Markdown or plain text
  return parseMarkdownMemory(text, file.name, defaultProject);
}

/** Import and merge items into the given Memory object. */
export function importMemoryItems(
  m: Mem,
  items: RawMemoryItem[],
  defaultProject = 'Brain',
  now = Date.now(),
): { added: number; updated: number; total: number } {
  let added = 0;
  let updated = 0;

  for (const it of items) {
    const rawTitle = it.title.trim().slice(0, 80);
    const rawNote = it.note.trim().slice(0, 1000);
    if (!rawTitle || !rawNote) continue;

    const title = redact(rawTitle).text;
    const note = redact(rawNote).text;
    const type: EntryType = it.type && VALID_TYPES.has(it.type) ? it.type : 'concept';
    const project = (it.project || defaultProject).trim() || 'Brain';
    const key = `import:${type}:${title.toLowerCase()}`;

    // Ensure project node exists
    const projNode = ensureProjectNode(m, project, undefined, now);

    // Look for existing memory by title or key
    const existing = m.entries.find(e => e.key === key || e.title.toLowerCase() === title.toLowerCase());

    if (existing) {
      existing.seen = now;
      existing.strength = Math.min(9, existing.strength + 1);
      existing.status = 'fresh';
      // Append note if new details are present
      if (!existing.note.includes(note)) {
        existing.note = `${existing.note}\n\n${note}`.slice(0, 1200);
      }
      if (it.sources) {
        for (const s of it.sources) {
          if (!existing.sources.some(x => x.label === s.label && x.ref === s.ref)) {
            existing.sources.push(s);
            if (existing.sources.length > 6) existing.sources.shift();
          }
        }
      }
      if (!existing.links.includes(projNode.id)) {
        link(existing, projNode);
      }
      updated++;
    } else {
      const e = mkEntry(
        m,
        {
          key,
          type,
          title,
          note,
          manual: true,
          kws: it.kws || keywords(`${title} ${note}`).slice(0, 8),
          sources:
            it.sources && it.sources.length > 0
              ? it.sources
              : [{ kind: 'file', label: `Imported file: ${title}`, ref: null }],
        },
        now,
      );
      link(e, projNode);
      m.entries.push(e);
      m.inbox.push({ kind: 'file', ref: e.id });
      added++;
    }
  }

  return { added, updated, total: added + updated };
}

/** Export all memories and sessions to JSON. */
export function exportMemoryJson(m: Mem): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 2,
      entries: m.entries,
      sessions: m.sessions,
    },
    null,
    2,
  );
}

/** Export all memories to readable Markdown. */
export function exportMemoryMarkdown(m: Mem): string {
  return m.entries
    .map(
      e => `# ${e.title}\n**Type**: ${e.type} | **Strength**: ${e.strength} | **Status**: ${e.status}\n\n${e.note}\n`,
    )
    .join('\n---\n\n');
}

/** Download any text/JSON payload as a local file in browser. */
export function downloadFile(filename: string, content: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
