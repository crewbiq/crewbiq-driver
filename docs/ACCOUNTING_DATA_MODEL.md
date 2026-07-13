# CrewBIQ Accounting Data Model

Status: design contract for Issues #19, #20, #21 and deletion durability.

## Source-of-truth rule

Fuel Logs, Service Logs, Weekly Deductions and Manual Expenses are canonical source records. The owner Expense Ledger is a derived view. Canonical records must never be copied into another source table merely to make them visible, because that would double-count P&L.

## Full owner snapshots

The PWA sends complete owner arrays for selected entities with:

```json
{
  "ownerData": {
    "snapshotEntities": ["expenses", "deductionTemplates", "weeklyDeductions"]
  }
}
```

For those named entities, omission means deletion. The backend reconciles PostgreSQL to the authenticated owner's complete snapshot. Historical sync events must also treat that event as a replacement boundary rather than merge-only fallback.

A local pending snapshot remains authoritative on the originating device until the server acknowledges a successful authenticated sync. This prevents a cloud pull from resurrecting a locally deleted record while the deletion is still pending.

## Expenses

Deleting an Expense removes it from the owner's durable snapshot. A deleted record must not return after reload, restore or login on another device.

## Weekly deductions

A weekly deduction is a historical accounting snapshot for one truck and one `weekKey`. Editing or deleting an item updates that week only. An empty week may be removed from the durable snapshot.

## Effective-dated deduction policies

Carrier/company deductions must not rewrite history. Reusable deduction policies use:

- `effectiveFrom` — first date/week where the policy applies;
- `effectiveTo` — optional last date/week;
- `company` / `carrier` — optional context;
- `truckId` — optional truck scope;
- stable policy ID and version lineage.

When a company changes, the old policy is closed with `effectiveTo`; a new policy begins on the change date. Existing weekly deductions remain unchanged. New weeks resolve the policy version effective on that week.

## Acceptance

1. Delete `Acceptance test` Expense, sync, reload: it stays deleted.
2. Delete a deduction item, sync, reload: it stays deleted.
3. Delete a deduction template, sync, reload: it stays deleted.
4. Change carrier deductions effective on a chosen date: prior weeks retain old amounts, new weeks use new amounts.
5. Repeat the restore on a second device with the same results.
