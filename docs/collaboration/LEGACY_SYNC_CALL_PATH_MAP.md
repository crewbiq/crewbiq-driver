# CrewBIQ Legacy Sync Call-Path Evidence Map

Status: READ-ONLY EVIDENCE DOCUMENT. No path removed or disabled. No runtime,
configuration, deployment, migration, merge, or data change. No new
instrumentation or telemetry added.

Prepared by: Claude (implementer role).
Corrected by: Claude, after independently re-verifying every Codex NEEDS_FIX
finding against the exact production tree.

Scope: every Google/Apps-Script URL literal, persisted or driver-derived URL
source, guard, caller, and outbound fetch/network sink in exact production
tree at commit `bcfd74a22449b974755b8b48bc01a3b261107b93`. The first draft
was scoped to four files only; this correction extends to every caller found
by a repository-wide search: `index.html`, `sync.js`, `restore-hotfix.js`,
`sw.js`, `startup-session.js`, `offline-sync-queue.js`,
`dispute-tombstone-hotfix.js`, `owner-snapshot-hotfix.js`, `pti.js`.

## Corrections applied from the third draft (per Codex re-review)

D. **Owner-snapshot `scheduleFullSync()` reachability was incomplete.** The
   third draft said it was "only reached from this hotfix's own
   save-wrapping installation points." Independently re-read
   `owner-snapshot-hotfix.js:88-236` in full: `scheduleFullSync()` is also
   called directly by `installHooks()` itself (`235`) — with an 1800ms
   delay, whenever persisted pending state already exists at
   hook-installation time, entirely independent of any save call happening
   in the current session. The save-triggered path goes through
   `markPending()` (`94-103`, called from every `wrapSaver()`-wrapped save)
   at the default 250ms delay. Corrected in §4B below to show both call
   sites.

## Corrections applied from the second draft (per Codex re-review)

A. **`restoreSession()` was incorrectly shown calling `boot()`.** Exact
   `startup-session.js:5-25` shows `restoreSession()` returns after restore
   and render — it never calls `boot()` itself. The actual sequencing:
   in `authLogin()`/`authSignup()`, `index.html:2514`/`2553` `await` the
   restore and `index.html:2516`/`2555` call `boot()` separately, right
   after. In the app-start path, `startup-session.js:50-66` (`start()`)
   calls `restoreSession(...)` then chains `.finally(() => boot())`. In both
   cases `boot()` is a distinct step taken by the *caller* of
   `restoreSession()`, not something `restoreSession()` triggers itself.
   `boot()` (`startup-session.js:39-48`) then calls `showApp()` only if
   `!needsPTI()`, and `showApp()` is what schedules the delayed
   `pullFromCloud()`. Corrected in §4A below.
B. **Dependency-injected `loads.js` callers were omitted.** A
   symbol-name-only repository grep missed this because the call is through
   an injected alias, not a global function name. `index.html:1634` injects
   `doSync: () => doSync()` into the Loads module's `CrewBIQLoads.init()`
   options; `loads.js:80` stores it as `_doSync`. Two call sites fire it:
   `loads.js:495` (`if (_doSync) _doSync();`, after saving/editing a load)
   and `loads.js:1357` (`_doSync();`, unconditional, after another load
   update path). These mean **every load save/edit is itself a trigger** for
   the full `doSync()` chain (§4A) — likely one of the most frequently-firing
   triggers in the whole surface, and it was completely absent from both
   prior drafts. Added to §4B.
C. **Scheduler/hook conditions were described too unconditionally.**
   `scheduleAutoSync()` is only reached from `showApp()` (called via
   `deps.scheduleAutoSync()` at `startup-session.js:31`) — i.e., only after
   a driver exists, `boot()` has run, and PTI is not blocking. Once reached,
   it does call `setInterval`/`setTimeout` unconditionally for the
   hourly/midnight cadence, but `scheduleAutoSync()` itself first checks
   `assertReady()` (`sync.js:93-99`, gated on the `_ready` flag set by
   `CrewBIQSync.init()`), and every `doSync()` invocation it schedules still
   passes through that function's own guards (in-progress lock, driver/
   session/`syncUrl` checks, empty-payload skip — see §3 and §4A). The
   save-hook (`installExpenseSaveHook()`) and owner-snapshot
   (`scheduleFullSync()`) paths are similarly gated by their own
   installation checks and debounce/pending-state guards, not unconditional
   firing. Corrected in §4B and §6 to state these preconditions explicitly
   rather than calling any of them unconditional.

## Corrections applied from the first draft

1. **`index.html:1704` misattributed.** The first draft implied this line
   sets `driver.syncUrl`. Independently re-read: it only populates the
   *setup form input's displayed value* (`setupSyncUrl`) from a profile
   object's `syncUrl` field — it does not write `driver.syncUrl` itself.
   Removed from the source-setter list.
2. **`index.html:2514`/`2553` misattributed as `pullFromCloud()` callers.**
   Independently re-read: both call `restoreSession({sessionToken, syncUrl,
   silent:true})`, which delegates to `getStartupCoordinator().restoreSession()`
   (defined in `startup-session.js:5-25`). That function's own direct network
   sink is `authPost('auth_restore', ..., syncUrl)` — a *different* sink than
   `pullFromCloud()`. The actual `pullFromCloud()` call after login/signup
   happens indirectly: `restoreSession()` calls `boot()` → `showApp()`
   (`startup-session.js:27-37`), which schedules
   `pullFromCloud({silent:true})` via `setTimeout(..., 1000)` — one second
   later, and only if `driver.syncUrl` is already set. The direct, immediate
   manual "Pull from Cloud" caller is `restoreFromCloud()`, referenced at
   `index.html:812` and invoked at `index.html:1591-1592`.
3. **`syncExpensesNow()` caller was described as "an unevaluated generic
   event."** Independently re-read `restore-hotfix.js:302-321`: it is
   triggered deterministically. `installExpenseSaveHook()` wraps
   `global.saveExpenses` so every call to it also calls
   `scheduleExpenseSync()`, which debounces 900ms then calls
   `syncExpensesNow()`. This is a real, regularly-firing hook, not a
   hypothetical path.
4. **Destination overstated as unconditional.** The first draft said
   `syncExpensesNow()` "never" reaches the Orchestrator. Corrected:
   `syncExpensesNow()` uses `driver.syncUrl` when it is set, falling back to
   the hardcoded `crewbiq-expenses` Apps Script URL only when it is not.
   `driver.syncUrl` is a free-form, persisted/overridable field — under the
   default resolution chain it is Apps Script, but nothing in the code
   itself guarantees it can never hold a different value if manually or
   persistently overridden. The correct claim is: **the fallback literal is
   guaranteed Apps Script; the primary destination is whatever `driver.syncUrl`
   currently resolves to**, which is Apps Script by default. The same
   qualification applies to `pushToCloud()`/`pullFromCloud()`/
   `syncPTIEntry()`, all of which target `driver.syncUrl` directly.
5. **Telemetry-observability claim was invalid.** The first draft's §5
   suggested Orchestrator-side edge/reverse-proxy or CDN logs might establish
   Apps Script request volume. This is incorrect: requests from the browser
   directly to `script.google.com` never pass through the Orchestrator or
   any CDN/proxy CrewBIQ controls — the Orchestrator cannot observe them at
   all. Orchestrator logs can only ever establish Orchestrator (PostgreSQL
   copy) request volume, not Google traffic. Corrected in §5 below.
6. **Sink count and reachability overclaimed.** The first draft's summary
   said "five distinct sink call sites" while the body actually listed eight
   direct Apps-Script-capable fetch sites, and implied every listed branch is
   exercised in current production usage. Corrected: the count is stated
   precisely per call site (§4), and the claim is narrowed to "statically
   reachable code paths" — this map proves reachability, not live execution
   frequency or which branches actually fire in current production traffic.
7. **Caller/file scope was incomplete.** Added an entire new caller class
   (§4B): UI buttons, auto-sync schedulers, and cross-file hotfix hooks that
   trigger the same sinks documented in the first draft. These determine
   *when* the legacy sinks fire and were omitted from the first draft
   entirely.

## 1. URL literals (sources) — unchanged from first draft, re-confirmed

| Literal | File:line | Notes |
|---|---|---|
| `https://script.google.com/macros/s/AKfycbxsygN14QcavY70qXGherETIzM_VD8OLNBPL2eUU2GxOroK9D4mHIE8pwW6g5nfHvmDGg/exec` | `index.html:1443` (`DEFAULT_SYNC_URL`) | The general-purpose Apps Script default. |
| `https://script.google.com/macros/s/crewbiq-expenses/exec` | `restore-hotfix.js:283` | A second, distinct Apps Script endpoint, used only inside `syncExpensesNow()` as the fallback when `driver.syncUrl` is unset. |

## 2. Persisted / driver-derived URL sources (corrected)

| Source | File:line | Resolution order |
|---|---|---|
| `getAuthSyncUrl()` | `index.html:1761-1769` | Returns, in order: an explicit non-default form input value → `localStorage[K+'_savedSyncUrl']` → `driver.syncUrl` → the raw form input → `DEFAULT_SYNC_URL`. No Orchestrator-aware branch exists in this function. |
| `localStorage[K+'_savedSyncUrl']` | written at `index.html:1808`, `2647`, `6032`, `6536`; read at `index.html:1763`, `2635`, `6441`, `6759` | Device-local persisted copy of whatever `syncUrl` was last used. |
| `driver.syncUrl` | set at `index.html:1997`, `2013`, `6033`, `6487` (NOT `1704` — that line only sets a form-input display value, corrected from the first draft); read at `index.html:2635`, `2880`; read at `sync.js:585`, `607`, `651`, `666`, `763`, `835`, `843` | Populated at signup/login/restore time via `applyAuthRestoreData()` (`index.html:1955-2013`), which itself falls back to `DEFAULT_SYNC_URL` if no `syncUrl` argument is supplied. `sync.js`'s legacy push/pull surface reads this field directly; it has no independent Apps-Script-awareness of its own. |
| `getOrchestratorSyncUrl()` | `sync.js:143` (definition), used at `sync.js:378`, `461`, `488` | A separate, distinct URL resolver for the PostgreSQL/Orchestrator DB-copy path. Structurally independent from `driver.syncUrl`/`getAuthSyncUrl()`. |

## 3. Guards — unchanged from first draft, re-confirmed

| Guard | File:line | Effect |
|---|---|---|
| `if (!(driver && driver.syncUrl))` | `sync.js:585, 651, 763, 835` | Blocks the corresponding legacy call only when `driver.syncUrl` is completely empty. Since `driver.syncUrl` defaults to `DEFAULT_SYNC_URL` at signup/login time (§2), this guard does not block the Apps Script path for any account that completed normal auth. |
| `if (!token \|\| !identityKey(driver))` | `restore-hotfix.js:280` | Blocks `syncExpensesNow()` only when there is no session token or no resolvable driver identity. |
| Service-worker hostname/method match | `sw.js:94-102` | `url.hostname.includes('script.google.com')`, `googleapis.com`, `railway.app` (the Orchestrator host), or any POST request are routed straight to network, bypassing cache. Deliberate, explicit Apps-Script-aware guard. |

## 4A. Direct callers → network sinks (from the first draft, re-confirmed with corrections)

| Caller | File:line | Sink | Destination |
|---|---|---|---|
| `authPost()` | `index.html:1792-1808` | `fetch(syncUrl, ...)` at `1795` | `getAuthSyncUrl()` result — Apps Script by default. Used by `authLogin()` (`2496-2497`), `authSignup()` (`2524-2525`), logout (`2635-2637`), and `restoreSession()` in `startup-session.js:10` (`auth_restore`). |
| Three inline handlers | `index.html:1817-1877` | `fetch(syncUrl, ...)` at `1819, 1853, 1877` | Same `getAuthSyncUrl()` result. |
| `pushToCloud()` | `sync.js:582-643` | `fetch(driver.syncUrl, ...)` at `607` | `driver.syncUrl` — Apps Script by default under the standard resolution chain; the code itself does not prevent this from being a different URL if `driver.syncUrl` is ever set to one. |
| `pullFromCloud()` | `sync.js:645-` (fetch at `666`) | `fetch(driver.syncUrl, ...)` | Same. Called directly at `index.html:1592` (manual pull, via `restoreFromCloud()`) and indirectly, 1 second after `showApp()` runs, via its own `setTimeout` (`startup-session.js:31-36`). `showApp()` in turn is reached only after `boot()` is called by whichever caller finished `restoreSession()` — see correction A above; `restoreSession()` itself never calls `boot()`. |
| `syncPTIEntry()` | `sync.js:832-854` | `fetch(driver.syncUrl, ...)` at `843` | Same. Triggered fire-and-forget from `pti.js:347-348` immediately after a PTI submission completes. |
| `syncExpensesNow()` | `restore-hotfix.js:277-299` | `previousFetch(driver.syncUrl \|\| '.../crewbiq-expenses/exec', ...)` at `283` | `driver.syncUrl` if set (not guaranteed Apps Script — see correction 4 above), else the second hardcoded Apps Script endpoint. Deterministically triggered by `scheduleExpenseSync()` (`302-308`), itself invoked by every call to `global.saveExpenses` via the hook installed in `installExpenseSaveHook()` (`311-321`). |
| `pushToOrchestrator()` | `sync.js:377-` | `postOrchestratorSync()` → `fetch(url, ...)` at `370` | `getOrchestratorSyncUrl()` — structurally separate from all Apps-Script sinks above. |
| `doSync()` (composite entry point) | `sync.js:750-824` | Calls, in order: (1) `pushToCloud()` — Apps Script by default — at `776`; (2) only if that push succeeded and was not skipped, `pushToOrchestrator()` — PostgreSQL — at `782`; (3) `pullFromCloud()` — Apps Script by default — at `787`. | Codex's accepted conditional finding: Apps Script (under the default `driver.syncUrl`) is the primary write path; the Orchestrator/PostgreSQL write is a secondary copy contingent on the legacy push succeeding, not the reverse — but this ordering, not the specific hostname, is what is proven; the first destination could differ from Apps Script only if `driver.syncUrl` were explicitly overridden away from its default. |

## 4B. Indirect/scheduling/UI callers that trigger the above sinks (new — missing from the first draft)

| Caller | File:line | Triggers | Preconditions |
|---|---|---|---|
| `_doSync` (injected `doSync` alias) via Loads save/update | `index.html:1634` (injection: `doSync: () => doSync()`) → `loads.js:80` (stored as `_doSync`) → `loads.js:495`, `1357` | Calls `doSync()` | `loads.js:495` is guarded (`if (_doSync) _doSync();`); `loads.js:1357` calls it unconditionally once that code path is reached. Fires on every load save/edit — likely the single most frequent trigger in this surface. |
| `scheduleAutoSync()` | `sync.js:869-883` | Calls `doSync()` every hour (`setInterval`, `872`) and once at local midnight (`880`) | Only reached once `showApp()` runs (`startup-session.js:31`) — i.e. after a driver exists, `boot()` has completed, and PTI is not blocking. `scheduleAutoSync()` itself first checks `assertReady()` (`sync.js:93-99`, gated on the `_ready` flag from `CrewBIQSync.init()`). Once started, the interval/timeout themselves fire unconditionally, but each resulting `doSync()` call still passes through `doSync()`'s own guards (in-progress lock, `driver.syncUrl`/session checks, empty-payload skip). |
| Home screen "Sync Now" button | `index.html:502` | `onclick="doSync()"` | User-initiated; subject to `doSync()`'s own guards. |
| Settings "Full Sync" button | `index.html:813` | `onclick="saveAdvancedSyncSettings(false); forceFullSync()"` | User-initiated. |
| Settings bottom "Sync" button | `index.html:819` | `onclick="doSync()"` | User-initiated. |
| Settings "Pull from Cloud" button | `index.html:812` | `onclick="restoreFromCloud()"`, which calls `pullFromCloud()` directly at `1591-1592` | User-initiated. |
| Dynamically-built Settings "Sync" action | `index.html:6185` | `appendSettingsAction('Sync', doSync, ...)` | User-initiated. |
| Device sign-out flow | `index.html:6525` | `forceFullSync()` called before clearing the driver from the device | Reached only when the sign-out flow itself is invoked. |
| `queueFleetConfigSync()` | `index.html:2876-2885` | Debounced (800ms) auto-trigger of `forceFullSync()` whenever fleet configuration changes | Guarded by `driver && driver.syncUrl` (`2880`) and the 800ms debounce; fires only on fleet-config-changing actions. |
| `offline-sync-queue.js:390-398` | Browser `online` event listener calls `global.doSync({reason:'online'})` after a 250ms debounce | Guarded by `pendingStatus().pending_count` being non-zero — only fires if there is an actual pending queue when connectivity returns. |
| `dispute-tombstone-hotfix.js:43-55` (`syncWithBusyRetry`) | Retries `global.doSync({forceAll:true})` up to 5 times on `sync_in_progress` | Only retries while `doSync()` itself reports `sync_in_progress`; guarded by `typeof global.doSync === 'function'`. |
| `owner-snapshot-hotfix.js:190-198` (`scheduleFullSync`) | Debounced call to `global.forceFullSync()` (default 250ms delay) | Guarded by `typeof global.forceFullSync === 'function'`. Reached from two distinct call sites, not only a save wrapper: (1) `markPending()` (`94-103`), called from every `wrapSaver()`-wrapped entity save (`200-211`, covering `saveExpenses`/`saveServiceLogs`/`saveDedTemplates`/`saveWeeklyDeds`), schedules it at the default 250ms; (2) `installHooks()` itself (`228-236`) schedules it directly with an 1800ms delay whenever persisted pending state already exists at hook-installation time (`if (Object.keys(loadPending()).length) scheduleFullSync(1800);`, `235`) — independent of any save call happening in the current session. |

Every entry in §4B ultimately reaches the same `doSync()`/`pushToCloud()`/
`pullFromCloud()`/`forceFullSync()` sinks documented in §4A — none of them
introduce a new network endpoint, but they materially affect *how often* and
*under what conditions* those sinks fire, which is why file scope had to be
widened to cover them. Each is gated by the specific precondition noted
above; none of these paths fire in every app state unconditionally.

## 5. Existing production telemetry / log evidence (corrected)

Requests from the browser directly to `script.google.com` never pass through
the Orchestrator, any CDN, or any reverse proxy CrewBIQ controls — they are
a direct client-to-Google network call. **Orchestrator-side logs (edge,
reverse-proxy, or application logs) cannot observe this traffic at all,
under any circumstance**, and cannot be used to establish or disprove Google
traffic volume; they can only ever establish Orchestrator/PostgreSQL-copy
request volume (the `pushToOrchestrator()` sink), which is a different,
already-intended path.

Determining actual Apps Script request volume would require one of: (a)
direct access to the Google Apps Script project's own execution logs or
quota/usage dashboard (outside this session's access), or (b) new
client-side telemetry that does not currently exist in the reviewed source.
No such evidence was located or examined in this pass, and none is proposed
or added by this document.

## 6. Summary (corrected)

Every criterion this map was commissioned to inform remains **BLOCKED** as
classified in `CREWBIQ_MVP_PRODUCTION_GAP_INVENTORY.md`. Precisely: two
distinct hardcoded Apps Script endpoints exist; eight direct call sites
(`authPost` + 3 inline handlers + `pushToCloud` + `pullFromCloud` +
`syncPTIEntry` + `syncExpensesNow`) can reach an Apps Script URL under the
default resolution chain; at least eleven additional callers (§4B) —
including a dependency-injected alias fired on every load save/edit, a
timer-driven hourly/midnight auto-sync scheduler (reached only once
`showApp()` runs and `assertReady()` passes), UI actions, and cross-file
hotfix hooks — trigger those same sinks, each subject to its own specific
precondition (readiness flags, debounce windows, pending-queue checks,
installation guards) rather than firing unconditionally in every app state.
`doSync()`'s push order (Apps Script first, Orchestrator second, contingent
on the first succeeding) is confirmed, and `restoreSession()` itself never
calls `boot()` — that sequencing is done by whichever caller invokes
`restoreSession()`. This is static reachability evidence only: it does not
establish live execution frequency, which specific branches actually fire in
current production traffic, or actual Apps Script request volume — for
which no observation mechanism accessible in this pass exists (§5). No
removal, disabling, or configuration change is proposed here; this document
exists solely to give a future de-risked removal effort a complete,
evidence-backed starting map.
