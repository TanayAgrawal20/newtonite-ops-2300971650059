# Engineering Decisions

## Decision 1: Database
- Context: The system needs reliable concurrent updates, constraints, and transactional activity history.
- Options: PostgreSQL or MongoDB.
- Choice: PostgreSQL, following the challenge's recommendation.
- Trade-off: Strong relational constraints and transaction support, with additional local setup required.

## Decision 2: Concurrency control
- Context: Two users may claim or edit the same work item.
- Choice: Atomic conditional claims and optimistic locking with a version number.
- Trade-off: Conflicting requests can be rejected and retried rather than silently overwriting data.

## Decision 3: Authorization
- Context: Users belong to teams with different responsibilities.
- Choice: Centralized server-side authorization checks using membership and role information.
- Trade-off: Every protected operation needs an explicit permission check, but access rules are easier to audit.

## Decision 4: Activity history
- Context: Operational changes must be traceable.
- Choice: Store activity events separately and write them in the same transaction as the corresponding item update.
- Trade-off: Additional storage and transaction work, in exchange for consistent history.

## Decision 5: Background jobs
- Context: Work-related asynchronous actions must survive application failures.
- Choice: A transactional outbox and a retryable worker.
- Trade-off: More implementation complexity, in exchange for recoverable job processing.

## Decision 6: Scope
- Context: The implementation must fit a 12-hour schedule.
- Choice: Prioritize correctness, security, tests, and the core dashboard over optional integrations and visual polish.
- Trade-off: Fewer features in the initial release, but a more defensible implementation.
