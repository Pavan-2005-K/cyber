# CyberFusion – AI Cybersecurity and Digital Forensics Platform

CyberFusion is an AI-powered cybersecurity analysis and digital-forensics platform designed to support security investigations, evidence management, integrity verification, and automated threat analysis.

The platform combines a React and TypeScript frontend with a FastAPI backend, machine-learning analysis modules, Supabase PostgreSQL, and private Supabase Storage.

It provides a centralized environment for managing investigation cases, uploading digital evidence, analyzing potential cyber threats, verifying evidence integrity, and generating investigation reports.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Machine Learning Modules](#machine-learning-modules)
- [Digital Evidence and Integrity Management](#digital-evidence-and-integrity-management)
- [Database and Storage](#database-and-storage)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Limitations](#limitations)

## Overview

CyberFusion integrates machine learning, cybersecurity analysis, and digital-forensics workflows into a single application.

Users can:

1. Register and authenticate securely.
2. Create and manage investigation cases.
3. Upload digital evidence.
4. Analyze suspicious files, messages, URLs, and network activity.
5. Verify evidence integrity using SHA-256.
6. Maintain per-case integrity chains.
7. Generate cryptographically signed integrity checkpoints.
8. Generate and download PDF investigation reports.
9. Review investigation activities through audit logs.

The platform is designed with a modular backend architecture so that individual analysis modules and investigation workflows can be maintained independently.

## Key Features

### Authentication and Case Management

- User registration and login.
- JWT-based authentication.
- Token revocation.
- User-owned investigation cases.
- Case-specific evidence and investigation records.
- Access-controlled API endpoints.

### AI-Powered Cybersecurity Analysis

- Email phishing detection.
- Phishing URL analysis.
- Fake profile detection.
- Online scam detection.
- APK malware analysis.
- Image forgery detection.
- Chat and email analysis.
- Credit-card fraud detection.
- Network intrusion detection.
- Server log analysis.

### Digital Forensics

- Digital evidence upload and management.
- Evidence metadata tracking.
- SHA-256 file integrity verification.
- Per-case evidence integrity chains.
- Ed25519 digital signatures for newly created integrity checkpoints.
- Evidence verification during investigation workflows.
- Investigation report generation.

### Reports and Auditing

- PDF investigation reports.
- Report integrity verification using SHA-256.
- Private report storage.
- Evidence verification during report generation.
- Audit logging for important investigation activities.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | Supabase PostgreSQL |
| ORM | SQLAlchemy |
| Database Driver | psycopg |
| Authentication | JWT |
| Password Security | pwdlib, Argon2 |
| Machine Learning | TensorFlow, Scikit-learn, Joblib |
| Image Processing | Pillow |
| Data Processing | NumPy, Pandas, SciPy |
| Digital Integrity | SHA-256, Ed25519 |
| File Storage | Supabase Storage |
| PDF Generation | ReportLab |
| Backend Hosting | Render |
| Frontend Hosting | Vercel |
| Version Control | Git, GitHub |
| Model Versioning | Git LFS |

## System Architecture

```text
                 ┌─────────────────────────┐
                 │       User / Client     │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │   React + TypeScript    │
                 │       Frontend         │
                 │       (Vercel)         │
                 └────────────┬────────────┘
                              │ HTTPS / REST API
                              ▼
                 ┌─────────────────────────┐
                 │      FastAPI Backend    │
                 │        (Render)        │
                 └────────────┬────────────┘
                              │
             ┌────────────────┼─────────────────┐
             │                │                 │
             ▼                ▼                 ▼
    ┌────────────────┐ ┌───────────────┐ ┌──────────────────┐
    │  ML Analysis   │ │  Supabase     │ │  Integrity and   │
    │    Modules     │ │  PostgreSQL   │ │  Report Services │
    └────────────────┘ └───────────────┘ └────────┬─────────┘
                                                  │
                                                  ▼
                                      ┌──────────────────────┐
                                      │   Supabase Storage   │
                                      │  Private Buckets     │
                                      └──────────────────────┘
```

### Architecture Components

- **Frontend:** Provides the user interface and communicates with backend API endpoints.
- **Backend:** Handles authentication, authorization, investigation workflows, ML analysis, evidence processing, and report generation.
- **Supabase PostgreSQL:** Stores application records, evidence metadata, investigation data, and integrity information.
- **Supabase Storage:** Stores evidence files and generated PDF reports in private buckets.
- **ML Modules:** Perform cybersecurity analysis using trained machine-learning models.
- **Integrity Services:** Calculate SHA-256 hashes and maintain signed integrity records.

## Project Structure

```text
CyberFusion/
│
├── backend/
│   │
│   ├── app/
│   │   ├── auth/                 # Authentication and authorization
│   │   ├── cases/                # Investigation case management
│   │   ├── db/                   # Database configuration and models
│   │   ├── evidence/             # Evidence upload and verification
│   │   ├── integrity/            # Integrity chains and checkpoints
│   │   ├── reports/              # PDF report generation and downloads
│   │   ├── services/             # Shared backend services
│   │   └── ...                   # Other API modules
│   │
│   ├── models/                   # Machine-learning models
│   │
│   ├── storage/                  # Local temporary and legacy files
│   │
│   ├── tests/                    # Additional tests, if present
│   │
│   ├── main.py                   # FastAPI application entry point
│   ├── requirements.txt          # Python dependencies
│   └── ...
│
├── frontend/
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   ├── pages/                # Application pages
│   │   ├── services/             # API communication
│   │   └── ...
│   │
│   ├── package.json
│   └── ...
│
├── .gitattributes                # Git LFS tracking configuration
├── .gitignore
├── .python-version               # Python version configuration
└── README.md
```

## Machine Learning Modules

CyberFusion integrates multiple machine-learning modules for cybersecurity analysis.

| Module | Purpose |
|---|---|
| Email Analysis | Detect suspicious and phishing-related email content |
| Phishing URL Analysis | Analyze URLs for potential phishing activity |
| Fake Profile Detection | Identify potentially fraudulent online profiles |
| Scam Detection | Analyze content for possible online scams |
| APK Malware Analysis | Classify Android application packages for potential malware |
| Image Forgery Detection | Analyze images for possible manipulation |
| Chat and Email Analysis | Identify suspicious communication patterns |
| Credit-Card Fraud Detection | Detect potentially fraudulent transactions |
| Network Intrusion Detection | Identify suspicious network activity |
| Server Log Analysis | Analyze server logs for suspicious events |

The backend loads the configured machine-learning models and exposes analysis functionality through API endpoints.

Model files are maintained in the backend repository. Large model files may use Git LFS.

## Digital Evidence and Integrity Management

CyberFusion uses cryptographic techniques to support digital evidence integrity.

### SHA-256 Evidence Verification

When evidence is uploaded:

1. The backend receives the uploaded file.
2. The file's SHA-256 hash is calculated.
3. The file is uploaded to private Supabase Storage.
4. Storage metadata and evidence information are recorded in PostgreSQL.
5. The calculated hash is retained for later verification.

During verification, the backend retrieves the stored evidence and recalculates its SHA-256 hash.

The calculated hash is compared with the previously recorded hash to detect modifications.

### Per-Case Integrity Chains

Evidence integrity records are associated with investigation cases.

The integrity workflow maintains a sequence of records and cryptographic hash relationships to support verification of the evidence history.

### Ed25519 Digital Signatures

CyberFusion uses Ed25519 digital signatures for newly created integrity checkpoints.

- The private key is used to sign checkpoints.
- Trusted public keys are used for signature verification.
- A key identifier associates signatures with the appropriate public key.
- Private signing keys are stored outside the source repository.

Historical integrity records and their original hashes must be preserved during migrations.

## Database and Storage

### Supabase PostgreSQL

Supabase PostgreSQL is used as the persistent relational database.

SQLAlchemy provides database connectivity and ORM functionality.

The database stores information such as:

- User accounts and authentication-related records.
- Investigation cases.
- Evidence metadata.
- Integrity records and checkpoints.
- Investigation reports.
- Audit logs.
- Other investigation-related information.

The backend connects to PostgreSQL using `DATABASE_URL` and the installed `psycopg` driver.

### Supabase Storage

CyberFusion uses private Supabase Storage buckets for durable file storage.

| Bucket | Purpose | Maximum File Size |
|---|---|---:|
| `cyberfusion-evidence` | Digital evidence files | 10 MB |
| `cyberfusion-reports` | Generated investigation PDFs | 20 MB |

Evidence and report objects are accessed through the backend using the Supabase service-role credentials.

Storage object references and metadata are maintained in PostgreSQL.

The service-role key must never be exposed to the frontend or committed to GitHub.

### Database Initialization and Migrations

The application does not automatically initialize or migrate the database at startup.

For a new local SQLite database, SQLAlchemy tables can be created using:

```powershell
cd backend
python -m app.db.init_db
```

This command creates tables from the SQLAlchemy models. It does not run the standalone SQLite migration scripts or import existing records.

**Important:** The existing scripts in `backend/app/db/migrations/` are SQLite-specific. They must not be executed against Supabase PostgreSQL.

A new PostgreSQL deployment must have its schema provisioned using an appropriate PostgreSQL-compatible migration process before the backend is started.

## Getting Started

### Prerequisites

Install the following tools:

- Python 3.13
- Node.js and npm
- Git
- Git LFS
- VS Code or another code editor
- A Supabase project for PostgreSQL and Storage

Check the installed versions:

```powershell
python --version
node --version
npm --version
git --version
git lfs version
```

### 1. Clone the Repository

```powershell
git clone https://github.com/Pavan-2005-K/cyber.git

cd cyber
```

### 2. Download Git LFS Models

CyberFusion uses Git LFS for large machine-learning model files.

Install Git LFS if it is not already installed:

```powershell
git lfs install
```

Download the tracked model files:

```powershell
git lfs pull
```

Verify the APK model:

```powershell
git lfs ls-files
```

The following file must contain the actual model rather than an LFS pointer:

```text
backend/models/apk_static_analysis/apk_malware_model.joblib
```

### 3. Configure the Backend

Navigate to the backend:

```powershell
cd backend
```

Create a Python virtual environment:

```powershell
py -3.13 -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create a `backend/.env` file and configure the required environment variables.

Refer to [Environment Configuration](#environment-configuration).

### 4. Configure the Frontend

Open a second terminal from the repository root:

```powershell
cd frontend
```

Install frontend dependencies:

```powershell
npm install
```

Configure the local API URL:

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
```

## Environment Configuration

### Backend Environment Variables

The backend uses environment variables for database connectivity, authentication, storage, and cryptographic signing.

Example configuration:

```env
# Application
PORT=8000
NODE_ENV=development

# Database
DATABASE_URL=YOUR_POSTGRESQL_CONNECTION_STRING

# Supabase
SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# JWT Authentication
CYBERFUSION_JWT_SECRET=YOUR_STRONG_RANDOM_SECRET

# Ed25519 Integrity Signing
CYBERFUSION_INTEGRITY_PRIVATE_KEY_FILE=PATH_TO_PRIVATE_KEY
CYBERFUSION_INTEGRITY_KEY_ID=YOUR_SIGNING_KEY_ID
CYBERFUSION_INTEGRITY_TRUSTED_PUBLIC_KEYS_FILE=PATH_TO_TRUSTED_PUBLIC_KEYS_JSON

# CORS
CORS_ORIGINS=http://localhost:5173
```

These are example variable names. Use the actual values from your own Supabase project and local secret files.

The Supabase service-role key, database password, JWT secret, and private signing key must remain confidential.

### Ed25519 Key Files

The signing configuration requires:

- An Ed25519 private key.
- A trusted public-key configuration file.
- A signing key identifier.

Keep these files outside the Git repository.

For Render, configure the keys as Secret Files and point the environment variables to their mounted paths.

Example Render paths:

```text
/etc/secrets/integrity_private.pem
/etc/secrets/trusted_public_keys.json
```

Do not put private keys in the frontend or commit them to GitHub.

### Frontend Environment Variables

The frontend requires:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

For production, replace the local address with the deployed Render backend URL.

Vite embeds `VITE_` variables into the browser build. Never put database credentials, Supabase service-role keys, JWT signing secrets, or private keys in frontend environment variables.

## Running the Application

### Start the Backend

From the `backend` directory, activate the virtual environment and run:

```powershell
uvicorn main:app --reload
```

The backend will normally be available at:

```text
http://127.0.0.1:8000
```

Interactive API documentation:

```text
http://127.0.0.1:8000/docs
```

### Start the Frontend

From the `frontend` directory:

```powershell
npm run dev
```

Vite will display the local frontend URL, normally:

```text
http://localhost:5173
```

Open that address in a browser.

## Testing

### Backend Tests

From the `backend` directory, activate the virtual environment and execute:

```powershell
pytest -q
```

The backend test suite includes coverage for evidence handling, integrity verification, report workflows, and other API functionality.

Cloud-storage tests use test helpers and mocked storage operations rather than requiring live Supabase uploads.

### Python Compilation

To check Python syntax:

```powershell
python -m compileall -q .
```

### Git Whitespace Validation

From the repository root:

```powershell
git diff --check
```

For staged changes:

```powershell
git diff --cached --check
```

### Frontend Production Build

From the `frontend` directory:

```powershell
npm run build
```

Resolve build errors before deploying the frontend.

## Deployment

CyberFusion uses the following hosting architecture:

| Component | Hosting Platform |
|---|---|
| React + Vite Frontend | Vercel |
| FastAPI Backend | Render |
| PostgreSQL Database | Supabase |
| Evidence and PDF Storage | Supabase Storage |
| Source Code | GitHub |

### Backend Deployment – Render

Create a new Render Web Service and connect the GitHub repository.

Configure the service with the following settings:

| Setting | Value |
|---|---|
| Runtime | Python |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

The repository-level `.python-version` file specifies Python 3.13.13.

Configure the backend environment variables in Render:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CYBERFUSION_JWT_SECRET`
- `CYBERFUSION_INTEGRITY_PRIVATE_KEY_FILE`
- `CYBERFUSION_INTEGRITY_KEY_ID`
- `CYBERFUSION_INTEGRITY_TRUSTED_PUBLIC_KEYS_FILE`
- `CORS_ORIGINS`

Add the Ed25519 private key and trusted public-key configuration as Render Secret Files. Configure the corresponding file-path variables to match the mounted paths.

#### Git LFS on Render

The APK malware model is tracked using Git LFS.

Verify that the model is hydrated in the Render build environment before the application starts. A Git LFS pointer file is not a usable machine-learning model.

Check the hosting build process and Git LFS availability before relying on the model in production.

### Frontend Deployment – Vercel

Import the GitHub repository into Vercel.

Configure:

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Add the following production environment variable:

```env
VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND-URL
```

Use the actual Render service URL.

Redeploy the frontend after changing production environment variables.

### CORS Configuration

The backend must allow requests from the deployed Vercel frontend.

Set `CORS_ORIGINS` in Render to include the production frontend origin:

```env
CORS_ORIGINS=http://localhost:5173,https://YOUR-VERCEL-DOMAIN
```

Use the exact deployed frontend origin, without an API path.

After changing the CORS configuration, redeploy or restart the backend.

### Deployment Verification

After deploying:

1. Open the Render backend URL.
2. Check the API documentation at `/docs`, if enabled.
3. Verify that the backend can connect to Supabase PostgreSQL.
4. Verify that Supabase Storage uploads and downloads work.
5. Test authentication and protected endpoints.
6. Test evidence upload and SHA-256 verification.
7. Test integrity checkpoint creation and signature verification.
8. Generate and download a PDF investigation report.
9. Open the Vercel frontend.
10. Verify frontend-to-backend API communication.

## Security Considerations

CyberFusion handles investigation information and digital evidence. The following security practices are important:

- Never commit `.env` files.
- Never expose the Supabase service-role key in browser code.
- Store signing private keys outside the repository.
- Use HTTPS for deployed frontend and backend communication.
- Apply authentication and authorization to protected API endpoints.
- Keep evidence and report buckets private.
- Validate uploaded file sizes and content types.
- Verify evidence using SHA-256 before relying on it.
- Verify report hashes before serving cloud-stored reports.
- Preserve historical integrity records during database migrations.
- Restrict CORS to trusted frontend origins.
- Avoid logging passwords, tokens, private keys, and other secrets.
- Use strong, randomly generated JWT secrets.

## Limitations

- Machine-learning detection results depend on model quality, training data, and input characteristics. They should not be treated as definitive proof of malicious activity.
- Git LFS model files must be downloaded and available before their corresponding analysis modules can operate.
- Render Free services have limited memory and may sleep after periods of inactivity. ML-heavy model loading can exceed the available memory.
- Ephemeral hosting filesystems are not suitable for permanent evidence or report storage. CyberFusion uses Supabase Storage for durable cloud file storage.
- Database schema changes require an appropriate migration process. The application does not automatically migrate PostgreSQL databases at startup.
- Local SQLite migration scripts are not compatible with Supabase PostgreSQL.

## License

MIT 

---

**CyberFusion – AI Cybersecurity and Digital Forensics Platform**

Developed as a cybersecurity and digital-forensics engineering project.
