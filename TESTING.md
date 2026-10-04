# Testing TurnKeep for the first time

Ordered so that each step only depends on the ones before it, and so the things
most likely to be wrong surface early. Roughly two hours end to end, less if you
skip the integrations on the first pass.

Run `npm run doctor` at any point. It checks every integration and names the
variable or step that fixes each problem. Re-run it after each section below.

---

## 1. Get it running (20 min)

The app needs to be on public HTTPS for most of the integrations — Hostaway is
fine either way, but Google Calendar links, MCP connectors and phone testing all
need a real URL. Deploying first saves doing this twice.

**Easiest path — Render** (Railway and Fly work the same way from the Dockerfile):

1. Push this branch, then New → Blueprint and point it at the repo. `render.yaml`
   creates the web service, a Postgres database, a disk for photos, and an hourly
   job that runs the sync pipeline.
2. Set `APP_URL` to the URL it gives you.
3. Deploy. Migrations run automatically on boot.
4. Seed the demo data from the service shell: `npm run db:seed`

**Or locally**, if you'd rather poke at it first:

```bash
docker compose up -d db
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install && npm run db:migrate && npm run db:seed
npm run dev
```

**Check it worked:** sign in at `/login` as `manager@example.com` / `changeme123`.
You should land on a dashboard with three properties and some tasks.

> Change the seeded passwords before any real data goes in. They're in this file
> and in the repo. `npm run doctor` will keep reminding you.

---

## 2. The core loop, without any integrations (20 min)

This is the part you'll use every day, and none of it needs an API key. Do this
before wiring anything up — if something's wrong here, nothing else matters.

**As the manager:**

- [ ] **Properties** → open Seaside Cottage. Set a real check-out time, turnover
      duration, and access notes. These drive scheduling, so they want to be right.
- [ ] **Checklists** → open "Standard turnover". Edit it to match how you actually
      work: sections, items, which are required, which want a photo. This is the
      thing your cleaners will read, so it's worth the time.
- [ ] **Team** → add yourself a second account as a cleaner, with a real email.
- [ ] **Tasks** → New task, assign it to that cleaner.

**Then sign in as that cleaner** (private window, so you can keep both open):

- [ ] You should see *only* your own task. Try opening the manager's task by URL —
      it should refuse.
- [ ] Open the task, tick some checklist items.
- [ ] Try to complete it with items outstanding — it should refuse and say which.
- [ ] **Report an issue** with a photo. Take it on your phone if you can.
- [ ] Tick everything, complete the job.

**Back as the manager:**

- [ ] The issue is on the **Issues** board.
- [ ] Open the property — the issue is listed there too.
- [ ] Create another task at that property. **The issue should appear on it.**
      That carry-forward is the behaviour most worth confirming by hand; it's the
      thing Breezeway doesn't do.
- [ ] Mark the issue done. Create one more task — it should *not* appear.

---

## 3. Phone testing (15 min)

Do this on an actual phone, not a desktop browser's mobile view. Photo capture
and the time clock behave differently on real hardware.

- [ ] Sign in as the cleaner on your phone.
- [ ] Open a task and tap **Take a photo** on a photo-required item. The rear
      camera should open directly, not a file browser.
- [ ] Confirm the photo isn't rotated sideways after upload.
- [ ] **Turn on airplane mode**, take another photo. It should say it's saved on
      the device. Close the tab, reopen the app, turn airplane mode off — it
      should upload on its own.
- [ ] **Clock in**, wait a minute, clock out. Check the timesheet.

---

## 4. Hostaway (20 min) — the highest-risk integration

This is the one I could never test against the real API, so expect to iterate.

1. Hostaway dashboard → Settings → Hostaway API → create credentials.
2. Set `HOSTAWAY_ACCOUNT_ID` (the client id) and `HOSTAWAY_API_KEY` (the secret).
3. `npm run doctor` — it should say Hostaway connected.
4. **Settings → Test connection**, then **Import listings**.
5. Open **Properties**. Each listing should be there, linked.
6. **Settings → Sync reservations now.**

**Check:**

- [ ] **Tasks** shows a turnover for each upcoming check-out.
- [ ] Each is scheduled at the property's check-out time, not midnight.
- [ ] A booking with a same-day arrival is flagged and marked High priority.
- [ ] Open one — the deadline should be the next guest's check-in.

**Then test the part most likely to be wrong:** change a departure date in
Hostaway, sync again, and confirm the existing task *moved* rather than a second
one appearing. Then cancel a booking, sync, and confirm its task is cancelled.

---

## 5. Scheduling rules (15 min)

Works without an API key — it falls back to rule scoring, and the suggestions
still explain themselves.

- [ ] **Team** → set each person's working hours, daily cap and skills.
- [ ] **Properties** → set preferred cleaners per property.
- [ ] **Scheduling** → write two or three rules the way you'd say them out loud.
- [ ] Hit **Preview**. Read the reasoning on each suggestion — that's the real
      test. If it's picking the wrong person, the rules or the per-property
      preferences are what to adjust.
- [ ] Open an unassigned task → **Suggest a cleaner** → expand the candidate list.
      It shows who was ruled out and why, which is usually where a surprise
      comes from.

Add `ANTHROPIC_API_KEY` and compare. With a key, the model weighs your
plain-English rules; without, it's the built-in scoring only.

---

## 6. Google Calendar (20 min)

Fiddly, and the failure mode is silent, so check it properly.

1. Google Cloud → service account → JSON key. Enable the Calendar API.
2. Set `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` (keep the `\n` escapes).
3. **Set `GOOGLE_IMPERSONATE_USER`** to a Workspace user, and grant that service
   account domain-wide delegation. Without this, events are created and *nobody
   is invited* — the single most likely thing to go wrong here.
4. `npm run doctor`, then **Settings → Test connection**.
5. **Push tasks to calendar.**

**Check:**

- [ ] The event is on the calendar at the right local time.
- [ ] **The assignee actually received an invite email.** Check their inbox, not
      just the calendar.
- [ ] The event has the address and access notes in it.
- [ ] Reschedule the task in TurnKeep — the existing event should *move*, not
      duplicate.

---

## 7. Photo and video analysis (15 min)

Needs `ANTHROPIC_API_KEY`. Costs roughly a cent per photo.

- [ ] Open an issue with photos → **Read the photos**. Compare its severity
      suggestion to your own judgement.
- [ ] **Run a dozen real photos through before trusting it.** I only tested this
      against a stub, so the pipeline is proven but the quality of the readings
      isn't. Issues from your own properties, where you already know the answer,
      are the right test set.
- [ ] **Walkthrough** → film 30 seconds of a property and upload it. Check the
      findings point at the right moments in the clip.
- [ ] Untick a finding you disagree with, raise the rest, confirm only those
      became issues.

---

## 8. Assistant access (10 min)

- [ ] **Settings → Assistant access → New token**, for yourself.
- [ ] Add `https://your-app/api/mcp` as a custom connector in Claude, with the
      token as the bearer credential.
- [ ] Ask it: *"what's unassigned this week?"*, *"which issues have been carried
      more than twice?"*
- [ ] Make a token for a cleaner, connect it, and confirm it only sees that
      cleaner's work. **Worth doing by hand** — it's the thing that would be
      embarrassing to get wrong.

---

## What to watch for in the first fortnight

- **The nightly pipeline.** Settings shows the run history. A failing step there
  is how you'd find out Hostaway changed something.
- **Issues with a high carry count.** If something's been carried onto five
  visits, either it's genuinely stuck or the resolution flow isn't being used.
- **Tasks the scheduler couldn't fill.** The reason is recorded — usually a
  working-hours or daily-cap setting that's too tight.
- **Photos that never uploaded.** The banner shows them, but ask your cleaners
  whether they ever see it.

## Known gaps

- Nothing is tested against real Hostaway, Google or Anthropic credentials.
- No Telegram *push* — `/api/bot` answers questions, it doesn't send alerts.
- Photos survive going offline only while the browser is running; a true
  background upload after the app closes needs a service worker.
- No payroll export from the time clock.
