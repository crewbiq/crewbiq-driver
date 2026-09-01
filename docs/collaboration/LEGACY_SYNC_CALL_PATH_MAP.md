# CrewBIQ Legacy Sync Call-Path Evidence Map

Status: READ-ONLY EVIDENCE DOCUMENT. No path removed or disabled. No runtime,
configuration, deployment, migration, merge, or data change. No new
instrumentation or telemetry added.

Prepared by: Claude (implementer role).

Scope: every Google/Apps-Script URL literal, persisted or driver-derived URL
source, guard, caller, and outbound fetch/network sink in exact production
source at commit `bcfd74a22449b974755b8b48bc01a3b261107b93` (`index.html`,
`sync.js`, `restore-hotfix.js`, `sw.js`).

## 1. URL literals (sources)

| Literal | File:line | Notes |
|---|---|---|
| `https://script.google.com/macros/s/AKfycbxsygN14QcavY70qXGherETIzM_VD8OLNBPL2eUU2GxOroK9D4mHIE8pwW6g5nfHvmDGg/exec` | `index.html:1443` (`DEFAULT_SYNC_URL`) | The general-purpose Apps Script default. Read by 5 call sites (below). |
| `https://script.google.com/macros/s/crewbiq-expenses/exec` | `restore-hotfix.js:283` | A second, distinct Apps Script endpoint, used only inside `syncExpensesNow()` as the fallback when `driver.syncUrl` is unset. |

## 2. Persisted / driver-derived URL sources

| Source | File:line | Resolution order |
|---|---|---|
| `getAuthSyncUrl()` | `index.html:1761-1769` | Returns, in order: an explicit non-default form input value → `localStorage[K+'_savedSyncUrl']` → `driver.syncUrl` → the raw form input → `DEFAULT_SYNC_URL`. No Orchestrator-aware branch exists in this function. |
| `localStorage[K+'_savedSyncUrl']` | written at `index.html:1808`, `2647`, `6032`, `6536`; read at `index.html:1763`, `2635`, `6441`, `6759` | Device-local persisted copy of whatever `syncUrl` was last used, seeded from Apps Script/manual input, not from the Orchestrator. |
| `driver.syncUrl` | set at `index.html:1704`, `1997`, `2013`, `6033`, `6487`; read at `index.html:2635`, `2880`; read at `sync.js:585`, `607`, `651`, `666`, `763`, `835`, `843` | Populated at signup/login/restore time via `applyAuthRestoreData()` (`index.html:1955-2013`), which itself falls back to `DEFAULT_SYNC_URL` if no `syncUrl` argument is supplied. This is the field `sync.js`'s entire legacy push/pull surface reads directly — `sync.js` has no independent Apps-Script-awareness of its own; it inherits whatever `index.html` put in `driver.syncUrl`. |
| `getOrchestratorSyncUrl()` | `sync.js:143` (definition), used at `sync.js:378`, `461`, `488` | A separate, distinct URL resolver for the PostgreSQL/Orchestrator DB-copy path. Confirmed structurally independent from `driver.syncUrl`/`getAuthSyncUrl()` — the two resolvers do not share code paths. |

## 3. Guards

| Guard | File:line | Effect |
|---|---|---|
| `if (!(driver && driver.syncUrl))` | `sync.js:585, 651, 763, 835` | Blocks the corresponding legacy call only when `driver.syncUrl` is completely empty. Since `driver.syncUrl` defaults to `DEFAULT_SYNC_URL` at signup/login time (§2), this guard does not block the Apps Script path for any account that completed normal auth. |
| `if (!token \|\| !identityKey(driver))` | `restore-hotfix.js:280` | Blocks `syncExpensesNow()` only when there is no session token or no resolvable driver identity — not specific to Apps Script vs. Orchestrator. |
| Service-worker hostname/method match | `sw.js:94-102` | `url.hostname.includes('script.google.com')`, `googleapis.com`, `railway.app` (the Orchestrator host), or any POST request are all routed with `event.respondWith(fetch(event.request))` — i.e. sent straight to network, bypassing the cache entirely. This is a deliberate, explicit guard: the service worker was authored with knowledge that Apps Script traffic exists and must never be served from cache. |

## 4. Callers → sinks

| Caller | File:line | Sink | Destination |
|---|---|---|---|
| `authPost()` | `index.html:1792-1808` | `fetch(syncUrl, ...)` at `index.html:1795` | `getAuthSyncUrl()` result — Apps Script by default (§2). Used by login (`index.html:2504`), signup (`2541`), and logout (`2637`). |
| Three inline handlers (unnamed, `index.html:1817-1877`) | `index.html:1819, 1853, 1877` | `fetch(syncUrl, ...)` | Same `getAuthSyncUrl()` result. |
| `pushToCloud()` | `sync.js:582-643` | `fetch(driver.syncUrl, ...)` at `sync.js:607` | `driver.syncUrl` — Apps Script by default. Called from `doSync()` (`sync.js:776`), which is the primary sync entry point. |
| `pullFromCloud()` | `sync.js:645-` (fetch at `666`) | `fetch(driver.syncUrl, ...)` | Same. Called from `doSync()` (`sync.js:787`) and directly at login/signup restore (`index.html:2514`, `2553`). |
| `syncPTIEntry()` | `sync.js:832-854` | `fetch(driver.syncUrl, ...)` at `sync.js:843` | Same. Independent single-entry sync path (PTI log), separate from `doSync()`. |
| `syncExpensesNow()` | `restore-hotfix.js:277-299` | `previousFetch(driver.syncUrl \|\| '.../crewbiq-expenses/exec', ...)` at `restore-hotfix.js:283` | `driver.syncUrl` if set, else the second hardcoded Apps Script endpoint — never the Orchestrator. Caller at `restore-hotfix.js:305` (invoked on some triggering event inside the same file; a queued/deferred call, not evaluated further in this pass). |
| `pushToOrchestrator()` | `sync.js:377-` | `postOrchestratorSync()` → `fetch(url, ...)` at `sync.js:370` | `getOrchestratorSyncUrl()` — structurally separate from all of the above. |
| `doSync()` (the composite sync entry point) | `sync.js:750-824` | Calls, **in this order**: (1) `pushToCloud()` — Apps Script — at `776`; (2) only if that push succeeded, `pushToOrchestrator()` — PostgreSQL — at `782`; (3) `pullFromCloud()` — Apps Script — at `787`. | **This is the single most consequential finding of this map**: Apps Script is the primary write path and the Orchestrator/PostgreSQL write is architecturally a secondary "DB copy" contingent on the Apps Script push succeeding first. This is not a fallback relationship — it is the reverse of what "PWA communicates only with Orchestrator" would require. |

## 5. Existing production telemetry / log evidence

No evidence of actual request volume, existing logs, or telemetry for either
the Apps Script endpoints or the `railway.app` Orchestrator endpoint was
located or examined in this pass. This map is a static source-to-sink trace
only; it does not establish how often each path fires in live usage, only
that every path listed above is reachable code with no dead branches. No new
instrumentation was added, per the bounded scope of this task. Determining
actual production request volume would require either (a) real-time access
to the Google Apps Script project's own execution logs/quota dashboard
(outside this session's access), or (b) Orchestrator-side edge/reverse-proxy
or CDN logs capturing outbound requests to `script.google.com`/
`googleapis.com` from deployed clients, if such logging exists — neither was
available to check in this pass.

## 6. Summary

Every criterion this map was commissioned to inform remains **BLOCKED** as
previously classified in `CREWBIQ_MVP_PRODUCTION_GAP_INVENTORY.md`: the
Apps Script path is not only reachable, it is the primary sync write path
that the Orchestrator/PostgreSQL write depends on succeeding. Two distinct
hardcoded Apps Script endpoints exist (`DEFAULT_SYNC_URL` and the
`crewbiq-expenses` endpoint), five distinct sink call sites read
`driver.syncUrl`/`getAuthSyncUrl()` with no Orchestrator-aware branch, and
the service worker itself was authored with explicit Apps Script hostname
awareness. No removal, disabling, or configuration change is proposed here;
this document exists solely to give a future de-risked removal effort a
complete, evidence-backed starting map.
