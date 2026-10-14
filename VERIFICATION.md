# Verification — 14 October 2026

Final production build and TypeScript compilation passed. The isolated HTTP integration suite passed **32 checks, zero failures** using Aiven PostgreSQL and the Vercel pg-adapter branch.

Coverage: private APIs/exports, login, cross-origin mutation rejection, persistent client/projects, invalid calendar dates, idempotent payments, overpayment/fee guards, concurrent payment serialization, total/currency edit restrictions, payment voids, monthly salary deduplication, advances/balance guards, expenses, encrypted storage, authenticated credential reveal, secret exclusion, CSV/PDF responses, date/currency report isolation, backup exclusion, password change, immediate session revocation, new-password sign-in, logout-all and five-failure login lockout.

Browser spot checks covered actual owner sign-in, workspace navigation, project/client forms, Escape modal closing, reports links, and phone-width reports DOM. Phone-width document width was no larger than the viewport; visual assessment was limited because the in-app browser screenshot scaled unexpectedly. This is not an exhaustive physical-device or accessibility certification. The PDF test checks response/signature; rendered PDF layout and non-Latin font coverage remain limited as described in README.

A reporting gap was fixed during testing: PDF/CSV now include current salary obligations and pending amounts as well as payments/advances. Tests used isolated temporary records and cleaned them up; the real provisioned owner remains. No emails, external messages or cloud deployment were performed.

These checks do not certify sustained high-load serverless use under Aiven Free's connection limit. Provider pooling/capacity, HTTPS deployment and managed backups remain deployment concerns.
