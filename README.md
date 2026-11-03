# CyberFusion

CyberFusion is a cybersecurity analysis and digital-forensics application with a
React/TypeScript frontend and a FastAPI backend. It combines case management,
evidence metadata and integrity tracking, investigation reports, audit logs, and
machine-learning analysis modules.

## Project structure

```text
CyberFusion/
├── backend/
│   ├── app/                 # API routers, database models, auth, integrity
│   ├── models/              # ML models and model configuration
│   ├── storage/             # Local evidence and generated reports
│   ├── main.py              # FastAPI app and ML endpoints
│   └── requirements.txt
└── frontend/
    ├── src/                 # React application
    └── package.json
```

## Features

- User registration, login, JWT authentication, and token revocation.
- User-owned cases, evidence metadata, detection findings, and reports.
- SHA-256 evidence verification and per-case integrity chains.
- Ed25519 signatures for newly created integrity checkpoints.
- PDF investigation reports and audit logging.
- ML analysis for email, phishing URLs, profiles, scams, APKs, image forgery,
  chat/email, credit-card fraud, network intrusion, and server logs.

## Local development

### Backend

Use Python 3.13 for the current pinned dependency set. From the repository root:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

The backend reads `backend/.env` when present. Configure the required secrets
and signing-key settings in your local environment; never commit `.env` or
private keys. `DATABASE_URL` is optional for local SQLite use. If unset, the
backend points to `backend/cyberfusion.db`.

For a new local database, create the tables from the SQLAlchemy models:

```powershell
python -m app.db.init_db
```

This creates tables; it does not run the standalone SQLite migration scripts or
import existing data. The scripts in `backend/app/db/migrations/` are SQLite
specific. The application does not automatically initialize or migrate the
database at startup.

Start the API from the `backend` directory:

```powershell
uvicorn main:app --reload
```

The API is available at `http://127.0.0.1:8000`; interactive API documentation
is at `http://127.0.0.1:8000/docs`.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Vite prints the local frontend URL (normally `http://localhost:5173`). For a
production build, configure `VITE_API_BASE_URL` in the frontend build
environment and run:

```powershell
npm run build
```

## Database and file-storage notes

- SQLAlchemy models are in `backend/app/db/models.py`; connection setup is in
  `backend/app/db/database.py`.
- Existing SQLite migration scripts are not PostgreSQL migrations. Provision a
  PostgreSQL schema with an appropriate migration process before using
  `DATABASE_URL` with PostgreSQL.
- Evidence and generated PDFs currently use local filesystem storage under
  `backend/storage/`. This storage is not durable on ephemeral hosting. The
  nullable Supabase Storage metadata fields in the models do not, by themselves,
  upload or retrieve objects.
- Existing report records may contain absolute paths from the machine where they
  were generated. Preserve those historical values when migrating and maintain
  separate durable object references.
- The APK model at
  `backend/models/apk_static_analysis/apk_malware_model.joblib` is tracked with
  Git LFS. Install Git LFS and ensure the model is hydrated before starting the
  backend.

## Deployment configuration

The backend currently uses these configuration values:

- `DATABASE_URL` — optional locally; use a PostgreSQL SQLAlchemy URL with the
  installed psycopg driver for PostgreSQL.
- `CYBERFUSION_JWT_SECRET` — required for signing and validating JWTs.
- `CYBERFUSION_INTEGRITY_PRIVATE_KEY_FILE` — absolute path to the Ed25519
  private-key file, outside the repository.
- `CYBERFUSION_INTEGRITY_KEY_ID` — active signing key identifier.
- `CYBERFUSION_INTEGRITY_TRUSTED_PUBLIC_KEYS_FILE` — absolute path to the
  trusted public-key configuration file.

Keep all backend secrets on the backend host. The frontend variable
`VITE_API_BASE_URL` is included in the browser build and must not contain
credentials. Configure the backend CORS allowlist for the deployed frontend
origin; the current application configuration allows only the local Vite
origin.

Before deploying to an ephemeral backend host, migrate evidence and report files
to durable private object storage and update the application to use that
storage. The backend currently loads its ML models during application import;
measure startup time and memory use on the intended hosting plan.
