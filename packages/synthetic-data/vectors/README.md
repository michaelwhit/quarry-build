# Shared test vectors

Answer keys for the rules in `the project docs`, written once so the Swift app, the server and the tests all check against the same cases.

| File | Spec | What it pins down |
|---|---|---|
| `blocked-frequencies.json` | 7.2 | Phrases an accommodation frequency may not contain, with hyphen, underscore and whitespace variants |
| `mastery.json` | 2.4 | When a window of sessions meets a goal's criterion, including `best_of` needing all m sessions, the prompt ceiling, `across`, and maintenance due dates |
| `decision-rules.json` | 2.5 | Aim line, direction-aware four-point rule, trend status (none when the aim slope is zero), stale data including goals with no data yet |

The spec was silent in 12 places. The project manager decided them in `the project docs` (BF-1, BF-2, MA-1 to MA-4, DR-1 to DR-6); each file's `rule` text states the decisions it encodes, and `open_questions` is empty. Two decisions are defaults awaiting confirmation (MA-2 prompt-ceiling denominator, MA-3 `across`); if she changes them, change the spec, this file and the vectors together.

## Who uses them

- `test/vectors.test.ts` runs every vector against `test/reference-rules.ts`, a separate TypeScript reading of the spec and the decisions. That keeps a wrong vector from misleading the Swift tests. It runs in the normal TypeScript CI job.
- The Swift package that holds the decision-rule and mastery math (one copy for both app targets) loads these files in its own tests (`Bundle.module` resource, or a path relative to the package). It must pass every case and may not carry a second copy of the rules. Its author owns that wiring.
- The library lint on the server and the bundle validator in `packages/library` use `blocked-frequencies.json` for the accommodation frequency rule. Running these vectors found that the first regex missed `as  needed` with two spaces or a line break. Vectors for the other lint rules (vague verbs, criterion matches method, readability, no student data) are still to add.

## Tests to add

- **Draft durability.** A session draft survives app kill, reboot and low battery. Plan: a Persistence test that writes a draft, drops the store object without ending the session, reopens the database file, and finds the draft and every tap with its `observed_at`; the same against a copy of the file taken mid-write. The kill and reboot cases run as an XCUITest on a Mac.
- **Clock drift.** `observed_at` is the device time per tap; the server flags `client_created_at` more than 5 minutes ahead. A test for a lower bound on backdating is to add.
- **Auto-end.** A session left open for 20 minutes ends itself and keeps its data.
- **Undo.** One tap undoes the last tap, including across a draft resume.
