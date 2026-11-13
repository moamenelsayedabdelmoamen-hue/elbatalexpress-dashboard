# Security Policy

## Reporting a vulnerability

Do not report security vulnerabilities in public issues or discussions.
Report them privately through GitHub's **Report a vulnerability** feature
(Security tab) for this repository.

Include:
- A concise description and affected commit or version.
- Reproduction steps using a local/test environment and synthetic data.
- Potential impact and any suggested mitigation.

Do not include real customer data, credentials, access tokens, payment data,
or production secrets in a report.

## Response

The maintainers will acknowledge a report as soon as reasonably possible,
investigate it privately, and coordinate a fix and disclosure with the reporter.

## Security expectations

- Never commit credentials, private keys, service-account JSON, or production
  environment files.
- Validate authorization on the server; client-side role checks are not a
  security boundary.
- Test Firestore and Storage rules with the Firebase Emulator before deployment.
- Do not deploy security-rule or payment changes to production without review.
