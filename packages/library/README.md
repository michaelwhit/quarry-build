# @iep/library

The signed **starter bundle** for the goal and accommodation libraries (T2-10). The app reads it with no server. It holds no student data.

- **Format** (`src/types.ts`): an envelope `{format, key_id, algorithm: "ed25519", payload, signature}`. `payload` is the base64 of the JSON content (`taxonomy`, `goals`, `accommodations`, `phrases`); `signature` covers exactly those bytes, so readers verify bytes first and parse second, with no canonical-JSON rules to share between languages.
- **Trust**: the app pins public keys by `key_id`. Anything signed by another key, or altered by one byte, is refused. Production signing keys live in the release pipeline, never in the repo; `gen-key` writes the private key to a path you choose.
- **Versioning**: `bundle_version` only goes up. The app passes the version it has installed and refuses an older or equal bundle (`rollback`), so a replayed old file cannot bring back retired items.
- **Hiding**: a district hides items with a separate list (`applyHidden`; Swift `hiding(_:)`). The bundle is never edited, so the signature stays valid and un-hiding is instant.
- **Validation** (`src/validate.ts`): structure, enums, references and unique ids, plus banned frequencies ("as needed" and friends). It reports where and why, never the text. Wording quality (vague verbs, readability) is the curator lint in T2-9.
- **Content source**: `content/starter/{taxonomy,goals,accommodations,phrases}.json`, written by the content track (C-1, C-2).

```
node src/cli.ts gen-key --private ~/keys/starter.pem        # prints key_id and public key
node src/cli.ts check --content ../../content/starter
node src/cli.ts build --content ../../content/starter --key ~/keys/starter.pem --version 1 --out starter.json
node src/cli.ts verify --bundle starter.json --public-key <base64>
```

The Swift reader is `apps/apple/Packages/StarterLibrary` (`StarterBundle.open`).
