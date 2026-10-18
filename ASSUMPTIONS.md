# Newtonite Operations System — Assumptions

## 1. Product scope
The application manages operational work items across multiple teams. The initial version supports work-item creation, assignment, editing, workflow transitions, comments, activity history, filtering, search, and pagination.

## 2. User management
Users are pre-created through database seed data. Public registration is not included.

## 3. Team membership
A user may belong to multiple teams. Their role is associated with their team membership.

## 4. Roles
- Viewer: Read permitted team information.
- Member: Create and manage work items according to team permissions.
- Lead: Perform Member actions and approve eligible work items.
- Admin: Perform explicitly defined administrative operations.

## 5. Workflow
The initial statuses are Open, In Progress, Awaiting Approval, Resolved, and Closed. Only explicitly allowed transitions are permitted.

## 6. Concurrency
Claims must be atomic. Updates must reject stale versions. Repeated requests using the same idempotency key must not create duplicate operations.

## 7. Activity history
Important changes and comments must be recorded. Work-item changes and their associated activity events must be committed atomically.

## 8. Authorization
Authentication identifies the user. Authorization checks team membership, role, resource access, and the requested action on the server.

## 9. Search and pagination
Filtering, search, and pagination run on the server. Database indexes support common query patterns.

## 10. Background jobs
A transactional outbox records work to be processed asynchronously. The worker supports retries, an attempt limit, and safe repeated processing.

## 11. Initial exclusions
Email delivery, attachments, SSO, WebSockets, a mobile application, and elaborate visual styling are outside the initial scope.

## 12. Database decision
PostgreSQL is the planned database because the challenge recommends relational transactions, constraints, and concurrency controls. Docker is not a prerequisite for starting implementation; PostgreSQL can be installed and run locally.