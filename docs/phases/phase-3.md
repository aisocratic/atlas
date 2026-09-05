# Phase 3 — Live dashboard canvas

Owner: Atlas canvas agent. This phase moves the interactive canvas into the authenticated Next.js application while preserving the separate public Pages demo.

## Behavior

- Create, select, rename and delete named PostgreSQL dashboards. Each principal can save up to 20 dashboards with up to 40 registered card instances each. Shared-password visitors share a team principal; trusted-proxy identities have independent workspaces.
- The active dashboard ID stays in the URL, so reload and links retain the selected arrangement. Dashboard names and layouts are persisted; selection does not rewrite telemetry or another dashboard.
- Arrange cards using the same 12-column, 42-pixel row and 12-pixel gap geometry as the Pages/admin canvas. Pointer handles move/resize cards. Collisions push occupied cards down without discarding them. Tidy compacts gaps; earlier/later controls preserve reading order.
- On narrow screens cards stack in reading order. Touch-friendly order controls and width/height inputs supplement pointer gestures. Arrow keys operate focused handles. Ctrl/Cmd+Z or the Undo button restores the previous arrangement; shortcuts ignore form fields. Escape cancels a gesture. Tabs support arrows/Home/End with roving focus.
- Add/remove individual registered card instances. Registry components render shared dataset envelopes; no sample telemetry is introduced by this phase. Empty, missing configuration, disabled, fresh, stale and error states remain visible. Disabled/unconfigured cards cannot trigger collection.
- Collection uses the authenticated generic route and refreshes the card after success. Open dashboards refresh datasets every 60 seconds while visible and immediately after becoming visible. Requests are bounded to one refresh cycle, cancelled on cleanup, and fenced against stale responses. Transient errors retain previous measurements with an error/stale state.

## Persistence and conflict contract

`lib/dashboard/service.ts` uses parameterized PostgreSQL queries and owner predicates on every operation. Creates serialize per owner to enforce the workspace limit. Layout updates use a compare-and-swap revision and return the exact updated row. A stale layout update or stale delete returns 409; foreign IDs return 404. JSON bodies, names, instance IDs, card count, geometry and overlap are validated before storage.

Client edits render immediately and use a serial save queue that coalesces newer changes. Pending revisions advance only after successful responses. Layouts stay independent while switching tabs. A network failure retains the local draft and offers Retry. A conflict retains the local arrangement, disables further edits, and asks the user to explicitly reload the saved version. Reloading warns that it replaces the local arrangement. A before-unload prompt protects pending/failed local work. Undo keeps the last 30 arrangements per dashboard for the current browser session.

API routes:

| Route | Method | Result |
| --- | --- | --- |
| `/api/dashboards` | GET / POST | List owner dashboards / create one |
| `/api/dashboards/[id]` | GET / PATCH / DELETE | Read / rename / revision-checked delete |
| `/api/dashboards/[id]/layout` | PUT | Revision-checked layout save |

Every route calls `authorizeRequest` before storage. Mutations require the browser Origin and session CSRF token. Caller-provided owner fields have no effect. Names are unique per owner without case sensitivity; duplicate names return a useful validation message. Responses are no-store. The server page calls `requirePageAuth` before reading layouts and shows an actionable database error if the configured database is unavailable.

## Verification

- `ATLAS_TEST_DATABASE_URL=... pnpm test:canvas`: 7 passed against real isolated PostgreSQL and pure geometry tests. Coverage includes collision/packing, strict geometry, independent persistence, owner isolation, competing saves, stale delete, cascade, API CSRF and ignored owner spoofing.
- `ATLAS_TEST_DATABASE_URL=... PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e:canvas`: 12 passed across desktop/mobile. Tests cover pointer resize/move, real touch controls, keyboard movement/undo/tab navigation, named layout persistence/deletion, competing tabs, failed-save retry, actual collection and visible-tab polling/error recovery. A focused four-case collection/polling rerun also passed after tightening the exact successful POST assertion.
- `pnpm test:e2e:app` with the same isolated test database and Chrome channel: 4 passed, preserving all font/theme and mobile assertions against actual saved dashboards.
- `pnpm test:e2e:auth` with the isolated test database and Chrome channel: 6 passed after live canvas integration. Auth unit matrix also remains 11/11 passing.
- Production build, focused lint and type checks passed; screenshot inspection confirmed selected-tab contrast, readable telemetry, and bounded mobile layouts.
- First integrated collection proof already passed desktop and mobile: Collect now → deterministic local provider → actual collector → PostgreSQL → dataset query → registry view with 120 ms readings and explicitly unavailable regions. No seeded measurements bypassed collection.

The browser fixture uses application port 4182 and provider simulator 4183. A unique schema is migrated through the real setup CLI and removed afterward. The original font/theme suite now uses its own migrated schema, authenticates, and creates a real dashboard before checking card rendering. Auth, app and canvas screenshots have separate ignored output directories.

## Handoff

New cards enter through `cards/registry.ts` and `cards/components.ts`; the canvas does not import collectors or server secrets. Instance geometry stores `{ id, cardId, x, y, span, rows }` in `{ version: 1, cards }`. Existing persisted instances of a removed module show an unavailable message rather than losing their layout. Registry metadata supplies default dimensions for newly created dashboards/cards. The Phase 5 owner handles provider code, aggregation, its migration and region view; this phase handles the generic canvas and browser integration.

No deployment, commits, user environment changes, or operations on the live website were performed in this phase.
