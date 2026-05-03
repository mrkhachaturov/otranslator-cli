// One-shot probe: create three glossary variants so the user can test which
// open in the OTranslator web UI's glossary editor. The CLI/API say all three
// succeeded, but the UI may reject some shapes.
//
// Run:  node --env-file=.env --import tsx scripts/probe-glossary-formats.ts
//
// Cleanup is intentionally NOT done — keep the glossaries around so they can
// be inspected in the web UI. Delete them later with:
//   otcli glossary-delete <glossaryId>
import 'dotenv/config';
import { OTranslatorClient } from '../src/client.js';

const apiKey = process.env.OTRANSLATOR_API_KEY;
if (!apiKey) {
  console.error('OTRANSLATOR_API_KEY missing.');
  process.exit(2);
}

const baseUrl = process.env.OTRANSLATOR_BASE_URL ?? 'https://otranslator.com/api';
const client = new OTranslatorClient({ apiKey });

// PKM terms the user wants preserved verbatim in Russian text.
const KEYS = ['Bucket', 'Inbox', 'Outer World', 'Capturing Beast'];
const TRANSLATED: Record<string, string> = {
  Bucket: 'Bucket',
  Inbox: 'Inbox',
  'Outer World': 'Outer World',
  'Capturing Beast': 'Capturing Beast',
};

async function rawPost(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: apiKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!r.ok) {
    return { __error: true, status: r.status, body: data };
  }
  return data;
}

const stamp = Date.now();
const summary: Array<{ variant: string; name: string; glossaryId?: string; raw: unknown }> = [];

// ---------------------------------------------------------------------------
// Variant 1 — current SDK format. JSON-stringified keys + translated.
// ---------------------------------------------------------------------------
{
  const name = `otcli-probe-v1-flat-${stamp}`;
  const raw = await client.createGlossary({
    name,
    desc: 'PKM terms — variant 1: current SDK format (doubly-encoded)',
    targetLang: 'Russian',
    keys: KEYS,
    translated: TRANSLATED,
  });
  summary.push({
    variant: '1: current SDK (doubly-encoded)',
    name,
    glossaryId: raw.glossaryId,
    raw,
  });
}

// ---------------------------------------------------------------------------
// Variant 2 — native types. keys is a real array, translated is a real object.
// ---------------------------------------------------------------------------
{
  const name = `otcli-probe-v2-native-${stamp}`;
  const raw = await rawPost('/v1/glossary/create', {
    name,
    desc: 'PKM terms — variant 2: native arrays/objects (no double-encode)',
    targetLang: 'Russian',
    keys: KEYS,
    translated: TRANSLATED,
  });
  const glossaryId = (raw as { glossaryId?: string })?.glossaryId;
  summary.push({ variant: '2: native types', name, glossaryId, raw });
}

// ---------------------------------------------------------------------------
// Variant 3 — current format + undocumented sourceLang field.
// ---------------------------------------------------------------------------
{
  const name = `otcli-probe-v3-with-src-${stamp}`;
  const raw = await rawPost('/v1/glossary/create', {
    name,
    desc: 'PKM terms — variant 3: current format + sourceLang=English',
    sourceLang: 'English',
    targetLang: 'Russian',
    keys: JSON.stringify(KEYS),
    translated: JSON.stringify(TRANSLATED),
  });
  const glossaryId = (raw as { glossaryId?: string })?.glossaryId;
  summary.push({ variant: '3: with sourceLang', name, glossaryId, raw });
}

// ---------------------------------------------------------------------------
// Report + read back each via glossary/query so we can compare wire shapes.
// ---------------------------------------------------------------------------
console.log('\n=== Created glossaries ===\n');
for (const row of summary) {
  console.log(`Variant ${row.variant}`);
  console.log(`  name:       ${row.name}`);
  console.log(`  glossaryId: ${row.glossaryId ?? '(none — request failed)'}`);
  if (!row.glossaryId) console.log(`  raw:        ${JSON.stringify(row.raw, null, 2)}`);
  console.log('');
}

console.log('\n=== Raw wire shape for each (via /v1/glossary/query) ===\n');
for (const row of summary) {
  if (!row.glossaryId) continue;
  const queried = await rawPost('/v1/glossary/query', { glossaryId: row.glossaryId });
  console.log(`--- ${row.variant} (${row.glossaryId}) ---`);
  console.log(JSON.stringify(queried, null, 2));
  console.log('');
}

console.log('\n=== Test plan ===');
console.log('Open https://otranslator.com → glossaries and try to open each by name above.');
console.log("Tell me which open and which don't. Then share the glossaryId of your");
console.log('working TBX-imported glossary so I can fetch its wire shape and diff it');
console.log('against ours.');
