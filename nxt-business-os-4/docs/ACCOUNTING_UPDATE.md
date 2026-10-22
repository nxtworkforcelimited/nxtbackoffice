# Accounting workspace status

Prepared locally; not deployed. No live migration or import applied.

Implemented: USD chart (42 accounts), journal drafts, balanced-entry approval, configurable named approvers and posting permission, journal entries/items, cumulative trial balance, period income statement, as-of balance sheet with unclosed earnings, unpaid invoice balances, accounting audit view, CSV balance export. Automatic invoice/payment/expense posting is retained. Migration disables direct manual posting in favor of approval workflow.

Private import prepared outside Git: 25 screenshot headers as drafts; two obscured amounts are NULL; journal lines are empty for accountant completion. No opening balances invented. Import also configures the verified reviewers. No transaction or tax registration identifiers included in this public-source proposal.

Still to implement: asset register, automated depreciation, credit notes/refunds, reconciliation, corporate tax computation, cash-flow statement, period locks, expanded payroll ledger integration, ZIMRA registration/submission. Setup policy descriptions do not imply those calculations exist.

Validation: 105 tests passed before the source/private-data split; focused migration test and typecheck rerun afterward. Production build passes on retry but warns that existing Next.js 16.4.0 has a known security vulnerability. Upgrade outstanding. No authenticated browser verification.

Release order: review code, apply schema migration, privately configure reviewers/import drafts, verify database authorization, deploy and verify authenticated flows. Public repository publication requires user approval.
