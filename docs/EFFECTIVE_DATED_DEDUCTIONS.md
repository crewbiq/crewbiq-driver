# Effective-Dated Per-Truck Deductions

Deduction policies are versioned by effective week instead of overwriting historical settlements.

## Scope

The authoritative resolution order is:

1. exact stable `truckId`;
2. policy version active for the target weekly settlement;
3. company/carrier retained as audit context;
4. immutable weekly snapshot after application.

Two trucks may therefore use different insurance, ELD, IFTA, administration or other deductions even while belonging to the same CrewBIQ owner account. Changing Unit 1919 must not change Unit 1010.

## Policy version

Each version contains:

- stable `policyId` lineage;
- unique version/template ID;
- stable `truckId` and display `unitNumber`;
- company/carrier name;
- name and category;
- amount;
- `effectiveFrom` week;
- optional `effectiveTo` week;
- version and audit timestamps.

## Company change

When one truck changes carrier/company:

1. choose that truck;
2. create the new deduction policy version with the first applicable week;
3. the previous version closes on the day before the new version starts;
4. already-created weekly deductions remain unchanged;
5. future weeks resolve the version active for that truck.

The current implementation resolves weekly deductions using the week start. Mid-week proration is not inferred automatically.

## Weekly snapshot

Applying policies creates an immutable weekly deduction snapshot containing the policy and policy-version IDs, truck, unit, company, effective dates, category and amount. Later policy edits do not rewrite that snapshot.

## Dispatch percentage

Dispatch percentage remains a separate per-truck setting in the truck profile. It must not also be entered as a deduction policy, otherwise owner P&L would count it twice.

## Legacy templates

Templates created before this model have no truck scope. CrewBIQ shows them as legacy unassigned templates. The owner assigns a legacy template to each intended truck explicitly; CrewBIQ never silently applies it to every truck.
