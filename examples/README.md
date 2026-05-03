# Examples

Reusable starting points for `otcli`. Not shipped in the npm tarball — copy the file or paste its contents into your own project.

## Glossaries

### `glossaries/dev-terms-en-preserve.json`

Common software-engineering terms (`API`, `commit`, `pull request`, `OAuth`, …) that translators routinely keep in English when localising technical documentation. The `translated` map sets every English term to itself so the model leaves them untouched in the target language.

```bash
otcli glossary-create \
  --name "Dev terms (preserve in Russian)" \
  --target-lang Russian \
  --desc "Software-engineering jargon kept verbatim in Russian translations." \
  --from-file examples/glossaries/dev-terms-en-preserve.json
```

Then attach it to a translation:

```bash
otcli create -f docs.md \
  --from English --to Russian \
  --glossary "Dev terms (preserve in Russian)"
```

To customise — replace `"commit": "commit"` with `"commit": "коммит"` if you want the term localised, edit the file, and re-run `glossary-create` (or `glossary-update --from-file …` against an existing glossaryId).

## Building your own glossary

The shape is two parallel collections:

```json
{
  "keys": ["term-1", "term-2", "..."],
  "translated": {
    "term-1": "<target-language form>",
    "term-2": "<target-language form>"
  }
}
```

`keys` is the source-language list; `translated` maps each source term to its target-language form. The two must agree on the term set. Source terms are matched as-is, in their nominative/base form — the translation model decides how to inflect them in context.

## Importing from TBX

The web UI accepts TBX file uploads but the public API does not. A future `otcli glossary-import-tbx` will parse a TBX file and convert it to the `{ keys, translated }` shape above so you can pipe it into `glossary-create`. Until then, hand-convert if you have a TBX export — the relevant fields are the two `<langSet xml:lang="…">` blocks per `<termEntry>`.
