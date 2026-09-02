# Contributing to Atlas

Thanks for taking a look. Atlas is early, so the most useful contributions right
now are bug reports from actually running it, and feedback on the data model.

## Getting set up

```bash
pnpm install
docker compose up -d db
pnpm setup
pnpm dev
```

## Before opening a pull request

```bash
pnpm verify     # typecheck + lint + unit tests
pnpm test:e2e   # Playwright, needs a running database
```

CI runs both against a real Postgres. Because Atlas writes plain SQL rather than
using an ORM, database behaviour is testable — if you touch a query, add a test
that exercises it against the real schema rather than a mock.

## Conventions

- **SQL, not an ORM.** Queries live in `lib/db/*.ts` as parameterised SQL. Never
  interpolate a value into a query string; dynamic column names come from a
  frozen allowlist.
- **Migrations are append-only.** Add `db/migrations/NNNN_description.sql`; never
  edit an applied file. Run `pnpm db:schema` afterwards and commit the result.
- **Comments explain why, not what.** Several files carry load-bearing comments
  about non-obvious behaviour — a missing `onDragOver` handler, an imperative ref
  that exists to avoid re-renders. If you are tempted to "clean one up", read it
  first; it is probably describing a bug that was fixed by removing something.
- **The type scale.** Sizes come from the `text-*` scale in `app/globals.css`.
  If you add a step, add it to `TYPE_SCALE` in `lib/utils.ts` too — the test in
  `tests/cn-type-scale.test.ts` explains what breaks otherwise.

## Reporting a security issue

See SECURITY.md — please do not open a public issue.

## License

Contributions are accepted under the MIT license that covers this project.
