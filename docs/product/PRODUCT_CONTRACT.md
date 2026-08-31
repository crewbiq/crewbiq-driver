# CrewBIQ PRODUCT CONTRACT (Canonical)

**Scope:** Canonical product requirements and invariants for the current accepted collaboration baseline through Slice 4B.  
**Source precedence:** See [`DOCUMENTATION_AUTHORITY.md`](./DOCUMENTATION_AUTHORITY.md).  
**Branch:** `agent/pre-base44-audit`.

## 1) Canonical identity and access

- **One canonical identity/data layer** for CrewBIQ users, crews, fleets, loads, expenses, and settings.
- **Role/workspace/capability visibility model** governs what can be viewed/edited by each actor.
- Auth/session startup coordination has been extracted to `startup-session.js` and accepted; transport, persistence, and domain behavior remain in their established owners.
- **All frontend decompositions must preserve existing business behavior** until explicit handoff artifacts are updated and verified.

## 2) Core functional invariants

- **Document Vault is required to retain source evidence** and provenance references for imported documents (OCR/scan pipelines included).
  - **Current implemented behavior:** OCR flows state that source files are _not stored_ (source binary retention is currently missing).
  - **Approved contract:** build a canonical Document Vault pipeline in this order: original binary evidence → local-first retention → object/file storage abstraction → hash/provenance metadata → operational record linkage → retention/export/audit policy.
- **No silent data loss:** durable operations must be explicit, idempotent, and recoverable.
- **No first-truck fallback** for ambiguous load assignment; ambiguity must be surfaced and reviewed.
- **No double-count accounting:** deduplication and effective-dated settings must be protected so one expense/load contributes once to settlement and reporting.
- **No destructive overwrite of verified provenance** for audit trails, OCR imports, settlement lineage, and destructive actions.
- **Local-first / offline-first expectations remain active:** queued operations and staged sync must not discard user intent on transport or browser lifecycle failures.
- **CrewBIQ ID and restored data snapshot behavior remains canonical** for identity continuity.

## 3) Compliance and evidence direction

- **IFTA/IRP evidence is a first-class requirement** and belongs to the compliance/audit domain.
- **Compliance/Audit Center remains canonical** for cross-feature evidence review and issue linkage.
- **PTI is configurable, not globally mandatory**:
  - Personal PTI is optional.
  - Fleet/carrier-level policy may require PTI.
  - Scheduled weekly PTI cadence is currently supported (`ptiSchedule`-style logic in current runtime).
  - Durable weekly photo evidence capture/linkage is required as an approved next-step domain contract.
  - PTI evidence must remain linked to relevant maintenance, disputes, and service-invoice flows, including PTI ID, Truck/VIN, Driver, timestamp, odometer, checklist section, photo, defect state, and repair resolution evidence.

## 4) Product architecture direction

- `Base44` is an **optional** reference/design direction only; not a required runtime architecture dependency.
- Future SIDR-style augmentation is allowed only as a **constrained CrewBIQ-side system integration** (not DB-level autonomous writes).
- `crewbiq.com` is the web surface target for **personal cabinet** integration with canonical identity + data layer.
- Existing loader and startup contract tests/guardrails remain required before any auth/session extraction work.

## 5) UI and portal status

- `index.html` remains the compatibility composition shell and significant technical debt, while accepted bounded extractions now own startup/session coordination (`startup-session.js`), Links runtime (`links.js`), and navigation data (`navigation-model.js`).
- Links remains active through technical container `page-community` + `renderCommunity()`; its storage/render runtime is extracted to `links.js` and protected by contract tests.
- Marketplace/Truckpedia/community-style concepts are **explicitly separated** as legacy shell vs future concept:
  - **Legacy UI shell:** keep as deprecated/deferred.
  - **Future ecosystem concepts:** not deprecation-only; still pending strategic decision and product sequencing.

## 6) Explicitly out-of-contract without a separately approved slice

- No direct UI refresh to Base44 as mandatory architecture.
- No assumption that open issues with earlier experimental intent are current requirements.
- No broad runtime replacement or unreviewed decomposition follows from this contract.
