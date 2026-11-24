# Real-Time Campus Parking Space Monitoring System

A web-based parking management system for students, faculty, security personnel and administrators.
Security personnel record vehicle entries and exits. Each entry sets a space to **OCCUPIED**, and each exit sets it back to **AVAILABLE**.
Every open dashboard updates instantly over WebSockets, with no page refresh needed. The system is software only: no sensors, cameras or other hardware.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Axios, React Router, Recharts |
| Backend | Python, Django 5.2, Django REST Framework, Simple JWT, Django Channels (Daphne), django-cors-headers |
| Data | PostgreSQL (all permanent records), Redis (Channels/WebSocket messaging only) |

## Project structure

```
backend/
  config/            settings, URLs, ASGI (HTTP + WebSocket routing)
  accounts/          custom User model (roles), auth, registration, password reset, user management
  parking/           areas, spaces, vehicles, transactions, record reports, notifications,
                     activity logs, settings, analytics, reports, WebSocket consumer
    services.py      availability stats + realtime broadcast + logging/notification helpers
    management/commands/seed_demo.py   demo data
    tests.py         API + WebSocket tests
frontend/
  src/lib/           axios client (JWT auto-refresh), types, hooks, utils
  src/context/       AuthContext, RealtimeContext (WebSocket with auto-reconnect)
  src/components/    layout, shadcn/ui components, parking grid, charts
  src/pages/         auth/, admin/, security/, user/ (student & faculty), common/
```

## Setup

### 1. Prerequisites
- Python 3.12+ and Node.js 20+
- PostgreSQL 14+. Create the role and database (as the `postgres` superuser, in `psql`):
  ```sql
  CREATE ROLE campus_parking_app LOGIN CREATEDB PASSWORD 'choose-a-strong-password';
  CREATE DATABASE campus_parking OWNER campus_parking_app ENCODING 'UTF8' TEMPLATE template0;
  ```
  Put the same password in `DB_PASSWORD` in `backend/.env`.
- Redis 6+ (on Windows, use Memurai or Redis in WSL/Docker: `docker run -p 6379:6379 redis`)

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate            # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env           # then edit DB_* and REDIS_URL
python manage.py migrate
python manage.py seed_demo       # optional demo data (use --reset to re-seed)
python manage.py runserver       # serves HTTP + WebSockets on :8000 (via Daphne)
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173 (proxies /api and /ws to :8000)
```

### Demo accounts (after `seed_demo`), password `Parking@2026`
| Role | Email |
|---|---|
| Admin / Security Guard | admin@campus.edu |
| Student Assistant | student@campus.edu |
| Faculty | faculty@campus.edu |

> **Daily start on this machine:** double-click `start-dev.bat`. It starts PostgreSQL, applies migrations, and opens the backend and frontend.
> Login returns **502** whenever the Django backend is not running, so keep its window open.
>
> Leaving `REDIS_URL=` empty uses the in-memory channel layer (single server process only). Use Redis for a real deployment.

Password-reset emails are printed to the Django console by default. To send real email, set the `EMAIL_*` variables.

### Tests
```bash
cd backend && python manage.py test parking
```

## How real-time updates work
1. Security submits `POST /api/transactions/entry/` or `POST /api/transactions/{id}/exit/`.
2. Inside a database transaction, the space row is locked (`select_for_update`), the transaction is written, and the space status is changed.
   Two partial unique constraints guarantee that a vehicle, or a space, has at most one ACTIVE transaction.
3. After commit, `broadcast_parking_update()` pushes the new availability summary through the Redis channel layer to the `parking_updates` group.
4. Every browser holds a `ws://…/ws/parking/?token=<JWT>` connection. `RealtimeContext` receives the event, and each page re-fetches its data.
   The page also briefly highlights the slot that changed. Per-user notifications arrive over the same socket.

## 2D parking map, reservations and events
- The map at **Parking Map & Gate** (admin) / **Parking Spaces** (members) is traced from the campus layout drawing: 24 car slots and 25 motorcycle slots. Slot positions are stored in the database (`parking/layout.py` holds the original layout). The four Offices Row slots (D-01 to D-04) are landscape boxes (migration `0011_offices_row_landscape`).
- On **Parking Map & Gate** the Admin / Security Guard records a vehicle entry by selecting a green box, records an exit by selecting a red box or by searching the plate number (top-right of the map), and sees every parked vehicle in the **Parked vehicles** tab. The map also has a **List** view with large slot buttons for phones.
- Slot colors: **green** available, **red** occupied, **blue** reserved for an event.
- Student assistants and faculty click a green box on the map, confirm, and set an estimated departure time to occupy it. Availability is re-checked on the server inside a locked database transaction.
- All slots belong to faculty, except 3 student motorcycle slots (MC-01 to MC-03). Students may only bring motorcycles inside the campus.
- Administrators manage events under **Event Parking**. Publishing emails all active users, and the selected slots turn blue on the event day. Changes and cancellations send a new notice. Every email is listed under **Email History**.
- A background task in the Django server expires reservations and releases finished events every 20 seconds. `python manage.py process_parking_schedule` does the same for use with a scheduler.
- **Real email delivery needs SMTP settings** in `backend/.env` (see `.env.example`). Test them with `python manage.py send_test_email you@example.com`. Without them, notices are only printed in the backend window and shown as "Console only".

## Accounts and verification
- Student assistants and faculty register with a photo of their DLL School ID. New accounts stay **Pending** until an administrator approves them under **User Management → ID Verification**. There is no limit on the number of Student Assistant accounts.
- Vehicle colors are chosen from a fixed list (`VEHICLE_COLORS` in `accounts/constants.py`, also served by `/api/meta/`). Older free-text colors are kept until the vehicle's color is changed.
- Student assistants and faculty send reports or concerns from **My Reports** (optional JPG/PNG photo, stored privately). Administrators review them under **User Reports**, set the status (Submitted, Under Review, In Progress, Resolved, Rejected) and reply; the sender is notified.
- The photo is stored privately and deleted after the decision. The decision itself stays on record.
- Accounts can be suspended, archived and restored. Administrative actions are kept in a permanent **Audit Trail** (under **Logs & Audit**, next to **Activity Logs**).
- `python manage.py reset_admin_password <email>` issues a one-time administrator password that must be changed at the next sign-in.

## Roles
- **Admin / Security Guard:** dashboard and analytics, manage spaces/areas/categories, users, vehicles, transactions (with search, sort, date filter and pagination). Also reports (daily/weekly/monthly/student/faculty, with CSV and print/PDF), record reports, activity logs and parking settings.
- **Student / Faculty:** read-only dashboard for their own category: totals, availability %, area breakdown, slot map, last-updated time, guidelines and their registered vehicle.

## Main API endpoints (`/api/…`)
`auth/login|refresh|logout|register|me|change-password|password-reset|password-reset/confirm`,
`users/` (+`toggle-active`, `stats`), `areas/`, `spaces/` (+`bulk-create`), `vehicles/` (+`lookup`, `mine`),
`transactions/` (+`entry`, `{id}/exit`, `{id}/cancel`, `active`), `incident-reports/`, `user-reports/` (+`summary`, `{id}/attachment`), `notifications/` (+`mark-all-read`),
`activity-logs/`, `dashboard/summary/`, `analytics/`, `reports/`, `settings/`, `meta/`.
