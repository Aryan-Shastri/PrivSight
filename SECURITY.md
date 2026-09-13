# Security Policy

PrivSight is a research MVP. Use only controlled synthetic demo sites. Never use it on real banking, healthcare, government, payment, or production accounts.

## Boundaries
- Raw browser captures, DOM values, and token-vault entries must remain local.
- Only the egress-firewall output may reach the planner API.
- The default planner is deterministic and visibly labelled `MOCK PLANNER`.
- Real payments, account deletion, external sends, and security-setting changes are unsupported.

Report vulnerabilities privately to the project maintainers. Do not include real personal data in reports.
