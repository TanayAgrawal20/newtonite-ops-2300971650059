# Newtonite Ops — Team Work Management

Newtonite Ops is a team-based work-item management application for creating, assigning, tracking, and resolving operational tasks. It provides role-based authorization, a controlled workflow, activity history, concurrency protection, and a dashboard for work requiring attention.

## Features

- JWT-based authentication with seeded demo accounts.
- Team-level roles: Viewer, Member, Lead, and Admin.
- Create, search, filter, view, edit, assign, and claim work items.
- Workflow: Open → In Progress → Awaiting Approval → Resolved → Closed, with server-side transition validation.
- Team-scoped authorization enforced by the backend.
- Version-based optimistic locking to reject stale edits.
- Atomic work-item claiming to prevent two users from claiming the same item.
- Idempotency keys for safe retries of work-item creation.
- Transactional activity events and a PostgreSQL-backed outbox with retry handling.
- Dashboard sections for assigned work, urgent unassigned work, and items awaiting approval.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, React Router, Axios
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL 17
- **ORM:** Prisma
- **Testing:** Vitest, Supertest

## Prerequisites

Install the following before running the project:

- Node.js and npm
- Docker Desktop with Docker Compose
- Git

## Setup

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd newtonite-ops
```

Replace the placeholder URL with your actual GitHub repository URL.

### 2. Configure environment variables

Create a local `.env` file by copying the example:

**PowerShell**
```powershell
Copy-Item .env.example .env
```

Set a local PostgreSQL password and a strong random JWT secret in `.env`. Ensure the password in `DATABASE_URL` matches `POSTGRES_PASSWORD`.

The default database mapping in this project uses host port `5433`.

Example structure:

```env
POSTGRES_PASSWORD=your_local_database_password
DATABASE_URL=postgresql://newtonite:your_local_database_password@localhost:5433/newtonite_ops?schema=public
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=15m
PORT=5000
```

Do not commit `.env` or real secrets.

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
```

Wait until the PostgreSQL container is healthy.

### 4. Install backend dependencies and initialize the database

```bash
npm ci
npx prisma migrate deploy
npx prisma db seed
```

The seed command uses the seed configuration in `prisma.config.ts`.

### 5. Start the backend

In the project root, run:

```bash
npm run dev
```

The backend runs on port `5000` by default.

Health endpoint:

```text
http://localhost:5000/api/health
```

Keep this terminal running.

### 6. Configure and start the frontend

Open a second terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

The frontend environment should point to:

```env
VITE_API_URL=http://localhost:5000/api
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Demo Accounts

The seeded demo accounts use the following password:

`Demo@12345`

| Role | Email |
|---|---|
| Global Admin | `admin@newtonite.local` |
| Engineering Team Admin | `engadmin@newtonite.local` |
| Engineering Lead | `lead@newtonite.local` |
| Engineering Member | `member@newtonite.local` |
| Engineering Viewer | `viewer@newtonite.local` |
| Operations Lead | `opslead@newtonite.local` |
| Operations Member | `opsmember@newtonite.local` |
| Product Lead | `productlead@newtonite.local` |
| Product Member | `productmember@newtonite.local` |

These are local demonstration credentials, not production credentials.

## Running Tests

From the project root:

```bash
npm test
```

The backend test suite uses Vitest and Supertest.

Build the backend:

```bash
npm run build
```

Build the frontend in a separate terminal:

```bash
cd frontend
npm run build
```

## Important Correctness Behaviors

- **Concurrent claims:** only one competing claim should succeed.
- **Stale edits:** a request using an outdated version is rejected with a conflict response.
- **Idempotent creation:** repeating a request with the same idempotency key and payload returns the existing result.
- **Authorization:** viewers cannot perform write actions, and team membership is checked server-side.
- **Workflow:** invalid transitions and unauthorized approvals are rejected.
- **Activity history:** work-item changes and their activity events are recorded transactionally.

## Architecture

```text
React + Vite Frontend
        |
        | HTTP / JSON / JWT
        v
Express + TypeScript API
        |
        +---- Authentication and authorization
        +---- Work-item workflow and validation
        +---- Concurrency and idempotency controls
        +---- Activity event recording
        +---- Outbox job processing
        |
        v
PostgreSQL + Prisma
```

## Known Limitations

- The current list API uses page-based pagination; cursor pagination remains a planned improvement.
- Seed data currently contains three teams and nine users. A few thousand sample work items should be added to demonstrate pagination under larger data volumes.
- The outbox worker validates supported events and referenced records, then marks valid jobs completed. A meaningful external side effect, such as notification delivery, and dedicated idempotency tests for that side effect remain future work.
- Comments on work items are not yet implemented.
- The frontend's conflict-message and optimistic-update rollback behavior should be verified before release.
- Docker Compose currently starts PostgreSQL; the backend and frontend are started separately using the commands above.
- Email delivery, file attachments, SSO, and real-time WebSocket updates are outside the current scope.


## Engineering Decisions

See [`ENGINEERING_DECISIONS.md`](./ENGINEERING_DECISIONS.md) for the design choices and trade-offs.
