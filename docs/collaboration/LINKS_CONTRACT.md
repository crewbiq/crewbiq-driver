# CrewBIQ Links / clinks Behavior Contract

## Scope and evidence

This contract records current behavior after the accepted Slice 2A.0 URL-safety correction. It is an extraction-readiness artifact, not a UI or storage redesign.

Evidence labels:

- UNIT_CONTRACT: behavior executed from the current inline Links runtime in Node vm.
- STATIC_CONTRACT: source/container/route shape asserted directly.
- E2E_REQUIRED: behavior that requires a real browser interaction.
- STAGING_REQUIRED: behavior that requires deployed or cloud infrastructure.
- UNKNOWN: behavior not proven by current evidence.

## Product and technical identity

Links is an ACTIVE product capability.

page-community and renderCommunity() are only its CURRENT technical container. Historical or future Community concepts are not the Links data model. Marketplace is a separate future concept; its current moduleTarget mapping can open the community route but does not own clinks storage.

Future UI work may replace page-community only after Links has an independent, contract-tested data and rendering boundary. No agent may delete page-community merely because the historical Community concept is deprecated while Links still depends on it.

## Data ownership

Current ownership classification: device-local, browser-profile-wide, unscoped storage.

- Canonical key: fiqD_clinks, produced by K + clinks where K is fiqD_.
- Temporary wrong key repaired on load/save: fiqD__clinks.
- Account scope: none.
- Workspace/crew scope: none.
- Role scope: none.
- Cloud sync: none.
- In-memory ownership: no durable global array; loadCLinks() reads a fresh array for each operation.

Links survive ordinary reloads and current logout/account-shell clearing because their key is not an identity-scoped data key. They can therefore be visible across account changes in the same browser profile. The one-time launch-clean-reset mechanism can remove fiqD_ keys when its reset version changes.

## Record schema

| Field | Requirement | Origin | Persistence and migration |
|---|---|---|---|
| id | Required for current records | Generated for new/default/legacy records | Persisted. Legacy records without id receive lnk-random-time ids. |
| name | Required by the UI save path | User-entered or default | Persisted. Legacy missing name becomes Untitled Work Link. |
| url | Required by the UI save path | User-entered or default | Persisted. Bare domains normalize to HTTPS. Unsafe legacy values remain stored but are not clickable. |
| category | Optional input with current default other | User-selected/default/migrated | Persisted. Missing or unknown categories migrate to other. |
| note | Optional | User-entered/default | Persisted. Legacy no-id records receive an empty note. |
| favorite | Optional boolean | User-entered/default/migrated | Persisted. Non-boolean existing values coerce with Boolean semantics. |
| createdAt | Generated for new/default/legacy records | Date.now() | Persisted. Existing id-bearing records retain their value. |

No legacy field aliases are recognized. A no-id legacy record is treated as the historical name/url shape and reconstructed into the current schema; unknown extra fields on that legacy shape are not carried into the reconstructed record.

## Categories and grouping

LINK_CATEGORIES defines dispatch, accounting, factoring, maintenance, documents, insurance, broker, company, community, and other. Rendering groups filtered records in category-definition order and preserves record order within each group.

Quick filters expose all, favorites, dispatch, accounting, maintenance, and documents. Categories without a quick-filter chip remain visible under All and can be selected in the edit modal. Search matches name, note, or URL case-insensitively.

## Load and migration lifecycle

UNIT_CONTRACT:

1. loadCLinks() reads fiqD_clinks.
2. If the canonical value is absent and fiqD__clinks exists, it copies the wrong-key bytes to the canonical key and removes the wrong key.
3. If no value exists, two CrewBIQ Community/Support defaults are created and persisted.
4. JSON is parsed; non-array input is treated as an empty array in memory.
5. No-id legacy records are reconstructed.
6. Invalid category, non-boolean favorite, and normalizable bare-domain URL values are repaired.
7. Repairs are persisted only when migration is detected.

Parse/storage read errors are logged and return an empty array. The malformed raw value is not explicitly quarantined or overwritten. saveCLinks() writes the complete array and removes the wrong key; write failures are not caught locally.

## URL policy

UNIT_CONTRACT:

- HTTP and HTTPS are allowed.
- mailto and tg are allowed.
- Existing bare-domain syntax is normalized to HTTPS.
- Blank and whitespace-only values are rejected before save.
- javascript, data, file, vbscript, blob, chrome, about, and arbitrary unknown schemes are rejected.
- Scheme checks are case-insensitive.

Unsafe/unknown URLs already persisted are preserved as data. renderCommunity() revalidates at render time and emits an Unavailable, aria-disabled non-link instead of an executable href. Valid links retain target=_blank and rel=noopener noreferrer.

Native input type=url constraint behavior and actual external navigation are E2E_REQUIRED.

## Render behavior

renderCommunity() requires communityCustomLinks; without it the function returns. It synchronizes the search field, loads current storage, filters, groups, escapes displayed fields/attributes, and replaces container innerHTML.

The empty result displays No custom work links found. Cards expose favorite toggle, Open for a valid URL, Edit, and Delete. Invalid legacy URL cards retain their metadata but expose Unavailable instead of Open.

Default Community, Support, and Invite controls are static page-community shell content, not clinks records rendered by renderCommunity().

## CRUD behavior

UNIT_CONTRACT:

- Add: handleSaveLink() validates name/raw URL, enforces URL policy, generates one id/createdAt pair, appends exactly one record, saves, closes, rerenders, and toasts.
- Edit: a truthy id maps the matching record to updated name/url/category/note/favorite values while retaining id, createdAt, and other fields.
- Delete: after confirm, deleteLink() filters exactly the matching id, saves, rerenders, and toasts.
- Favorite: toggleLinkFav() flips only the matching record, then saves and rerenders.

Current edge behavior: editing a missing id saves the unchanged array and still reports Link updated. Deleting a missing id after confirmation similarly saves the unchanged array and reports deletion. These are non-blocking fidelity notes for extraction, not approved redesign targets.

Modal focus, browser-native required/type=url enforcement, confirmation UI, external opening, clipboard sharing, and visual rendering are E2E_REQUIRED.

## Role visibility and navigation

UNIT_CONTRACT: driver, owner_op, and fleet ROLE_CONFIG menus all expose page community with label Links. FUNCTION_GROUPS exposes the same route under Resources & account without a role restriction.

STATIC_CONTRACT: showPage(community) activates page-community and calls renderCommunity(). The current Marketplace moduleTarget maps its links card to the community route, but Marketplace installation state is stored separately as scoped mktModules and does not gate direct Links visibility.

The route and technical ids remain community for compatibility. Slice 2A does not rename them.

## Offline, sync, import, export, and service worker

Links CRUD is localStorage-only and works offline after the app shell loads. There is no clinks transport, cloud restore, queue, account sync, import, or export path. STAGING_REQUIRED: none for current clinks behavior because no remote behavior exists.

The Links runtime remains inline in cache-first index.html. Slice 2A changes only docs/tests, so no service-worker rotation is required. A future extraction that changes index.html or adds a module to the app shell must follow cache-rotation discipline and cache the new module.

## Test inventory

Existing before Slice 2A:

- tests/links-url-safety.test.mjs: executable URL policy, blank-save guard, unsafe legacy render protection, and valid href protection.
- tests/navigation_shell.test.mjs: general IA and role-adaptation coverage; it did not pin clinks persistence/CRUD.
- tests/index-startup-composition.test.mjs: full inline-script parse smoke; not Links behavior proof.
- tests/e2e/service-worker-path.test.mjs and tests/hotfix-load-order-contract.test.mjs: infrastructure regression only.

Added by Slice 2A:

- tests/links-contract.test.mjs: executable reload, wrong-key/legacy migration, add, edit, delete, and role contracts; static route/container and Marketplace-separation contracts.

Remaining E2E_REQUIRED gaps: modal interaction/focus, browser constraint validation, confirmation cancellation, visual category/filter/search behavior, external URL launch, and Invite clipboard/share behavior.

## Extraction invariants

1. Preserve fiqD_clinks and fiqD__clinks repair semantics.
2. Preserve current default records and current schema reconstruction.
3. Preserve accepted Slice 2A.0 URL allowlist and unsafe legacy non-clickable rendering.
4. Preserve one-record add, intended-id edit/delete/favorite behavior, ordering, filters, grouping, and empty state.
5. Preserve visibility for driver, owner_op, and fleet.
6. Preserve route community and compatibility with existing inline handlers until callers are deliberately migrated.
7. Do not couple clinks data to Community or Marketplace state.
8. Do not add cloud/account/workspace scoping during behavior-preserving extraction.
9. Keep page-community until the independent boundary is integrated and contract-tested.

## Extraction readiness decision

READY_FOR_LINKS_EXTRACTION

Blocking findings: NONE.

The current behavior, storage boundary, unsafe-URL correction, CRUD semantics, role visibility, and route/container dependency are sufficiently pinned for a bounded extraction.

## Proposed Slice 2B boundary

Proposed module: links.js as a global-compatible, dependency-injected CrewBIQLinks boundary without a bundler.

Move:

- LINK_CATEGORIES and filter/search state.
- getLinksKey(), normalizeLinkUrl(), loadCLinks(), saveCLinks().
- renderCommunity(), toggleLinkFav(), deleteLink().
- modal open/close/save behavior if kept in the same coherent boundary.

Compatibility:

- Keep global shims for renderCommunity(), openLinkModal(), closeLinkModal(), handleSaveLink(), toggleLinkFav(), and deleteLink() while inline HTML/showPage callers remain.
- Replace direct inline filter/search variable mutation with bounded module methods or compatibility accessors.

Expected files:

- new links.js
- index.html composition/shims and script tag
- sw.js app-shell/cache rotation
- tests/links-contract.test.mjs and tests/links-url-safety.test.mjs
- package.json and existing CI workflow only as needed
- collaboration contract/state/handoff documents

Temporary page-community responsibilities:

- Keep page markup, CSS, static Community/Support/Invite controls, communityCustomLinks mount point, search/add controls, role menu entries, showPage route, and Marketplace route mapping until a later UI-shell slice.

Protect extraction with the current URL-safety, reload/migration/CRUD, role/navigation/separation, inline parse, service-worker, and hotfix-order contracts.

## Slice 2B extracted ownership

links.js owns categories, filter/search state, fiqD_clinks and fiqD__clinks storage/migration, accepted URL policy, rendering, favorite/delete, add/edit save logic, and modal behavior through the global-compatible dependency-injected CrewBIQLinks.create factory.

Load position: links.js is a normal explicit script immediately after startup-session.js and before the large index.html inline composition script. It is outside the core.js 18-script hotfix chain.

index.html retains page-community markup/CSS/static Community-Support-Invite controls, role/navigation wiring, Marketplace route mapping, the getLinksRuntime composition root, and delegating globals. Compatibility globals include renderCommunity, openLinkModal, closeLinkModal, handleSaveLink, toggleLinkFav, deleteLink, getLinksKey, normalizeLinkUrl, loadCLinks, saveCLinks, setLinkFilter, and setLinkSearchQuery.

The search input uses setLinkSearchQuery; generated filter controls use setLinkFilter. page-community, communityCustomLinks, search/add markup, showPage community routing, Marketplace moduleTarget, and shareInvite intentionally remain inline.

links.js is cached in the app shell. Cache v84 is required because cache-first index.html changed and the new module is an offline runtime dependency.
