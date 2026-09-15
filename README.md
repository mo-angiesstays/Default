# TurnKeep

Property operations for short-term rentals — a replacement for Breezeway.

Check-outs arrive from Hostaway and become cleaning tasks on their own. Cleaners
work a checklist on their phone, report problems, and clock in if they want to.
Problems stay attached to the property and reappear on every visit until someone
marks the job done. A scheduler assigns the work using rules you write in plain
English, and every scheduled job lands on the team's Google Calendar as an invite.

## What it does

**Hostaway → cleaning tasks (one-way).** Reservations are pulled on a schedule.
Every check-out becomes a turnover task at the property's check-out time, with the
next guest's check-in as the deadline. Same-day turns are flagged and prioritised.
If a departure date moves, the existing task moves with it; if a booking is
cancelled, the task is cancelled and its calendar event removed. Nothing is ever
written back to Hostaway.

**Checklists.** A turnover checklist and a monthly deep-clean checklist per
property, with sections, required items and photo prompts. A property-specific
checklist overrides the global default of the same type. Tasks snapshot their
checklist at creation, so editing a template never rewrites work already out with
a cleaner. A job can't be completed while a required item is unticked.

**Monthly deep cleans.** Generated automatically on each property's chosen day of
the month, moved to the first free day when a guest is in residence, and skipped
entirely when a month has no gap. Re-running the generator never duplicates.

**Maintenance.** Standalone maintenance jobs, plus jobs opened automatically from
high and urgent issue reports.

**Issues that stick to the property.** A cleaner reports a problem; it attaches to
the current task *and* to every future task at that property. It reappears on each
turnover, with a count of how many visits it has been carried onto, until a cleaner
or handyman marks it completed. Resolving it detaches it from upcoming work and
closes the maintenance job opened for it.

**Scheduling rules + AI.** Write rules the way you'd say them: *"Maria is first
choice for the beach houses"*, *"don't send anyone across town twice in one day"*.
Hard rules (daily caps, required skills) are enforced in code and filter people out
before the model ever sees them. Soft rules are weighed by the model against a
built-in score covering property preference, past work there, workload for the day
and travel distance. The model can only ever choose from people who already passed
every hard constraint — a pick outside that list is rejected and the rule score used
instead. Every assignment records which method decided it and why. With no API key
configured the scheduler still runs on rule scoring alone.

**Google Calendar.** Every scheduled task becomes an event with the assignee and
managers invited, carrying the address, access notes, deadline and a link back to
the task. Reschedules update the event in place; cancellations delete it.

**Task management and chat.** A shared board with filters, comments, statuses and
verification. Direct messages, group channels and per-property channels, with
unread counts.

**Time clock.** Opt-in. Clocking in starts the job; clocking out records the
minutes. Managers see the whole team's timesheet and can correct a mis-punch —
corrections are flagged.

## Roles

| | Cleaner | Maintenance | Manager |
|---|---|---|---|
| See own tasks, work checklists | ✓ | ✓ | ✓ |
| Report issues, resolve issues | ✓ | ✓ | ✓ |
| Time clock | ✓ | ✓ | ✓ |
| Chat | ✓ | ✓ | ✓ |
| See everyone's tasks | | | ✓ |
| Assign work, run the scheduler | | | ✓ |
| Verify completed jobs | | | ✓ |
| Properties, team, checklists, rules, settings | | | ✓ |

Cleaners and maintenance staff only ever load their own tasks; opening someone
else's is refused by the API, not just hidden in the UI.

## Running it

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then fill it in — see below
docker compose up -d db       # or point DATABASE_URL at your own Postgres
npm run db:migrate            # create the schema
npm run db:seed               # demo team, properties and checklists
npm run dev
```

Sign in at http://localhost:3000 as `manager@example.com` / `changeme123`.
**Change the seeded passwords before putting real data in.**

### Configuration

Only `DATABASE_URL` and `AUTH_SECRET` are required. Each integration is optional
and the app degrades cleanly without it — Settings shows what is and isn't wired up.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `AUTH_SECRET` | Signs session cookies. `openssl rand -base64 32`. |
| `APP_URL` | Used in calendar invites to link back to the task. |
| `HOSTAWAY_ACCOUNT_ID` / `HOSTAWAY_API_KEY` | From Hostaway → Settings → Hostaway API. The account ID is the client id, the API key the client secret. |
| `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` | A Google Cloud service account key. |
| `GOOGLE_CALENDAR_ID` | Which calendar events land on. Defaults to `primary`. |
| `GOOGLE_IMPERSONATE_USER` | **Required for invites.** A Workspace user the service account may impersonate via domain-wide delegation. Without it events are created but attendees are never invited — Settings warns about this. |
| `ANTHROPIC_API_KEY` | Turns on AI-assisted assignment. Without it, rule scoring alone. |
| `CRON_SECRET` | Lets an external scheduler run the nightly pipeline without a login. |

### Keeping it running

The nightly pipeline is Hostaway sync → deep-clean generation → auto-assign →
calendar push. Each step is independent; one failing integration doesn't stop the
others, and the response says which ran.

Trigger it over HTTP:

```bash
curl -X POST https://your-app/api/cron -H "Authorization: Bearer $CRON_SECRET"
```

Or run it as a process, which is handy for a system cron entry:

```bash
npm run worker              # every step
npm run worker -- hostaway  # just one: hostaway | deepclean | schedule | calendar
```

Once or twice an hour is a sensible cadence — it keeps turnovers current as
bookings change. Run history is on the Settings page.

## How it's built

Next.js 15 (App Router) with the API routes as the backend, Prisma and PostgreSQL,
Tailwind, and the Anthropic SDK for the scheduling assistant. Sessions are JWTs in
an httpOnly cookie; passwords are bcrypt hashed.

```
prisma/schema.prisma          data model
src/lib/
  integrations/hostaway.ts    read-only Hostaway client
  integrations/google-calendar.ts
  jobs/hostaway-sync.ts       reservations → turnover tasks
  jobs/deep-clean.ts          monthly deep-clean generation
  scheduler/candidates.ts     hard constraints + scoring (the safety layer)
  scheduler/ai.ts             the model's decision, validated against that layer
  scheduler/index.ts          propose / apply / bulk-assign
  tasks.ts                    task creation, checklist snapshot, issue carry-over
src/app/api/                  REST endpoints
src/app/(app)/                screens
```

### Notes on the design

*Issues carry forward through a join table* (`TaskIssueCarry`) rather than a flag,
so the history of which visits an issue appeared on survives, and the carry count
is a real ageing signal rather than a guess.

*Tasks snapshot their checklist.* Editing a template is safe mid-shift.

*The AI is bounded by construction.* `findCandidates` applies every hard constraint
first; the model receives only survivors and its answer is checked against that list
before anything is written. Operational text (property notes, issue reports, rules)
is passed as data the model weighs, never as instructions it follows.

*Calendar staleness is tracked explicitly.* Any write that changes what an event
should say clears `googleSyncedAt`. Comparing `updatedAt` against it instead would
re-push every task on every run and mail a fresh invite to everyone each time.

## Not included

- Uploading photos — issue and checklist photos take a URL. Wire up S3 or similar
  if you want direct capture from a phone.
- Push notifications. Notifications are in-app; the tables are there to build on.
- Payroll export from the time clock.
