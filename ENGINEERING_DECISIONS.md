# Engineering Decisions

## Decision 1: Database
- Context: The system needs reliable concurrent updates, constraints, and transactional activity history.
- Options: PostgreSQL or MongoDB.
- Choice: PostgreSQL, following the challenge's recommendation.
- Trade-off: Strong relational constraints and transaction support, with additional local setup required.

## Decision 2: Concurrency Control

- **Context:** Multiple users may attempt to claim or update the same work item concurrently. Without protection, one request could overwrite another user's changes or allow multiple users to claim the same item.
- **Options considered:** Unprotected read-modify-write operations, database transactions with conditional updates, and version-based optimistic locking.
- **Choice:** Use an atomic conditional claim operation to prevent competing claims from both succeeding, and a version number for detecting stale edits.
- **Trade-off:** Conflicting requests may receive a conflict response and need to be retried. This adds validation and error-handling complexity but protects data integrity without requiring every user to hold a long-running lock.

## Decision 3: Authorization

- **Context:** Users have different responsibilities across teams, and access must be restricted according to both team membership and role.
- **Options considered:** Frontend-only permission checks, centralized server-side authorization, and role checks distributed across individual route handlers.
- **Choice:** Enforce authorization on the server using authenticated user identity, team membership, and role-based permission checks. Frontend restrictions are for user experience and are not treated as a security boundary.
- **Trade-off:** Protected operations require explicit permission validation, increasing implementation effort. In return, unauthorized requests can be rejected even when a client bypasses the frontend.

## Decision 4: Activity History

- **Context:** Work-item changes need to be traceable so that users and reviewers can understand what changed.
- **Options considered:** Store the latest state only, write activity events separately after updating the work item, or record the work-item update and activity event in the same database transaction.
- **Choice:** Store activity events separately and write them in the same transaction as the corresponding work-item update.
- **Trade-off:** Maintaining history requires additional database storage and transaction work. However, the transaction ensures that the work-item update and its activity event succeed or fail together.

## Decision 5: Background Jobs

- **Context:** Asynchronous work should remain recoverable if processing fails or the application restarts.
- **Options considered:** Perform the work synchronously during the request, use an in-memory queue, or persist jobs in the database using a transactional outbox.
- **Choice:** Use a PostgreSQL-backed outbox with retry handling so jobs can be stored persistently and processed again after failures.
- **Trade-off:** This adds database records, worker logic, and retry-management complexity. The current implementation does not perform actual external notification delivery, so reliable delivery of an external side effect remains outside the implemented scope.

## Decision 6: Scope and Prioritization

- **Context:** The challenge had a limited implementation window, so the project needed to prioritize correctness and demonstrable engineering decisions over feature count.
- **Options considered:** Build many optional features with limited validation, or prioritize the core workflow, authorization, concurrency handling, persistence, and automated tests.
- **Choice:** Prioritize the core work-item lifecycle, team-based access control, activity history, idempotency, concurrency protection, cursor pagination, and automated tests. Defer optional integrations such as email delivery, file attachments, SSO, and real-time updates.
- **Trade-off:** The application has fewer integrations and less production hardening, but its core behavior is easier to test, explain, and demonstrate.
