# CrewBIQ Driver — реестр данных

Дата аудита: 2026-07-20. Обновлено: 2026-07-21 (сверка с `architecture/ADR-0006-canonical-records-and-effective-dated-relationships.md` и фактическим состоянием веток `crewbiq-orchestrator`).  
Статус: аудит перед миграцией коллекций. `dataKey()` и перенос коллекций не начаты; runtime-код этим документом не изменяется.

**Терминология:** этот документ теперь использует термины ADR-0006 — `Workspace` (граница доступа/авторизации) и `Company` (каноническая организация) вместо расплывчатого `Organization` из версии 2026-07-20. Там, где смысл был "данные компании/автопарка, доступные нескольким участникам", это теперь `Workspace`; там, где смысл был "сама компания как бизнес-сущность", это `Company`. См. правку 2026-07-21 ниже.

## Цель

Документ фиксирует физическое хранение данных CrewBIQ Driver, фактический и целевой ownership, источники истины, риски синхронизации и порядок будущей миграции.

Аудит выполнен по вызовам `scopedLoad`/`scopedSave`, `load`/`save` и прямым обращениям к `localStorage` в `index.html`, `sync.js`, `loads.js`, `core-runtime.js`, `offline-sync-queue.js`, `restore-hotfix.js`, `owner-snapshot-hotfix.js`, `settings-hotfix.js`, `service-invoice-legacy-upgrade.js`, `ocr-*.js`, `pti.js` и `sw.js`. `sessionStorage` и IndexedDB не используются.

## Физическая модель ключей

- `save/load` → `fiqD_<key>`: глобальный ключ устройства без account scope.
- `scopedSave/scopedLoad` → `fiqD_data_<identityKey>_<key>`.
- `identityKey` строится из `crewId`, а при его отсутствии — из email.
- Текущий scoped-слой физически привязан к логину, а не к `Workspace`/`Company`.

## Классы владения

- **Account** — авторизация и сессия конкретного пользователя (ADR-0006 §1).
- **Person** — стабильная личность человека, связанная с Account, но не равная записи ростера (ADR-0006 §1).
- **Workspace** — граница доступа/авторизации и business-data scope; и company, и одночленный owner-operator работают через workspace (ADR-0006 §2).
- **Company** — сама организация как бизнес-сущность (название, брендинг, verified authority); независима от Membership и от условий работы (ADR-0006 §3).
- **Device** — состояние конкретного устройства.
- **Environment** — конфигурация backend и окружения.

**Правка 2026-07-21:** версия документа от 2026-07-20 использовала единый термин `Organization` там, где ADR-0006 различает `Workspace` (кто имеет доступ) и `Company` (что это за организация). Ниже эта разница расставлена по каждой сущности. `Driver Profile` по-прежнему нельзя целиком объявлять Workspace-owned: личные данные принадлежат Person/Account, а запись водителя в парке, его статус и условия внутри компании — это `WorkspaceMembership`/`DriverEngagement` (см. ADR-0006 §5, ниже).

## Сводный реестр

| Сущность | Физическое хранение | Целевой ownership | Authority / merge | Основной риск |
|---|---|---|---|---|
| Loads | `fiqD_data_<id>_loads` | Account; fleet-сценарий требует отдельного решения | Orchestrator, replace-on-sync | Resurrection без record tombstones |
| PTI Log | `fiqD_data_<id>_ptiLog` | Account; политика fleet отдельно | Orchestrator, replace-on-sync | Локальный `id` (`pti_<timestamp>`) есть; не канонический relationship-ID и без гарантированного immutable snapshot (ADR-0006 §7) |
| Disputes | `fiqD_data_<id>_disputed` | Account | Orchestrator, replace-on-sync | Account switch ещё не закрыт |
| Pay Settings | scoped `paySettings` + legacy mirror | Account (PWA-transitional; целевая каноническая сущность — `PayAgreement`, ADR-0006 §5) | LWW по `savedAt` | Same-account rekey ещё не закрыт |
| Trucks | `fiqD_data_<id>_trucks` | `Company` (canonical Truck + `FleetVehicleRecord`), доступ через `Workspace`; owner-op — одночленный workspace | Orchestrator (backend Wave B: canonical Truck read model уже на staging, PWA ещё не подключена) | Разные администраторы не видят общий парк — PWA пока не консьюмит Wave B |
| Companies | `fiqD_data_<id>_companies` | `Company` (canonical), доступ через `Workspace`/`Membership` | Backend Wave B (Company + Company Candidate) на staging; PWA пока local-only | PWA хранит собственные несвязанные local-only записи, не canonical Company |
| Driver identity/profile | `fiqD_driver` и auth snapshots | Person/Account | Смешанный (backend Wave A: Person/Account/Workspace/Membership уже на staging) | Один глобальный объект содержит несколько сущностей; PWA не читает Wave A read model |
| Fleet roster entry | `fiqD_data_<id>_driverProfiles` | `WorkspaceMembership` + `DriverEngagement` (ADR-0006 §5) | Orchestrator, сейчас replace-on-sync; canonical модель ещё не реализована backend'ом | Не связан стабильно с Person/Account |
| Assignment | Производная из truck/profile; отдельно не хранится | `CarrierAssignment` (truck↔company) и `DriverTruckAssignment` (driver↔truck) — два разных отношения, не одна сущность (ADR-0006 §4-5) | Нет authority; backend их пока не реализует | Нет materialized stable ID |
| Fuel Logs | `fiqD_data_<id>_fuelLogs` | Владение наследуется от Truck (`Company`) | Orchestrator, replace-on-sync | Локальный `id` (`fuel_<timestamp>`) есть; не канонический relationship-ID и без гарантированного immutable snapshot |
| Service Logs | `fiqD_data_<id>_serviceLogs` | Владение наследуется от Truck (`Company`) | Orchestrator, replace-on-sync | Локальный `id` (`svc_<timestamp>`) есть; не канонический relationship-ID и без гарантированного immutable snapshot |
| Deduction Templates | `fiqD_data_<id>_dedTemplates` | `Company`/`Workspace` policy | Orchestrator, replace-on-sync | Не подтверждён стабильный ID |
| Weekly Deductions | `fiqD_data_<id>_weeklyDeds` | `Company`/`DriverTruckAssignment` | Orchestrator, replace-on-sync | Resurrection и неявный составной ключ |
| Expenses | `fiqD_data_<id>_expenses` | **ADR-0006 не определяет Expense ownership явно** — Account или Company/Truck, должно быть явным на записи; отдельное проектирование до миграции | Orchestrator, replace-on-sync | Смешанный ownership и два независимых reader/key path |
| Maintenance rate | ~~`fiqD_svcRate` и `truck.maintenanceRate`~~ **Решено 2026-07-20/21** | Per-Truck (`MaintenanceReservePolicy`, ADR-0006 §4); account-scoped default (`fiqD_data_<id>_svcRateDefault`) только при отсутствии Truck | Local-only (PWA-transitional, canonical `MaintenanceReservePolicy` backend'ом не реализован) | Закрыто: account-scoped default + глобально-одноразовое потребление legacy-ключа + quarantine + строгий `Number()`-парсинг + regression-тесты A→B. См. `index.html` `importLegacySvcRateIntoScope()`/`quarantineLegacySvcRate()` |
| Company logo | `fiqD_logo` и `Company.logo` | `Company` | Local-only | Device-global legacy duplicate, частично устранён fallback-цепочкой |
| Community links | `fiqD_clinks` | Требует решения: вероятно Account | Local-only | Возможная межаккаунтная утечка |
| PTI schedule backup | `fiqD__savedPtiSched` | Account или `Company` policy (ADR-0006 не выделяет отдельной PTI-сущности явно, кроме упоминания company PTI policies в §6) | Local-only | Ошибочно находится рядом с Environment config |
| Theme / accent / week start | прямые `fiqD_*` | Device, если это подтверждённое продуктовое решение | Local-only | Низкий риск; темы и акценты пока не менять |
| Orchestrator URL/secret | прямые `fiqD_*` | Environment | n/a | Ownership сейчас корректен |
| Session token | `fiqD_sessionToken` | Device session | Server-issued | Один активный слот ожидаем |
| Device ID | `fiqD_deviceId` | Device | Local generate-once | Ownership корректен |
| Account Registry | `fiqD_accountRegistry` | Device bridge (PWA-transitional, НЕ канонический server `accountId`/`organizationId` — см. примечание ниже) | key-first-wins | Бессрочный рост |
| Marketplace modules | scoped `mktModules` | Account | Local | Низкий риск |
| Offline/sync diagnostics | несколько direct keys | Device/runtime | Производные | Не мигрировать, а пересчитывать |

## Подтверждённые дубли и обходы canonical storage

1. ~~`fiqD_svcRate` и `truck.maintenanceRate`~~ — **решено** (см. таблицу выше и код `importLegacySvcRateIntoScope()`).
2. `loadExpenses()` и hotfix-reader самостоятельно строят один физический expenses-key.
3. `ownerSnapshotPending` вручную строит scoped key в обход canonical helper.
4. `fiqD_logo` и `Company.logo` — legacy mirror/fallback, который ещё не удалён полностью.
5. `driver.company`, `driver.truckName`, `driver.unitNumber`, `driver.plate` — legacy shadow полей Company/Truck.
6. `driverProfile.teamDriver` (bool) и `driver.teamDriver` (string) имеют разные типы. **Целевой split (ADR-0006 §5 + `product/FIELD_MIGRATION_INVENTORY_2026-07-19.md` строки 86,88):** участие/режим команды → `DriverEngagement.teamMode`; командная ставка/формула оплаты → `PayAgreement.rate`/`teamRate`. Это два разных факта о водителе (состоит ли он в team-паре и как именно ему за это платят), не одно поле — намеренно не мигрировано до реализации `DriverEngagement`/`PayAgreement` backend'ом.
7. `authProfile` и `authUser` — частично пересекающиеся snapshots разных модулей.
8. Scoped и legacy `paySettings` — намеренное зеркало обратной совместимости, а не независимые источники истины.

## Критические подтверждённые проблемы

### 1. ~~Device-global `svcRate`~~ — решено 2026-07-20/21

Было: `SVC_RATE_KEY = K + 'svcRate'` читался и писался напрямую через `localStorage`, значение видели все аккаунты устройства. Реализовано: account-scoped default (`svcRateDefault`) заменяет глобальный ключ; legacy-значение потребляется **глобально одноразово** (не per-account — иначе каждый следующий аккаунт без своего default тихо унаследовал бы то же старое значение); write→verify→retire перед удалением legacy-ключа; невалидные/отрицательные/частично-битые значения (`"0.28-corrupt"`) уходят в quarantine, не теряются и не обрезаются; `Number()` вместо `parseFloat()` для строгого парсинга. Regression-тесты покрывают полный цикл A→B. Это singleton-образец, на который стоит ориентироваться при проектировании остальных PWA-transitional механизмов (roll-forward для будущих локальных default-значений), но **не** образец для коллекций сущностей (Truck/Company/roster) — см. ниже.

### 2. Два expenses key path

Основной код использует `scopedLoad('expenses')`, а hotfix-слой самостоятельно вычисляет тот же ключ. Сейчас результаты совпадают, но изменение identity/scoping может развести реализации. Нужен один exported canonical helper; поведение restore/snapshot hotfix при этом должно сохраниться.

### 3. Account scope используется вместо Workspace/Company

Fleet trucks, Company, roster entries и связанные записи хранятся под identity активного логина, а не под `Workspace`/`Company`. Второй администратор того же workspace не получает общий парк автоматически.

**Обновление 2026-07-21:** модель, которая это решает, уже существует — `architecture/ADR-0006-canonical-records-and-effective-dated-relationships.md`, статус Accepted. Backend уже частично реализован и провалидирован на изолированном staging (`crewbiq-orchestrator`, не production):

- Wave A (`007_identity_workspace.sql`: Person, Account–Person, Workspace, Membership, Membership Role) — применена и провалидирована на staging.
- Wave B (`008_canonical_company_truck.sql`: Company, Company Authority, Company Candidate, canonical Truck, Truck Candidate) — применена и провалидирована на staging (не production), draft PR [#56](https://github.com/crewbiq/crewbiq-orchestrator/pull/56).
- `DriverEngagement`, `PayAgreement`, `CarrierAssignment`, `DriverTruckAssignment`, `MaintenanceReservePolicy` определены ADR-0006, но backend'ом пока не реализованы ни в одной волне.
- **PWA (crewbiq-driver) не читает и не пишет ни один из этих read model'ей.** Переносить эти коллекции в новый scope до того, как PWA получит контракт для чтения/записи canonical Workspace/Company/Truck, по-прежнему нельзя — теперь по причине отсутствия PWA-интеграции, а не отсутствия ADR.
- **Единая последовательность следующих шагов (не переформулируется здесь — см. `architecture/ADR-0006-CONFORMANCE_2026-07-21.md`, раздел "Единая последовательность следующих шагов"):** review PR #55/#56 → read-only PWA consumption (`/v1/me`, candidate read models — безопасно отделяется от linking) → claim/approval flow → write/link integration → следующие relationship-сущности. До правки 2026-07-21 этот документ, `HANDOFF.md` и conformance-матрица называли разные "следующие шаги" — теперь единственный источник этой последовательности conformance-документ.

## Требуемая организационная модель

**Обновление 2026-07-21: ADR уже существует, новый не нужен.** `architecture/ADR-0006-canonical-records-and-effective-dated-relationships.md` (статус Accepted) определяет: `Account`, `Person`, `Workspace`, `Membership`, `Company`, `OperatingAuthority`, `Truck`, `VehicleRegistration`, `TruckOwnership`, `FleetVehicleRecord`, `CarrierAssignment`, `DriverEngagement`, `PayAgreement`, `DriverTruckAssignment`, `MaintenanceReservePolicy`, `DeductionRule`, `SettlementCalendar`. Соответствие терминам, использованным в версии этого документа от 2026-07-20:

| Термин 2026-07-20 | Каноническое имя (ADR-0006) |
|---|---|
| `Organization` | `Workspace` (доступ) + `Company` (сама организация) — два разных понятия, не одно |
| `Assignment` | `CarrierAssignment` (truck↔company) и `DriverTruckAssignment` (driver↔truck) — два разных отношения |
| `CompensationTerms` | `PayAgreement` |
| — (не было) | `DriverEngagement` — жизненный цикл отношения Person↔Company, отдельно от `PayAgreement` |

**Важно (ADR-0006 не определяет):** Expense ownership явно не описан ADR-0006 — остаётся отдельным проектированием до миграции Expenses (см. таблицу выше и "Порядок работ" ниже).

**Локальный `accountId`, scoped `paySettings` и quarantine-механизм — это PWA-transitional мосты, не канонические серверные сущности.** Они не входят и не должны входить в ADR-0006 — их место в отдельном migration/conformance-документе (этот файл), описывающем, как PWA временно изолирует данные на устройстве до перехода на серверные `Account.id`/`Workspace.id`. `accountId` не заменяет и не предвосхищает серверные `accountId`/`workspaceId` — при подключении PWA к canonical read model потребуется явное сопоставление (reconciliation), не автоматическое отождествление.

## Общие риски миграции

- **Resurrection:** replace-on-sync полного массива может вернуть удалённые записи.
- **Missing canonical relationship-IDs and snapshots (исправлена формулировка 2026-07-21):** loads, PTI, expenses, fuel и service records **имеют** локальный стабильный `id` (`l_`/`pti_`/`exp_`/`fuel_`/`svc_` + timestamp), и для loads это подтверждено staging-тестом Orchestrator (`test_provisioned_driver_load_is_visible_through_authenticated_restore`, `crewbiq-orchestrator/tests/test_e2e_restore_fixture.py`), сохраняющим тот же `id`/`record_id` через restore. Реальный gap другой: эти ID — PWA-локальные, не единообразные канонические relationship-ID (ссылки на Truck/Company/DriverEngagement идут по тексту/локальному id, не по canonical stable ID из Wave A/B), и immutable snapshot по ADR-0006 §7 (unit number/plate/company display identity/pay rate/dispatch %/deduction rule version на момент записи) реализован не единообразно — подтверждено только частично для pay rate (`driver:pay_settings_changed`/`recalcLoadsFrom()` не трогает loads до даты вступления в силу), не проверено для остальных полей и остальных типов записей.
- **Wrong ownership:** per-entity merge без явного согласования с ADR-0006 закрепит неверную модель — модель уже есть, риск теперь в её нарушении, а не в её отсутствии.
- **Account switch leakage:** большинство fleet-коллекций не проходит безопасный switch-flow (по образцу `svcRate`/`paySettings`, но это единичные PWA-side singleton-исправления, не заменяющие переход на canonical Workspace/Company).
- **Same-account rekey:** смена email/crewId меняет физический scope без copy-then-verify.
- **Legacy mirrors:** удалять старые ключи можно только после copy, verify и rollback/quarantine path.
- **PWA/backend рассинхронизация:** backend уже реализует Wave A/B (staging-verified), но PWA их не консьюмит — риск в том, что PWA-side точечные фиксы (как `svcRate`) продолжат накапливаться на локальной модели, вместо перехода на canonical read model, если очерёдность работ не будет явно согласована.

## Порядок работ

1. ~~Исправить `svcRate` как изолированный активный дефект.~~ **Сделано.**
2. ~~Создать и утвердить ADR Organization/Person/Membership/Assignment.~~ **ADR-0006 существует и имеет статус Accepted**, но в `crewbiq-docs` он пока untracked — требуется docs-коммит/PR, чтобы решение было закреплено историей git, а не только статусом в файле.
3. Ввести серверный стабильный `Workspace.id`/`Company.id` и membership model — **Wave A уже сделала это и провалидирована на staging** (`007_identity_workspace.sql`); остаётся закоммитить документацию и продвинуть PR.
4. Мигрировать Company, fleet Trucks и roster entries единым связанным этапом — **Wave B (canonical Company/Truck read model) уже на staging** (`008_canonical_company_truck.sql`, draft PR #56); PWA пока не подключена к этому read model — см. шаги 1-4 единой последовательности в `architecture/ADR-0006-CONFORMANCE_2026-07-21.md`.
5. Материализовать `CarrierAssignment` и `DriverTruckAssignment` со стабильным ID и историчностью — **backend ещё не реализован**, ADR-0006 их только определяет.
6. Реализовать `DriverEngagement` и `PayAgreement` — **backend ещё не реализован**; `teamDriver`-split (см. "Подтверждённые дубли" п.6) ждёт именно этого.
7. Перевести Fuel/Service/Deductions вслед за Truck/Assignment.
8. Спроектировать Expense ownership отдельно — ADR-0006 его не определяет.
9. Объединить expenses reader/key path и ручные scoped-key builders.
10. Доработать same-account rekey для Account-owned данных.
11. Решить ownership logo, community links и PTI schedule.
12. Подключить PWA к уже готовым Wave A/B read model'ям — по единой последовательности из `architecture/ADR-0006-CONFORMANCE_2026-07-21.md`: сначала **read-only** (`/v1/me`, candidate read models — безопасно и отделимо от linking), затем claim/approval flow, только потом write/link. Не совпадает по объёму с "мигрировать коллекции" (п.4): там — что должно произойти на backend и в данных; здесь — что PWA должна начать читать (а позже — безопасно связывать) то, что уже есть.

## Ограничения текущего этапа

- Не менять `dataKey()`.
- Не переносить коллекции автоматически.
- Не вводить Workspace/Company scope в PWA до отдельного проектирования интеграции с уже готовым backend read model — ADR и серверный stable ID уже существуют, но это не то же самое, что готовность PWA их использовать.
- Не менять тему, цвета и акценты.
- Не считать replace-on-sync безопасным merge без record IDs и tombstones.
- Не путать PWA-transitional мосты (`accountId`, scoped `paySettings`, quarantine) с каноническими сущностями ADR-0006 — они не идут в ADR и не заменяют серверные `Account.id`/`Workspace.id`.
