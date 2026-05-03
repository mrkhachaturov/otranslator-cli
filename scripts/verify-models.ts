// One-shot probe: run a short translateTexts call against one model from each
// pricing tier so we can verify the API honours the `model` parameter and see
// per-tier credit costs in real time.
//
// Run with:  node --env-file=.env --import tsx scripts/verify-models.ts
//
// Costs roughly 0–6 credits depending on free-quota state.
import 'dotenv/config';
import { OTranslatorClient } from '../src/client.js';
import { OTranslatorError } from '../src/errors.js';

const apiKey = process.env.OTRANSLATOR_API_KEY;
if (!apiKey) {
  console.error('OTRANSLATOR_API_KEY missing. Put it in .env or export it.');
  process.exit(2);
}

const client = new OTranslatorClient({ apiKey });
const text = 'The quick brown fox jumps over the lazy dog.';

const TIERS: Array<{ tier: string; model: string }> = [
  { tier: 'Basic    ', model: 'gpt-5-mini' },
  { tier: 'Advanced ', model: 'gpt-5.4' },
  { tier: 'Inference', model: 'gpt-5.4-thinking' },
];

const before = await client.me();
console.log(`Balance before: ${before.balance} credits\n`);

for (const { tier, model } of TIERS) {
  try {
    const t0 = Date.now();
    const res = await client.translateTexts({
      texts: [text],
      fromLang: 'English',
      toLang: 'Spanish',
      model,
    });
    const ms = Date.now() - t0;
    console.log(`[${tier}] ${model.padEnd(20)} ${ms.toString().padStart(5)}ms`);
    console.log(`           translated:  ${res.translatedTexts[0]}`);
    console.log(`           usedCredits: ${res.usedCredits}, price: ${res.price}\n`);
  } catch (err) {
    if (err instanceof OTranslatorError) {
      console.log(
        `[${tier}] ${model.padEnd(20)} ERROR: ${err.message} (${err.code}/${err.status ?? '-'})\n`,
      );
    } else {
      console.log(`[${tier}] ${model.padEnd(20)} ERROR: ${(err as Error).message}\n`);
    }
  }
}

const after = await client.me();
console.log(`Balance after:  ${after.balance} credits (delta: ${after.balance - before.balance})`);
