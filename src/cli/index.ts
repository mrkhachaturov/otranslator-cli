import { Command, Option } from 'commander';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildClient,
  fileFromPath,
  output,
  parseJson,
  resolveApiKey,
  run,
  tryBuildClient,
  type GlobalOptions,
} from './util.js';
import { configPath, deleteStoredConfig, writeStoredConfig } from './config-store.js';
import { promptSecret } from './prompt.js';
import { OTranslatorClient } from '../client.js';
import { OTranslatorError } from '../errors.js';
import type {
  CreateGlossaryInput,
  CreateTaskInput,
  TranslateTextsInput,
  UpdateGlossaryInput,
} from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
// dist/cli/index.js → ../../package.json. src/cli/index.ts (via tsx) → ../../package.json.
const pkg = JSON.parse(await readFile(resolve(here, '..', '..', 'package.json'), 'utf-8')) as {
  version: string;
};

const program = new Command();

program
  .name('otcli')
  .description(
    [
      'CLI for the OTranslator AI translation API.',
      '',
      'Installed by `npm install otranslator-cli`. Every command prints JSON to',
      'stdout and exits non-zero on failure with the API error body on stderr.',
      'Set OTRANSLATOR_API_KEY in the environment, or pass --api-key on any',
      'command. Run `otcli examples` for a guided tour with the live model list.',
    ].join('\n'),
  )
  .version(pkg.version)
  .addOption(new Option('--api-key <key>', 'OTranslator secret key').env('OTRANSLATOR_API_KEY'))
  .addOption(new Option('--base-url <url>', 'API base URL').env('OTRANSLATOR_BASE_URL'))
  .addOption(
    new Option('--timeout <ms>', 'Per-request timeout in milliseconds').env(
      'OTRANSLATOR_TIMEOUT_MS',
    ),
  )
  .addHelpText(
    'after',
    `
Common workflows:

  # Inspect what's available
  $ otcli languages | jq '.languages | length'
  $ otcli models | jq -r '.models[]'
  $ otcli me                                       # → { "balance": <credits> }

  # Translate a string synchronously
  $ otcli translate "Hello, world." --from English --to Spanish

  # Document workflow: free preview → paid full translation
  $ TASK=$(otcli create -f contract.pdf --from English --to French --preview | jq -r .taskId)
  $ otcli task "$TASK"                             # poll until "status": "Completed"
  $ otcli start "$TASK" --pay-with-credits --model "$(otcli models | jq -r '.models[1]')"

For per-command examples, run:  otcli <command> --help
For a guided tour with the live model list:  otcli examples
`,
  );

const globals = (cmd: Command): GlobalOptions => cmd.optsWithGlobals<GlobalOptions>();

// ---------------------------------------------------------------------------
// Translation tasks
// ---------------------------------------------------------------------------

program
  .command('create')
  .description('Submit a document for translation')
  .requiredOption('-f, --file <path>', 'Path to the file to translate')
  .requiredOption('--from <lang>', 'Source language')
  .requiredOption('--to <lang>', 'Target language')
  .option('--model <name>', 'Translation model')
  .option('--description <text>', 'Document context for the translator')
  .option('--glossary <name>', 'Glossary name to apply')
  .option('--preview', 'Generate a 2-credit preview only')
  .option('--translate-images', 'Translate embedded images')
  .option('--no-translate-filename', 'Do not translate the file name')
  .option('--password <pwd>', 'Password for encrypted PDFs')
  .option('--ignore-comments')
  .option('--ignore-notes', 'Ignore PPTX speaker notes')
  .option('--ignore-headers-footers', 'Ignore DOCX headers/footers')
  .option('--ignore-hidden', 'Ignore hidden PPTX slides')
  .option('--ignore-masters', 'Ignore PPTX master slide text')
  .option('--ignore-sheet-names', 'Skip XLSX sheet name translation')
  .option('--regex-pattern <pattern>', 'Only translate matches (txmsg only)')
  .option('--regex-flags <flags>', 'Flags for --regex-pattern')
  .option('--webhook-url <url>', 'Webhook URL for status callbacks')
  .action((opts, cmd: Command) => {
    run(async () => {
      const client = buildClient(globals(cmd));
      const file = await fileFromPath(opts.file);
      const input: CreateTaskInput = {
        file,
        fromLang: opts.from,
        toLang: opts.to,
      };
      if (opts.model) input.model = opts.model;
      if (opts.description) input.fileDescription = opts.description;
      if (opts.glossary) input.glossary = opts.glossary;
      if (opts.preview) input.preview = true;
      if (opts.translateImages) input.shouldTranslateImage = true;
      if (opts.translateFilename === false) input.shouldTranslateFileName = false;
      if (opts.password) input.password = opts.password;
      if (opts.ignoreComments) input.ignoreComments = true;
      if (opts.ignoreNotes) input.ignoreNotes = true;
      if (opts.ignoreHeadersFooters) input.ignoreHeadersAndFooters = true;
      if (opts.ignoreHidden) input.ignoreHidden = true;
      if (opts.ignoreMasters) input.ignoreMasters = true;
      if (opts.ignoreSheetNames) input.ignoreSheetNames = true;
      if (opts.regexPattern) input.extractTextRegExpPattern = opts.regexPattern;
      if (opts.regexFlags) input.extractTextRegExpFlags = opts.regexFlags;
      if (opts.webhookUrl) input.webhookUrl = opts.webhookUrl;
      output(await client.createTask(input));
    });
  })
  .addHelpText(
    'after',
    `
Examples (pick a --model id from \`otcli models\`):
  $ otcli create -f report.pdf --from English --to Spanish --preview
  $ otcli create -f deck.pptx --from English --to Japanese \\
      --model <model-id> --translate-images --description "Q4 board deck"
  $ otcli create -f locked.pdf --from English --to French \\
      --password 's3cret' --webhook-url https://example.com/hook
`,
  );

program
  .command('task <taskId>')
  .description('Query a translation task')
  .action((taskId: string, _opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).queryTask(taskId)));
  });

program
  .command('delete-task <taskId>')
  .description('Delete a translation task')
  .action((taskId: string, _opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).deleteTask(taskId)));
  });

program
  .command('start <taskId>')
  .description('Restart a terminated task or pay credits to convert a preview')
  .option('--pay-with-credits', 'Pay credits to convert the preview into a full translation')
  .option('--model <name>', 'Model to use for the paid translation')
  .action((taskId: string, opts, cmd: Command) => {
    run(async () => {
      const client = buildClient(globals(cmd));
      const result = await client.restartTask({
        taskId,
        ...(opts.payWithCredits ? { payWithCredits: true } : {}),
        ...(opts.model ? { model: opts.model } : {}),
      });
      output(result);
    });
  })
  .addHelpText(
    'after',
    `
Examples (pick --model from \`otcli models\`):
  # Convert a preview into a full translation with a chosen model
  $ otcli start <taskId> --pay-with-credits --model <model-id>

  # Restart a Terminated task without re-paying
  $ otcli start <taskId>
`,
  );

program
  .command('wait <taskId>')
  .description('Poll a translation task until it reaches a terminal status')
  .option('--interval <ms>', 'Poll interval', '5000')
  .option('--max-wait <ms>', 'Total time budget', '300000')
  .action((taskId: string, opts, cmd: Command) => {
    run(async () => {
      const client = buildClient(globals(cmd));
      const task = await client.waitForTask(taskId, {
        intervalMs: Number(opts.interval),
        maxMs: Number(opts.maxWait),
      });
      output(task);
    });
  });

program
  .command('download <taskId>')
  .description('Download the translated file for a Completed task')
  .option('-o, --output <path>', 'Output path (default: original filename from task.fileTitle)')
  .option('--bilingual', 'Download the bilingual side-by-side rendering')
  .option('--wait', 'Poll until status is Completed before downloading')
  .option('--interval <ms>', 'Poll interval when --wait is set', '5000')
  .option('--max-wait <ms>', 'Time budget when --wait is set', '300000')
  .option('--force', 'Overwrite an existing file at the output path')
  .action((taskId: string, opts, cmd: Command) => {
    run(async () => {
      const client = buildClient(globals(cmd));
      if (opts.wait) {
        await client.waitForTask(taskId, {
          intervalMs: Number(opts.interval),
          maxMs: Number(opts.maxWait),
        });
      }
      const result = await client.downloadTranslated(taskId, {
        bilingual: Boolean(opts.bilingual),
      });
      const outputPath = (opts.output as string | undefined) ?? result.filename;
      if (!opts.force) {
        try {
          await stat(outputPath);
          process.stderr.write(`Refusing to overwrite ${outputPath}. Pass --force or -o <path>.\n`);
          process.exit(1);
        } catch {
          // File doesn't exist — proceed.
        }
      }
      const buffer = Buffer.from(await result.blob.arrayBuffer());
      await writeFile(outputPath, buffer);
      output({
        path: outputPath,
        bytes: buffer.length,
        contentType: result.contentType,
        bilingual: Boolean(opts.bilingual),
        sourceUrl: opts.bilingual
          ? result.task.translatedBilingualFileUrl
          : result.task.translatedFileUrl,
      });
    });
  })
  .addHelpText(
    'after',
    `
Examples:
  $ otcli download <taskId>                          # writes to ./<task.fileTitle>
  $ otcli download <taskId> -o translated.md         # explicit path
  $ otcli download <taskId> --bilingual              # writes <name>.bilingual.<ext>
  $ otcli download <taskId> --wait                   # poll until Completed, then fetch
  $ otcli download <taskId> --wait --max-wait 600000 # 10-minute budget for big docs
`,
  );

program
  .command('texts <taskId>')
  .description('Retrieve original/translated text pairs')
  .action((taskId: string, _opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).queryTexts(taskId)));
  });

program
  .command('revise <taskId>')
  .description('Submit revised translations from a JSON file or inline JSON')
  .addHelpText(
    'after',
    `
Examples:
  # Inline JSON: keys are source segments from \`otcli texts <taskId>\`
  $ otcli revise <taskId> \\
      --json '{"Sample Document":"Documento de muestra"}'

  # From a file
  $ otcli texts <taskId> | jq '.texts' > revisions.json
  $ # ...edit revisions.json...
  $ otcli revise <taskId> --file revisions.json
`,
  )
  .option('--file <path>', 'Path to a JSON file mapping segment-key → revised text')
  .option('--json <json>', 'Inline JSON mapping segment-key → revised text')
  .action((taskId: string, opts, cmd: Command) => {
    run(async () => {
      if (!opts.file && !opts.json) {
        process.stderr.write('Pass --file <path> or --json <json>\n');
        process.exit(2);
      }
      const raw = opts.file ? await readFile(opts.file, 'utf-8') : opts.json;
      const revisedTexts = parseJson<Record<string, string>>('json', raw);
      output(await buildClient(globals(cmd)).updateTexts({ taskId, revisedTexts }));
    });
  });

// ---------------------------------------------------------------------------
// Synchronous text translation
// ---------------------------------------------------------------------------

program
  .command('translate <text...>')
  .description('Translate one or more strings synchronously')
  .requiredOption('--from <lang>', 'Source language')
  .requiredOption('--to <lang>', 'Target language')
  .option('--model <name>', 'Translation model')
  .option('--description <text>', 'Background context for the translator')
  .action((texts: string[], opts, cmd: Command) => {
    run(async () => {
      const input: TranslateTextsInput = {
        texts,
        fromLang: opts.from,
        toLang: opts.to,
      };
      if (opts.model) input.model = opts.model;
      if (opts.description) input.fileDescription = opts.description;
      output(await buildClient(globals(cmd)).translateTexts(input));
    });
  })
  .addHelpText(
    'after',
    `
Examples (pick --model from \`otcli models\`):
  $ otcli translate "Hello, world." --from English --to Spanish
  $ otcli translate "Order #123" "Total: 99 USD" \\
      --from English --to French --description "E-commerce receipt"
  $ otcli translate "Mass surveillance" \\
      --from English --to "Simplified Chinese" --model <model-id>
`,
  );

// ---------------------------------------------------------------------------
// Glossaries
// ---------------------------------------------------------------------------

program
  .command('glossary-create')
  .description('Create a glossary')
  .requiredOption('--name <name>', 'Glossary name')
  .requiredOption('--target-lang <lang>', 'Target language this glossary applies to')
  .option('--desc <text>', 'Glossary description')
  .option('--keys <json>', 'Source terminology list as JSON array')
  .option('--translated <json>', 'Term-to-translation mapping as JSON object')
  .option('--from-file <path>', 'Read { keys, translated } from a JSON file')
  .action((opts, cmd: Command) => {
    run(async () => {
      let keys: string[] | undefined;
      let translated: Record<string, string> | undefined;
      if (opts.fromFile) {
        const fromFile = parseJson<{ keys: string[]; translated: Record<string, string> }>(
          'from-file',
          await readFile(opts.fromFile, 'utf-8'),
        );
        keys = fromFile.keys;
        translated = fromFile.translated;
      } else {
        if (!opts.keys || !opts.translated) {
          process.stderr.write('Pass --keys + --translated, or --from-file\n');
          process.exit(2);
        }
        keys = parseJson<string[]>('keys', opts.keys);
        translated = parseJson<Record<string, string>>('translated', opts.translated);
      }
      const input: CreateGlossaryInput = {
        name: opts.name,
        targetLang: opts.targetLang,
        keys: keys!,
        translated: translated!,
      };
      if (opts.desc) input.desc = opts.desc;
      output(await buildClient(globals(cmd)).createGlossary(input));
    });
  })
  .addHelpText(
    'after',
    `
Examples:
  # Inline JSON
  $ otcli glossary-create --name "Finance EN" --target-lang English \\
      --keys '["储蓄分流"]' \\
      --translated '{"储蓄分流":"Diversion of household deposits"}'

  # From a file: { "keys": [...], "translated": { ... } }
  $ otcli glossary-create --name "Tech terms" \\
      --target-lang English --from-file glossary.json
`,
  );

program
  .command('glossary <glossaryId>')
  .description('Query a glossary by ID')
  .action((glossaryId: string, _opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).queryGlossary(glossaryId)));
  });

program
  .command('glossary-update <glossaryId>')
  .description('Update a glossary')
  .option('--name <name>')
  .option('--desc <text>')
  .option('--target-lang <lang>')
  .option('--keys <json>', 'JSON array of terms')
  .option('--translated <json>', 'JSON mapping of term → translation')
  .action((glossaryId: string, opts, cmd: Command) => {
    run(async () => {
      const input: UpdateGlossaryInput = { glossaryId };
      if (opts.name) input.name = opts.name;
      if (opts.desc) input.desc = opts.desc;
      if (opts.targetLang) input.targetLang = opts.targetLang;
      if (opts.keys) input.keys = parseJson<string[]>('keys', opts.keys);
      if (opts.translated)
        input.translated = parseJson<Record<string, string>>('translated', opts.translated);
      output(await buildClient(globals(cmd)).updateGlossary(input));
    });
  });

program
  .command('glossary-delete <glossaryId>')
  .description('Delete a glossary')
  .action((glossaryId: string, _opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).deleteGlossary(glossaryId)));
  });

// ---------------------------------------------------------------------------
// Metadata + account
// ---------------------------------------------------------------------------

program
  .command('filetypes')
  .description('List supported file types')
  .action((_opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).filetypes()));
  });

program
  .command('languages')
  .description('List supported languages')
  .action((_opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).languages()));
  });

program
  .command('models')
  .description('List supported translation models')
  .action((_opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).models()));
  });

program
  .command('me')
  .description('Show account information (credit balance, etc.)')
  .action((_opts, cmd: Command) => {
    run(async () => output(await buildClient(globals(cmd)).me()));
  });

// ---------------------------------------------------------------------------
// Auth: login / logout / whoami
// ---------------------------------------------------------------------------

program
  .command('login')
  .description(
    `Save an API key to ${configPath()} (mode 0600). Resolution order at runtime: --api-key flag > OTRANSLATOR_API_KEY env var > stored config.`,
  )
  .option('--key <key>', 'Provide the key non-interactively (otherwise prompts)')
  .action((opts) => {
    run(async () => {
      let key: string = opts.key ?? '';
      if (!key) key = await promptSecret('OTranslator API key: ');
      key = key.trim();
      if (!key) {
        process.stderr.write('No key provided. Aborting.\n');
        process.exit(2);
      }
      // Verify the key actually works before persisting it.
      const client = new OTranslatorClient({ apiKey: key });
      try {
        const account = await client.me();
        await writeStoredConfig({ apiKey: key });
        output({ saved: true, path: configPath(), balance: account.balance });
      } catch (err) {
        const message = err instanceof OTranslatorError ? err.message : (err as Error).message;
        process.stderr.write(`Login failed: ${message}\n`);
        process.exit(1);
      }
    });
  })
  .addHelpText(
    'after',
    `
Examples:
  $ otcli login                              # interactive prompt, echo hidden
  $ otcli login --key "sk-…"                 # non-interactive
  $ printf '%s' "$KEY" | otcli login         # piped from stdout
`,
  );

program
  .command('logout')
  .description('Remove the stored API key from the config file.')
  .action(() => {
    run(async () => {
      const removed = await deleteStoredConfig();
      output({ removed, path: configPath() });
    });
  });

program
  .command('whoami')
  .description(
    'Show which source the active API key came from (flag / env / config) and the current balance.',
  )
  .action((_opts, cmd: Command) => {
    run(async () => {
      const opts = globals(cmd);
      const { apiKey, source } = resolveApiKey(opts);
      const out: Record<string, unknown> = {
        source,
        configPath: configPath(),
      };
      if (!apiKey) {
        out.hint = 'Run `otcli login`, set OTRANSLATOR_API_KEY, or pass --api-key.';
        output(out);
      }
      out.keyHint = `${apiKey.slice(0, Math.min(4, apiKey.length))}…${apiKey.slice(-4)}`;
      try {
        const client = new OTranslatorClient({ apiKey });
        const account = await client.me();
        out.balance = account.balance;
      } catch (err) {
        out.error = err instanceof OTranslatorError ? err.message : (err as Error).message;
      }
      output(out);
    });
  });

// ---------------------------------------------------------------------------
// Help / discoverability
// ---------------------------------------------------------------------------

// Tier classification mirrors what the OTranslator web UI showed on
// 2026-05-03. New model ids the API returns get bucketed under "Other" so we
// don't lie about pricing for models we haven't seen yet.
const KNOWN_TIERS: Record<string, 'Basic' | 'Advanced' | 'Inference'> = {
  'gpt-5-mini': 'Basic',
  'gpt-5.4': 'Advanced',
  'gpt-5.4-thinking': 'Inference',
  'claude-4.5-haiku': 'Basic',
  'claude-4.6-sonnet': 'Advanced',
  'claude-4.6-sonnet-thinking': 'Inference',
  'gemini-3.1-flash': 'Basic',
  'gemini-3.1-pro': 'Advanced',
  'gemini-3.1-thinking': 'Inference',
  'deepseek-3.2': 'Basic',
  'deepseek-3.2-thinking': 'Advanced',
};

function familyOf(model: string): string {
  if (model.startsWith('gpt-')) return 'GPT';
  if (model.startsWith('claude-')) return 'Claude';
  if (model.startsWith('gemini-')) return 'Gemini';
  if (model.startsWith('deepseek-')) return 'DeepSeek';
  return 'Other';
}

function formatModels(models: string[]): string {
  if (models.length === 0) return '  (no models returned)\n';
  const families = new Map<string, string[]>();
  for (const m of [...models].sort()) {
    const f = familyOf(m);
    if (!families.has(f)) families.set(f, []);
    families.get(f)!.push(m);
  }
  const order = ['GPT', 'Claude', 'Gemini', 'DeepSeek', 'Other'];
  const present = order.filter((f) => families.has(f));
  const colWidth = Math.max(...models.map((m) => m.length)) + 2;
  let out = '';
  for (const family of present) {
    out += `  ${family}\n`;
    for (const m of families.get(family)!) {
      const tier = KNOWN_TIERS[m] ?? '?';
      out += `    ${m.padEnd(colWidth)}${tier}\n`;
    }
  }
  return out;
}

async function buildExamples(opts: GlobalOptions): Promise<string> {
  const client = tryBuildClient(opts);
  let modelsBlock: string;
  if (!client) {
    modelsBlock = `  Set OTRANSLATOR_API_KEY and re-run for the live list,
  or run \`otcli models\`.\n`;
  } else {
    try {
      const { models } = await client.models();
      modelsBlock = formatModels(models);
    } catch (err) {
      modelsBlock = `  (failed to fetch /v1/models: ${(err as Error).message})\n  Run \`otcli models\` to retry.\n`;
    }
  }

  return `
otcli — guided tour
=============================

Auth
----
The CLI resolves credentials in this order:
  1. \`--api-key\` flag
  2. \`OTRANSLATOR_API_KEY\` environment variable
  3. \`otcli login\` → ~/.config/otranslator-cli/config.json (mode 0600)

Quick start:
  otcli login        # interactive, echo hidden; verifies the key against /v1/me
  otcli whoami       # confirms which source is in use and prints the balance
  otcli logout       # removes the stored key

The key is sent as the raw Authorization header. No "Bearer " prefix.

Discovery
---------
  otcli languages    # supported source/target languages, "Any Language" is the wildcard
  otcli filetypes    # supported document formats
  otcli models       # current list of model ids (always check this for fresh names)
  otcli me           # { "balance": <credits> }

Available models right now
--------------------------
${modelsBlock}
  Tier annotations are from the OTranslator web UI as of 2026-05-03 and apply
  to document full translation. Sync \`translateTexts\` costs 2 credits across
  every tier we measured. New models will show as "?" — verify in the web UI.

Synchronous text translation
----------------------------
  otcli translate "Hello, world." --from English --to Spanish
  # → { "taskId", "translatedTexts": ["Hola, mundo."], "price", "usedCredits" }

Document workflow (preview, then pay for full)
----------------------------------------------
  # 1. Submit a free preview (~first 2,000 words)
  TASK=$(otcli create -f contract.pdf --from English --to French --preview \\
           | jq -r .taskId)

  # 2. Poll until status is Completed (Waiting → Processing → Completed)
  while :; do
    STATE=$(otcli task "$TASK" | jq -r .status)
    [ "$STATE" = Completed ] && break
    [ "$STATE" = Terminated ] && { echo "task failed"; exit 1; }
    sleep 5
  done

  # 3. Inspect the preview — \`price\` is what a full translation will cost
  otcli task "$TASK" | jq '{status, price, translatedFileUrl}'

  # 4. Convert preview into a full translation
  #    Pick the model id from the list above (or \`otcli models\`).
  otcli start "$TASK" --pay-with-credits --model <model-id>

  # 5. Cleanup
  otcli delete-task "$TASK"

Editing translations
--------------------
  # Pull source/translation pairs (the keys are the source segments)
  otcli texts "$TASK" | jq '.texts'

  # Submit revisions
  otcli revise "$TASK" \\
    --json '{"Sample Document":"Documento corregido"}'

Glossaries
----------
  GID=$(otcli glossary-create --name "Finance EN" --target-lang English \\
          --keys '["储蓄分流"]' \\
          --translated '{"储蓄分流":"Diversion of household deposits"}' \\
          | jq -r .glossaryId)

  otcli create -f report.pdf --from "Simplified Chinese" --to English \\
    --glossary "Finance EN"

  otcli glossary "$GID"
  otcli glossary-delete "$GID"

Errors
------
Failures exit non-zero; the API error body is printed to stderr as JSON:
  { "error": "...", "code": "HTTP_ERROR" | "NETWORK_ERROR" | "TIMEOUT" | ..., "status": 401 }
`;
}

program
  .command('examples')
  .description(
    'Print a guided tour of the API, including the live model list when an API key is available.',
  )
  .action((_opts, cmd: Command) => {
    run(async () => {
      process.stdout.write(await buildExamples(globals(cmd)));
      process.exit(0);
    });
  });

program.parseAsync(process.argv);
