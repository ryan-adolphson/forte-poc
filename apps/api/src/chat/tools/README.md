# Chat tools

A tool is a function the assistant can call to look something up. The model decides when
to call it; the server runs it and sends the result back. Tools are the only way catalogue
and data sheet content reaches the model.

Each tool is one file exporting a `ChatTool` (`tool.ts`): a `declaration` that Gemini
sees, and a `run` handler. `index.ts` lists them in `chatTools`.

## Add a tool

1. Create `my-thing.tool.ts` next to the others and export a `ChatTool`.
   - `declaration.name`: snake_case and unique.
   - `declaration.description`: say when to use it, what it returns, and what an empty
     result means. The model picks tools from this text alone, so vague text causes wrong calls.
   - `declaration.parameters`: a JSON Schema object. Describe every property.
2. Write `run(args, products, documents)`.
   - `args` comes from the model. Treat it as untrusted: check types and lengths
     (`optionalString` in `tool.ts` does this for strings).
   - For a bad argument, return `{ ok: false, error: '...' }`. The model reads the error
     and can correct itself. Do not throw for bad input.
   - On success return `{ ok: true, data }`. `data` is sent to the model as JSON, so keep it small.
   - If `data` holds records an answer can be attributed to, also return `sources`
     (`catalogueSource` / `dataSheetSource` from `../sources.ts`), with `direct: true` for a
     single intentional lookup. They become the citations shown under the answer and are
     never sent to the model. A catalogue source takes the product's current data sheet
     reference from `documents.getCurrentReferences(skus)` (one query for any number of
     SKUs). `selectSources` then shows a product that has a data sheet as that data sheet,
     once, and shows a catalogue line only for a product without one.
3. Add it to the `chatTools` array in `index.ts`. Nothing else needs wiring: the request
   builder (`../gemini.ts`) sends every declaration on every request and the loop
   (`../chat.service.ts`) dispatches by name.
4. Add cases to `tools.spec.ts` (valid arguments, bad arguments), and a case to
   `../eval/scope-eval.ts` if the tool changes what the assistant can answer.
5. If the assistant should behave differently because of the tool, update `../system-prompt.ts`.

## Rules

- Read data only through `ProductsService` or `DocumentsService`. They filter to records
  visible to the bot, and to the current revision of a document, in their queries, so a
  hidden record and a missing one look identical. Never query the database from a tool, and never return
  a field that reveals a hidden record exists.
- Return the same shape for "not found" whatever the reason.
- Tools here are read-only. A tool that sends, changes or deletes something needs a
  confirmation step in the UI first; that does not exist yet.
- Do not log arguments or results.

## Check

```bash
npm test -w api                      # unit tests, no model calls
npm run eval:scope -w api            # dry run: lists the cases
npm run eval:scope -w api -- --yes   # real model, costs money: ask first
```
