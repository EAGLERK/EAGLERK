/**
 * A small .xlsx reader with no dependencies. An .xlsx file is a zip of XML files; this finds the sheets and the shared strings
 * and returns each sheet as rows of text. Dates come back as Excel's day numbers (the statement reader turns them into dates).
 */

const u16 = (d: DataView, o: number) => d.getUint16(o, true);
const u32 = (d: DataView, o: number) => d.getUint32(o, true);

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open Excel files. Save the sheet as CSV and import that.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Returns the files in a zip by name. Only stored and deflated entries are supported, which covers every Excel file. */
export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid Excel file.');
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const csize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const local = u32(view, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
    const raw = bytes.subarray(start, start + csize);
    out.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
  }
  return out;
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ' };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp === 160 ? ' ' : String.fromCodePoint(cp);
    }
    return entities[e.toLowerCase()] ?? m;
  });

const textOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1])).join('');
const colIndex = (ref: string) => ref.replace(/[^A-Z]/gi, '').toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Every worksheet in the workbook as rows of text, in sheet order. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][][]> {
  const files = await unzip(buf, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const dec = new TextDecoder();
  const sheetNames = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0));
  if (!sheetNames.length) throw new Error('This file is not an Excel workbook with sheets.');
  const shared = files.has('xl/sharedStrings.xml')
    ? [...dec.decode(files.get('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')))
    : [];

  return sheetNames.map((name) => {
    const xml = dec.decode(files.get(name));
    const rows: string[][] = [];
    for (const rowM of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      let next = 0;
      for (const c of rowM[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
        const idx = ref ? colIndex(ref) : next;
        const type = attrs.match(/\bt="(\w+)"/)?.[1];
        const body = c[2] ?? '';
        let v = '';
        if (type === 'inlineStr') v = textOf(body);
        else {
          const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
          if (type === 's') v = shared[Number(raw)] ?? '';
          else if (type === 'str' || type === 'e') v = decodeEntities(raw);
          else if (type === 'b') v = raw === '1' ? 'TRUE' : 'FALSE';
          else v = raw && !Number.isNaN(Number(raw)) ? String(Math.round(Number(raw) * 1e6) / 1e6) : decodeEntities(raw);
        }
        row[idx] = v;
        next = idx + 1;
      }
      for (let i = 0; i < row.length; i++) row[i] ??= '';
      rows.push(row);
    }
    return rows;
  });
}
