# quarry-build

TypeScript API, shared libraries, a web app and a SwiftUI app, kept with hosted build and test workflows.

- Uses synthetic data only. No real records are, or should ever be, in this repository.
- Requirements: Node (see `.nvmrc`) and pnpm; Xcode and XcodeGen for `apps/apple`.
- Run `pnpm install`, then `pnpm lint`, `pnpm typecheck` and `pnpm test`.

Security issues: see `SECURITY.md`.
Builds run on hosted CI.
Pull requests get an automated code review. A passing review is a quality gate, not a trust gate: it
can be wrong or talked around by text in a change, so paths that touch security (see
`tools/ci/protected-paths.txt`) also need a named human approval on the exact head.
