# Contributing to Atlas

Atlas is early. This repository currently ships a static project website and
an interactive dashboard canvas with sample data. Product and data-model feedback is welcome;
the app, database, and collectors are still planned.

## Getting set up

```bash
python3 -m http.server 4175 --directory site
```

Open http://localhost:4175. No dependency installation or database is required.

## Before opening a pull request

```bash
node site/scripts/sync-design.mjs --check
node --test tests/dashboard.test.mjs
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Check desktop and mobile layouts, internal links, the mobile menu, and the
dark → light → system theme cycle. Exercise dashboard creation, selection,
renaming, drag/drop, pointer and keyboard resizing, undo, and reload persistence.
Keep canvas state changes immutable so undo snapshots and other dashboard tabs
remain independent. Add a focused test when changing state or persistence. Keep shared appearance in
[`@aisocratic/design`](https://github.com/aisocratic/stoa); only Atlas-specific
preview and content styling belongs in `site/styles.css`. See the README for
refreshing the exact vendored design stylesheet and its integrity metadata.

Application conventions and tests will be documented when their roadmap phases
land. Do not add setup instructions for commands that are not implemented.

## Reporting a security issue

See [SECURITY.md](SECURITY.md); please do not open a public issue.

## License

Contributions are accepted under the MIT license that covers this project.
