# Deletion Durability Acceptance

## Device A

- Delete the `Acceptance test` Expense.
- Delete one Weekly Deduction item.
- Delete one Deduction Template.
- Wait for authenticated sync success.
- Close and reopen CrewBIQ twice.
- Confirm none of the deleted data returns.

## Device B

- Use a clean browser/profile.
- Log in to the same account.
- Confirm the deleted Expense, Weekly Deduction item and Template are absent.

## Effective-date check

- Keep one historical weekly deduction before the carrier/company change date.
- Create a new policy effective on the change date.
- Confirm the historical week keeps its old amounts.
- Confirm the first new week uses the new policy amounts.

Final status remains pending until both devices pass.
