# Effective-Dated Deductions

Reusable deduction policies must be versioned by effective date instead of overwriting historical weeks.

Each policy version contains:

- stable policy lineage ID;
- version ID;
- name and category;
- amount;
- optional truck/company/carrier scope;
- `effectiveFrom`;
- optional `effectiveTo`.

When the carrier/company changes:

1. close the old version on the day before the change;
2. create a new version beginning on the change date;
3. do not mutate already-created weekly deductions;
4. future weeks resolve the version active on that week's start date.

This preserves historical settlement accuracy while allowing current deductions to change.
