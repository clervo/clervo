# Security policy

## Reporting a vulnerability

Use the private vulnerability-reporting feature in the canonical
`clervo/clervo` GitHub repository. Do not open a public issue containing a
credential, wallet material, payment authorization, customer payload, exploit,
or reproduction that could harm another system.

Include the affected version or commit, impact, minimal reproduction, and any
known mitigation. Clervo will acknowledge the report, reproduce it in an
isolated environment, and keep public capability claims disabled until a
material issue is repaired and verified.

## Supported releases

Only versions shown as current by the repository release targets and public
registry metadata are supported. Legacy preview packages may remain available
for compatibility but are not evidence of current product behavior.

Never test against production, customer data, unrelated infrastructure, or
`ai.clervo.dev` without explicit written authorization for that exact scope.
