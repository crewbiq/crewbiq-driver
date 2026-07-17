# Effective-Dated Per-Truck Deductions

Deduction policies are versioned by effective dates instead of overwriting historical settlements.

## Scope

The authoritative resolution order is:

1. exact stable `truckId`;
2. policy version active on the target business date;
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
- required `effectiveFrom` / Start Date;
- optional `effectiveTo` / End Date;
- version and audit timestamps.

Start Date and End Date are inclusive. An empty End Date means the policy remains open until a later version closes it.

The application rejects a policy whose End Date is before its Start Date. If a requested End Date would cross into an already-planned later version, it is capped at the day before that later version starts.

## Company or rate change

When one truck changes carrier, company, amount, or another deduction condition:

1. choose that truck;
2. create the new deduction policy version with its first applicable Start Date;
3. optionally enter an End Date when the new condition is already known to be temporary;
4. the prior overlapping version closes on the day before the new version starts;
5. already-created weekly deduction snapshots remain unchanged;
6. later calculations resolve the version active for the relevant business date.

The current weekly-settlement workflow applies one immutable deduction snapshot per truck and week. Automatic per-load historical resolution is tracked as the next accounting slice; CrewBIQ must not multiply a weekly charge by the number of loads or invent mid-week proration.

## Weekly snapshot

Applying policies creates an immutable weekly deduction snapshot containing the policy and policy-version IDs, truck, unit, company, effective dates, category and amount. Later policy edits do not rewrite that snapshot.

## Dispatch percentage

Dispatch percentage remains a separate per-truck setting in the truck profile. It must not also be entered as a deduction policy, otherwise owner P&L would count it twice.

## Legacy templates

Templates created before this model have no truck scope. CrewBIQ shows them as legacy unassigned templates. The owner assigns a legacy template to each intended truck explicitly; CrewBIQ never silently applies it to every truck.
