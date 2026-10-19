# quarry-build

TypeScript API, shared libraries, a web app and a SwiftUI app, kept with hosted build and test workflows.

- Uses synthetic data only. No real records are, or should ever be, in this repository.
- Requirements: Node (see `.nvmrc`) and pnpm; Xcode and XcodeGen for `apps/apple`.
- Run `pnpm install`, then `pnpm lint`, `pnpm typecheck` and `pnpm test`.

Security issues: see `SECURITY.md`.
Builds run on hosted CI.
