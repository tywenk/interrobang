import { XMLParser } from 'fast-xml-parser';

/**
 * In-memory representation of an Apple Property List value.
 *
 * Maps each plist type to its closest JavaScript equivalent:
 * - `<string>` → `string`
 * - `<integer>` / `<real>` → `number`
 * - `<true/>` / `<false/>` → `boolean`
 * - `<date>` → `Date`
 * - `<data>` → `Uint8Array`
 * - `<array>` → `PlistValue[]`
 * - `<dict>` → `{ [k: string]: PlistValue }`
 *
 * @see https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/PropertyLists/
 */
export type PlistValue =
  | string
  | number
  | boolean
  | Date
  | Uint8Array
  | PlistValue[]
  | { [k: string]: PlistValue };

const parser = new XMLParser({
  ignoreAttributes: false,
  alwaysCreateTextNode: false,
  preserveOrder: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

/**
 * Parse an XML-format Apple Property List into a {@link PlistValue}.
 *
 * @param xml - Full plist XML including the `<?xml?>` declaration and DOCTYPE.
 * @returns The decoded top-level value (typically a `dict` or `array`).
 * @throws If the document is not a plist, is empty, or contains an unknown tag.
 */
export function parsePlist(xml: string): PlistValue {
  const tree = parser.parse(xml) as unknown[];
  const plistNode = findNode(tree, 'plist');
  if (!plistNode) throw new Error('Not a plist');
  const children = plistNode.plist as unknown[];
  // Skip whitespace/text-only siblings; pick the first meaningful child
  const firstValue = children.find((c) => !isTextNode(c));
  if (firstValue === undefined) throw new Error('Empty plist');
  return decode(firstValue);
}

function isTextNode(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return true;
  return '#text' in node;
}

function findNode(tree: unknown[], name: string): { [k: string]: unknown[] } | null {
  for (const n of tree) {
    if (typeof n === 'object' && n !== null && name in n) {
      return n as { [k: string]: unknown[] };
    }
  }
  return null;
}

function decode(node: unknown): PlistValue {
  if (typeof node !== 'object' || node === null) {
    return String(node);
  }
  const entries = Object.entries(node as Record<string, unknown>).filter(([k]) => k !== ':@');
  if (entries.length === 0) throw new Error('Empty plist node');
  const [tag, content] = entries[0]!;
  if (tag === 'dict') return decodeDict(content as unknown[]);
  if (tag === 'array') {
    const arr = content as unknown[];
    return arr.filter((c) => !isTextNode(c)).map((c) => decode(c));
  }
  if (tag === 'string') return getText(content);
  if (tag === 'integer') return parseInt(getText(content), 10);
  if (tag === 'real') return parseFloat(getText(content));
  if (tag === 'true') return true;
  if (tag === 'false') return false;
  if (tag === 'data') return base64Decode(getText(content));
  if (tag === 'date') return new Date(getText(content));
  throw new Error(`Unknown plist tag: ${tag}`);
}

function getText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    if (content.length === 0) return '';
    for (const c of content) {
      if (typeof c === 'object' && c !== null && '#text' in c) {
        return String((c as { '#text': unknown })['#text']);
      }
      if (typeof c === 'string') return c;
    }
    return '';
  }
  if (typeof content === 'object' && content !== null && '#text' in content) {
    return String((content as { '#text': unknown })['#text']);
  }
  return '';
}

function decodeDict(items: unknown[]): { [k: string]: PlistValue } {
  const out: { [k: string]: PlistValue } = {};
  // items is an array of {key: ...} and value nodes, interleaved, possibly with text nodes
  const filtered = items.filter((c) => !isTextNode(c));
  for (let i = 0; i < filtered.length; i += 2) {
    const keyNode = filtered[i] as { key: unknown };
    const valNode = filtered[i + 1];
    if (valNode === undefined) break;
    out[getText(keyNode.key)] = decode(valNode);
  }
  return out;
}

function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g.Buffer !== 'undefined') {
    return new Uint8Array(g.Buffer.from(clean, 'base64'));
  }
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Encode(bytes: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g.Buffer !== 'undefined') {
    return g.Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/**
 * Serialize a {@link PlistValue} as Apple Property List 1.0 XML.
 *
 * The output includes the XML declaration, DOCTYPE, and is tab-indented for
 * readability. Numbers that are not integers are emitted as `<real>`.
 *
 * @param value - Any plist value; dicts and arrays are walked recursively.
 * @returns Full plist XML ending in a trailing newline.
 */
export function writePlist(value: PlistValue): string {
  const body = encodeXml(value, 1);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' +
    body +
    '\n</plist>\n'
  );
}

function encodeXml(value: PlistValue, depth: number): string {
  const ind = '\t'.repeat(depth);
  if (typeof value === 'string') return `${ind}<string>${escapeXml(value)}</string>`;
  if (typeof value === 'boolean') return `${ind}<${value ? 'true' : 'false'}/>`;
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return `${ind}<integer>${value}</integer>`;
    return `${ind}<real>${value}</real>`;
  }
  if (value instanceof Date) return `${ind}<date>${value.toISOString().replace(/\.\d{3}Z$/, 'Z')}</date>`;
  if (value instanceof Uint8Array) return `${ind}<data>${base64Encode(value)}</data>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${ind}<array/>`;
    const items = value.map((v) => encodeXml(v, depth + 1)).join('\n');
    return `${ind}<array>\n${items}\n${ind}</array>`;
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 0) return `${ind}<dict/>`;
    const inner = '\t'.repeat(depth + 1);
    const items = keys
      .map((k) => {
        const v = (value as { [k: string]: PlistValue })[k]!;
        return `${inner}<key>${escapeXml(k)}</key>\n${encodeXml(v, depth + 1)}`;
      })
      .join('\n');
    return `${ind}<dict>\n${items}\n${ind}</dict>`;
  }
  throw new Error(`Cannot encode plist value of type ${typeof value}`);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
