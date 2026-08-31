# AJ Academy OS  
## Product & Technical Overview  
### Company Presentation Document

**Product:** AJ Academy OS (Internal CRM + Operations Platform)  
**Document type:** Full project overview for partners / enterprise evaluation  
**Version:** 0.1.0 (production internal platform)  
**Date:** July 2026  

---

## 1. Executive Summary

**AJ Academy OS** is a multi-role **CRM and operations platform** built for education and field-sales organisations. It combines student-lead CRM, college outreach, task assignment, attendance, leave, reimbursements, finance, counselling, reminders, push notifications, and performance analytics in one installable web application (PWA).

It is designed for real daily work:

- Admins oversee the organisation and all CRM activity  
- Employees run their own pipeline (leads + college visits) and field tasks  
- Mentors, freelancers, and students use dedicated portals with only the modules they need  

**Core value:** one system for CRM + people operations + field execution — with database-level access isolation, mobile/PWA support, and live notifications when staff are away from the desk.

---

## 2. Product Purpose

| Goal | How AJ Academy OS delivers it |
|------|-------------------------------|
| Capture & convert student leads | Student Master CRM, pipeline, follow-ups, proposals, outreach |
| Manage college partnerships | College Visits CRM, MOU/proposal trackers, visit tasks |
| Assign and track field work | Task Assignment linked to leads, colleges, and projects |
| Control who sees what | Role portals + Postgres Row Level Security (owner isolation) |
| Run daily operations | Attendance, leave, permissions, reimbursements, policies |
| Measure performance | Reports & Analytics (calls, tasks, admissions, productivity, EOD) |
| Keep field staff responsive | PWA + Firebase push + in-app alerts + app icon badges |

---

## 3. Who Uses the Platform (Roles)

| Role | Portal | Primary use |
|------|--------|-------------|
| **Super Admin / Admin** | `/admin/*` | Full CRM, users, finance, attendance oversight, policies, reports, notification diagnostics |
| **Employee** | `/employee/*` | Own Student Master & College Visits, My Tasks, attendance, leave, reimbursements, own reports |
| **Mentor** | `/mentor/*` | Attendance, assign tasks (department students), counselling, reimbursement |
| **Freelancer** | `/freelancer/*` | Selfie attendance, assign tasks, reimbursement, my tasks |
| **Student** | `/student/*` | Attendance, my tasks, portfolio, counselling, leave, policies |

Access is enforced at three layers:

1. Portal layouts (role gate)  
2. API session checks  
3. Database Row Level Security (RLS)  

---

## 4. Module Catalogue

### 4.1 CRM

#### Student Master
- Overview, All Students, Follow-ups, Pipeline, Admitted Students  
- Proposal Tracker and Activity Timeline  
- Meta/admissions-style fields (city, career goal, objections, counselling, payment mode, etc.)  
- CSV / XLSX import & export  
- Configurable dropdown lists from Admin Settings  
- Call / WhatsApp / Email outreach with activity logging  
- Call outcome workflow (start session → dial → confirm outcome)  

#### College Visits
- Overview, All Colleges, Follow-ups, Pipeline, Converted Colleges  
- MOU Tracker, Proposal Tracker, Activity Timeline  
- Multi-contact support, visited-by, lead scoring  
- Assign colleges to employees as task work  
- Import / export  

#### Task Assignment
- Assign tasks linked to **Student Leads**, **College Visits**, or **Projects**  
- Deduplication so the same lead/college does not create unnecessary duplicate open tasks  
- Employee My Tasks: view, call, WhatsApp, email, activity, progress, complete with files  
- Pin selected leads/colleges into employee CRM  
- Pin project tasks to employee dashboard  

#### Call Workflow
- Start call session with concurrency lock (one active call per lead)  
- After-call modal for outcome, notes, next action, status/stage/priority, duration  
- Stale-session handling for abandoned calls  
- Explicit confirmation required — browsers cannot detect whether a phone call was answered  

### 4.2 Operations

| Module | Capability |
|--------|------------|
| **Attendance** | Check-in / check-out, GPS + camera permissions, selfie flows for selected roles, work summaries / End-of-Day fields |
| **Leave & Permission** | Employee/student requests and admin handling |
| **Reimbursements** | Claim submission, bill upload, admin approval workflow |
| **Finance & Expenses** | Admin income / expense / payment tracking with configurable lists |
| **Project Master** | Projects, team, timeline, budget, linkage to tasks |
| **Counselling** | Admin/mentor scheduling; student counselling history; optional email notices |
| **Reminders & Calendar** | Personal/team reminders, in-app alerts, scheduled processing |
| **Company Policies** | Publish policies; acceptance gates before portal use |
| **Portfolio** | Student portfolio upload/management |
| **User Master** | Users, roles, departments |
| **Settings** | Editable CRM / college / project / finance dropdown lists |
| **Reports & Analytics** | KPIs, calls, follow-ups, tasks, admissions, revenue signals, productivity bands, EOD, CSV/XLSX/PDF export |

### 4.3 Notifications & Field Experience

| Feature | Description |
|---------|-------------|
| In-app notification bell | Unread alerts from the database |
| Realtime alerts | Sound/popup while the dashboard is open |
| Firebase Cloud Messaging | System toast when the app is minimized or in background |
| PWA install | Installable on Windows / Android (standalone app feel) |
| App icon badge | Taskbar/dock count (1, 2, 3…) on supported browsers when installed |
| Notification diagnostics | Admin tooling to verify permission, devices, and delivery health |

---

## 5. Technology Stack

**AJ Academy OS does not use Python.** The application stack is:

| Layer | Technology |
|-------|------------|
| **Primary language** | TypeScript |
| **UI** | React 19, Next.js 16 (App Router) |
| **Styling** | Tailwind CSS 4 |
| **API** | Next.js Route Handlers (`/api/*`) |
| **Database** | PostgreSQL via Supabase |
| **Auth** | Supabase Auth (email/password, session cookies) |
| **Realtime** | Supabase Realtime |
| **File storage** | Supabase Storage |
| **Hosting** | Vercel |
| **Push notifications** | Firebase Cloud Messaging (web) + Firebase Admin SDK |
| **PWA** | Web App Manifest + root Service Worker (`/sw.js`) |
| **Email** | Resend (counselling) + Nodemailer/Gmail (CRM outreach) |
| **Charts / exports** | Recharts, jsPDF, SheetJS (XLSX) |
| **Database scripts** | SQL (`AJ_Academy_SB`) |
| **Minor scripts** | JavaScript (PWA icon generation, service worker) |

### Languages summary

1. **TypeScript** — main application (UI + server APIs)  
2. **SQL** — schema, security policies, stored procedures  
3. **JavaScript** — service worker / small tooling scripts  
4. **CSS** — theme and layout styling  
5. **JSON / Markdown** — configuration and documentation  

---

## 6. Architecture Overview

```
Users (Browser / Installed PWA)
            │
            ▼
   Next.js on Vercel
   • Role portals (/admin, /employee, /mentor, /freelancer, /student)
   • Server-side role checks
   • Secure API routes
   • Service Worker (offline shell + push display + badge)
            │
            ▼
         Supabase
   • Authentication
   • PostgreSQL + Row Level Security + RPCs
   • Storage buckets
   • Realtime channels
            │
            ▼
   Firebase Admin (server only)
            │
            ▼
   FCM → OS notification (when app is minimized)
```

### Repository layout

```
AJ_Academy/
├── AJ_Academy_OS/     ← Application (deploy this on Vercel)
├── AJ_Academy_SB/     ← Database SQL scripts (run in Supabase)
├── SUPABASE_SETUP_GUIDE.md
└── README.md
```

### Design principles

- **Supabase** is the source of truth for identity and data  
- **Firebase** is used only for push messaging  
- **RLS** enforces data access in the database itself  
- **Service role** credentials never ship to the browser  
- **PWA** supports field staff offline shell + installable experience  

---

## 7. Security Model

| Control | Implementation |
|---------|----------------|
| Role-based portals | Each role has its own route tree and sidebar |
| API authentication | Session validation on sensitive endpoints |
| Row Level Security | Postgres policies control row visibility/writes |
| Owner isolation | Employees see their own CRM rows; admins oversee all |
| Service role | Server-only privileged client for approved operations |
| Rate limiting | Login, push, call, and outreach endpoints |
| Safe redirects | Only same-origin relative paths after login / notification click |
| Security headers | CSP, HSTS (production), frame protection, permissions policy |
| Audit hooks | Security event logging support |
| Safe push copy | Lock-screen notifications avoid sensitive personal details |

---

## 8. Data & Database Approach

Database changes are managed as **ordered SQL scripts** in `AJ_Academy_SB`, documented in:

- `DATABASE_SETUP_ORDER.txt`  
- `SUPABASE_SETUP_GUIDE.md`  

This gives enterprises:

- Auditable schema history  
- Controlled rollout of features (CRM isolation, call workflow, FCM, analytics, etc.)  
- Clear dependency order for setup and recovery  

Core data domains include profiles/roles, tasks, student leads (`clients`), college visits, attendance, finance/reimbursements, reminders, notifications, push devices, call sessions, and analytics support objects.

---

## 9. Deployment & Environment

### Hosting
- **Platform:** Vercel  
- **Root Directory (required):** `AJ_Academy_OS`  
- Without the correct root directory, deploys may show “Ready” but return 404  

### Environment categories

| Category | Examples |
|----------|----------|
| Supabase | Project URL, anon key, service role key |
| Site / Auth | Public site URL, Auth redirect URLs |
| Firebase (public) | Web config + VAPID key |
| Firebase (private) | Service account project/email/private key |
| Outreach email | Gmail user + app password |
| Counselling email | Resend API key |
| Reminders | Cron secret; optional reminder VAPID keys |

---

## 10. Typical Business Workflows

### A. Assign college visit to an employee
1. Admin opens College Visits / Task Assignment  
2. Selects college(s) and employee  
3. System creates/merges task + in-app notification  
4. Employee receives push toast (even if minimized)  
5. Employee works My Tasks → Call / WhatsApp / Email → logs activity  

### B. Student lead calling
1. Employee opens Student Master or task-linked lead  
2. Starts call session (lead locked for others)  
3. Phone dialer opens  
4. After call, employee confirms outcome, notes, next action  
5. Lead status/stage/priority update; activity recorded  

### C. Field attendance
1. Employee opens My Attendance  
2. Grants camera/location as required  
3. Check-in / check-out recorded  
4. Work summary / EOD can be tracked for accountability  

### D. Management visibility
1. Admin opens Reports & Analytics  
2. Filters by date / employee / module signals  
3. Reviews productivity, calls, follow-ups, admissions-related metrics  
4. Exports CSV / XLSX / PDF as needed  

---

## 11. Differentiators for Enterprise Buyers

1. **Full operations OS**, not a standalone lead spreadsheet CRM  
2. **Role-isolated portals** with shared platform modules  
3. **Education-specific workflows** (admissions counselling fields, college MOU/proposal trackers)  
4. **Task ↔ CRM ↔ Project linking** with pins and completion evidence  
5. **Call discipline** (session lock + mandatory outcome)  
6. **Field-ready PWA** with push notifications and app badges  
7. **Live analytics** on operational data  
8. **Defense-in-depth security** (app + API + database RLS)  
9. **Transparent SQL schema** suitable for IT/security review  
10. **Configurable settings** for CRM/pipeline lists without code changes  

---

## 12. Honest Limitations (Transparency)

| Topic | Current reality |
|-------|-----------------|
| Custom OS notification sound | Web/PWA apps cannot force a custom system tone when minimized; OS default sound applies |
| Push delivery | Depends on browser permission, OS Focus/DND, battery restrictions, network, token validity |
| Call answered detection | Not possible in standard web apps; staff must confirm outcome |
| WhatsApp integration | Opens WhatsApp compose (activity logged); not WhatsApp Business API bulk automation |
| Rate limiting scope | Application-instance based (suitable for single-org deployment; not distributed Redis yet) |
| Reminder cron on Hobby plan | Daily scheduled processor unless upgraded plan or external cron is added |
| Product packaging | Production internal platform (v0.1.0), actively evolved — not a multi-tenant public SaaS marketplace |

These limitations are normal for secure browser-based enterprise tools and are documented so expectations stay aligned.

---

## 13. Suggested Demo Script (20–25 minutes)

1. **Admin login** → dashboard + sidebar overview  
2. **Student Master** → create/view lead, pipeline stages  
3. **Assign task** to an employee (lead or college)  
4. **Employee device** → show push toast / badge while minimized  
5. **My Tasks** → call flow + after-call outcome  
6. **WhatsApp / email** outreach + activity history  
7. **Attendance** check-in  
8. **Reports & Analytics** team view  
9. **Security story** — employee sees own CRM only; admin sees all  

---

## 14. One-Paragraph Pitch

> AJ Academy OS is a TypeScript/Next.js + Supabase operations platform that unifies education CRM (students and colleges), task assignment, attendance, finance workflows, counselling, and analytics. It ships as an installable PWA with Firebase push for field staff, enforces access with role portals and Postgres Row Level Security, and is hosted on Vercel with an auditable SQL schema suitable for enterprise IT review.

---

## 15. Contact / Next Steps for Evaluation

Recommended evaluation package:

1. Live demo environment walkthrough  
2. Role-based access demonstration (admin vs employee)  
3. Security overview (RLS, service role boundaries, headers)  
4. Deployment checklist (Vercel + Supabase + Firebase)  
5. Optional pilot scope (one team / one city / 2–4 weeks)

---

## Appendix A — Module Map by Role

### Admin
Dashboard · Attendance System · Counselling · Reminders · User Master · Student Master · College Visits · Project Master · Task Assignment · Freelance Management · Finance · Reimbursements · Policies · Portfolio · Reports & Analytics · Settings · Notification Diagnostics  

### Employee
Dashboard · My Attendance · My Tasks · My Reports · Reminders · Notifications · Student Master · College Visits · Leave & Permission · Reimbursement · Policies · My Profile  

### Mentor
Dashboard · My Attendance · Assign Tasks · Counselling · Reimbursement · My Profile  

### Freelancer
Dashboard · My Attendance · Assign Tasks · Reimbursement · My Profile  

### Student
Dashboard · My Attendance · My Tasks · My Portfolio · My Counselling · Leave & Permission · Policies · My Profile  

---

## Appendix B — Document Control

| Item | Value |
|------|-------|
| Product name | AJ Academy OS |
| Application folder | `AJ_Academy_OS` |
| Database folder | `AJ_Academy_SB` |
| Primary stack | TypeScript, React, Next.js, Supabase, Vercel, Firebase Messaging |
| Audience | Partner companies / enterprise evaluators |
| Classification | Internal product overview (non-confidential summary; secrets excluded) |

---

*End of document.*
