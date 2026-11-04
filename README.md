# CyberFusion – AI Cybersecurity and Digital Forensics Platform

CyberFusion is an AI-powered cybersecurity analysis and digital-forensics platform designed to support security investigations, digital evidence management, integrity verification, and automated threat analysis.

The platform combines a React and TypeScript frontend with a FastAPI backend, machine-learning analysis modules, Supabase PostgreSQL, and private Supabase Storage.

It provides a centralized environment for managing investigation cases, uploading digital evidence, analyzing potential cyber threats, verifying evidence integrity, and generating investigation reports.

## Live Deployment

| Component | URL |
|---|---|
| Frontend Application | https://cyber-eight-mauve.vercel.app |
| Login Page | https://cyber-eight-mauve.vercel.app/login |
| Backend API | https://cyberfusion-backend.onrender.com |
| Backend Health Check | https://cyberfusion-backend.onrender.com/health |

**Deployment Architecture:**
- Frontend: Vercel
- Backend: Render
- Database: Supabase PostgreSQL
- File Storage: Supabase Storage

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Machine Learning Modules](#machine-learning-modules)
- [Lazy Model Loading](#lazy-model-loading)
- [Digital Evidence and Integrity Management](#digital-evidence-and-integrity-management)
- [Database and Storage](#database-and-storage)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Deployment](#deployment)
- [Production Verification](#production-verification)
- [Security Considerations](#security-considerations)
- [Limitations](#limitations)
- [License](#license)

---

## Overview

CyberFusion integrates machine learning, cybersecurity analysis, and digital-forensics workflows into a single application.

Users can:

1. Register and authenticate securely.
2. Create and manage investigation cases.
3. Upload digital evidence.
4. Analyze suspicious files, messages, URLs, and network activity.
5. Verify evidence integrity using SHA-256.
6. Maintain per-case cryptographic integrity chains.
7. Generate cryptographically signed integrity checkpoints.
8. Generate and download PDF investigation reports.
9. Review investigation activities through audit logs.

The platform follows a modular backend architecture so individual analysis modules and investigation workflows can be maintained independently.

## Key Features

### 1. Authentication and Case Management

- User registration and login.
- JWT-based authentication.
- Token revocation.
- User-owned investigation cases.
- Case-specific evidence and investigation records.
- Access-controlled API endpoints.

### 2. AI-Powered Cybersecurity Analysis

- Email phishing detection.
- Phishing URL analysis.
- Fake profile detection.
- Online scam and spam detection.
- APK malware analysis.
- Image forgery detection.
- Chat and email analysis.
- Credit-card fraud detection.
- Network intrusion detection.
- Server log analysis.

### 3. Digital Forensics

- Digital evidence upload and management.
- Evidence metadata tracking.
- SHA-256 file integrity verification.
- Per-case cryptographic integrity chains.
- Ed25519 digital signatures for newly created integrity checkpoints.
- Evidence verification during investigation workflows.
- Investigation report generation.

### 4. Reports and Auditing

- PDF investigation reports.
- Report integrity verification using SHA-256.
- Private report storage.
- Evidence verification during report generation.
- Audit logging for important investigation activities.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| API Communication | REST API, HTTPS |
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

---

## System Architecture

CyberFusion follows a client-server architecture. The frontend communicates with the FastAPI backend through HTTPS REST APIs. The backend coordinates authentication, case management, machine-learning analysis, database operations, evidence storage, integrity verification, and report generation.

### Architecture Diagram

```text
                  ┌─────────────────────────┐
                  │      User / Client      │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │   React + TypeScript    │
                  │       Frontend          │
                  │        (Vercel)         │
                  └────────────┬────────────┘
                               │
                         HTTPS / REST API
                               │
                               ▼
                  ┌─────────────────────────┐
                  │     FastAPI Backend     │
                  │        (Render)         │
                  └────────────┬────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
  │  AI/ML Analysis│  │   Supabase     │  │   Integrity and  │
  │    Modules     │  │  PostgreSQL    │  │ Report Services  │
  └────────────────┘  └────────────────┘  └────────┬─────────┘
                                                   │
                                                   ▼
                                      ┌──────────────────────┐
                                      │   Supabase Storage   │
                                      │    Private Buckets   │
                                      └──────────────────────┘
```

### Architecture Components

- **Frontend:** Provides the user interface and communicates with backend API endpoints.
- **Backend:** Handles authentication, authorization, investigation workflows, machine-learning analysis, evidence processing, and report generation.
- **Supabase PostgreSQL:** Stores application records, evidence metadata, investigation data, and integrity information.
- **Supabase Storage:** Stores evidence files and generated PDF reports in private buckets.
- **AI/ML Modules:** Perform cybersecurity analysis using configured machine-learning models and analysis components.
- **Integrity Services:** Calculate SHA-256 hashes, maintain cryptographic integrity records, and generate or verify Ed25519 signatures.
- **Report Services:** Generate PDF investigation reports and support report integrity verification.

**Note:** CyberFusion uses cryptographic hashing, hash chains, and digital signatures. It does not use blockchain technology or a distributed ledger.

---

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
│   │   └── ...                   # Other application modules
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

*Note: The structure above highlights the main application components. Additional files and directories may exist in the repository.*

---

## Machine Learning Modules

CyberFusion integrates multiple machine-learning and analysis modules for cybersecurity investigations.

| Module | Purpose |
|---|---|
| Fake Email Detection | Detect suspicious and phishing-related email content |
| Phishing URL Detection | Analyze URLs for potential phishing activity |
| Fake Profile Detection | Identify potentially fraudulent online profiles |
| Scam and Spam Detection | Analyze content for possible online scams and spam |
| APK Malware Analysis | Classify Android application packages for potential malware |
| Image Forgery Detection | Analyze images for possible manipulation |
| Chat and Email Forensics | Identify suspicious communication patterns |
| Credit-Card Fraud Detection | Detect potentially fraudulent transactions |
| Network Intrusion Detection | Identify suspicious network activity |
| Server Log Analysis | Analyze server logs for suspicious events |

The backend loads the configured machine-learning models and exposes their analysis functionality through API endpoints.

Model files are maintained in the backend repository. Large model files may use Git LFS.

The specific algorithms and models differ between modules. Not every analysis component necessarily uses the same machine-learning architecture.

### Lazy Model Loading

CyberFusion implements lazy initialization for memory-intensive machine-learning models to reduce backend startup memory consumption.

The following models are loaded only when their corresponding analysis endpoints are first requested:

- APK Malware Analysis.
- Image Forgery Detection.

Other smaller models are initialized during backend startup.

The lazy-loading implementation includes:

- On-demand model initialization.
- Shared runtime caching to avoid repeated model loading.
- Thread-safe initialization using a shared lock.
- Model configuration and input validation.
- HTTP 503 responses when model initialization fails.
- Health-check status reporting for lazy-loaded models.

This approach reduces the memory required during normal backend startup.

**Important:** Lazy loading reduces startup memory consumption but does not guarantee that memory-intensive inference will fit within the available hosting memory.

---

## Digital Evidence and Integrity Management

CyberFusion uses cryptographic techniques to support digital evidence integrity.

### 1. Evidence Upload

When evidence is uploaded:

1. The backend receives the uploaded file.
2. The file is validated.
3. Its SHA-256 hash is calculated.
4. The file is uploaded to private Supabase Storage.
5. Evidence metadata and storage references are recorded in PostgreSQL.
6. The integrity information is associated with the investigation case.

Supported evidence formats depend on the backend validation and configured storage MIME types.

### 2. SHA-256 Evidence Verification

SHA-256 is used to calculate a cryptographic hash of the evidence file.

During verification:

1. The backend retrieves the stored evidence.
2. The SHA-256 hash is recalculated.
3. The calculated hash is compared with the previously recorded hash.
4. The verification result indicates whether the file content matches the recorded evidence.

A matching hash provides evidence that the retrieved file content has not changed relative to the recorded hash.

However, SHA-256 verification alone does not independently prove the original source, ownership, or authenticity of the evidence.

### 3. Per-Case Cryptographic Integrity Chains

CyberFusion maintains cryptographic integrity records associated with individual investigation cases.

- Each evidence record contains its corresponding SHA-256 hash.
- Integrity records are maintained in a sequential chain using cryptographic hash relationships.
- Previous integrity information is used to support verification of subsequent records.
- Case integrity-chain verification checks the consistency of the recorded evidence history.

Case integrity-chain verification is separate from individual file hash verification.

**Note:** This implementation uses cryptographic hash chains and does not use blockchain technology, smart contracts, or a distributed ledger.

### 4. Ed25519 Digital Signatures

CyberFusion uses Ed25519 digital signatures for newly created integrity checkpoints.

- The private key is used to sign integrity checkpoints.
- Trusted public keys are used for signature verification.
- A key identifier associates signatures with the appropriate public key.
- Private signing keys are stored outside the source repository.

Historical integrity records and their original hashes must be preserved during migrations.

### 5. Investigation Reports

CyberFusion supports PDF investigation report generation.

The report workflow includes:

- Investigation and case information.
- Relevant evidence information.
- Integrity-related information.
- Report generation and download.
- SHA-256 report integrity verification.
- Private report storage.

---

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

Evidence and report objects are accessed through the backend using Supabase service-role credentials.

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

A new PostgreSQL deployment must have its schema provisioned using an appropriate PostgreSQL-compatible migration process before the backend is started.

**Important:** Existing scripts in `backend/app/db/migrations/` are SQLite-specific. They must not be executed against Supabase PostgreSQL.

---

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

Download tracked model files:

```powershell
git lfs pull
```

Verify the LFS-tracked files:

```powershell
git lfs ls-files
```

The following APK model file must contain the actual model rather than an LFS pointer:

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

Refer to the [Environment Configuration](#environment-configuration) section.

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

---

## Environment Configuration

### Backend Environment Variables

The backend uses environment variables for database connectivity, authentication, storage, and cryptographic signing.

Example configuration:

```env
# Application
PORT=8000

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

For production, the deployed frontend uses:

```env
VITE_API_BASE_URL=https://cyberfusion-backend.onrender.com
```

Vite embeds `VITE_` variables into the browser build.

Never put database credentials, Supabase service-role keys, JWT signing secrets, or private keys in frontend environment variables.

---

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

---

## Testing

### Backend Tests

From the `backend` directory, activate the virtual environment and execute:

```powershell
python -m pytest -v
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

---

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

The production backend is hosted on Render.

**Production URL:**

https://cyberfusion-backend.onrender.com

Configure the Render Web Service with the following settings:

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
- `GEMINI_API_KEY` (set as a secret in the Render environment)
- `GEMINI_MODEL=gemini-3.6-flash`
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

The production frontend is hosted on Vercel.

**Production URL:**

https://cyber-eight-mauve.vercel.app

**Login URL:**

https://cyber-eight-mauve.vercel.app/login

Configure the Vercel project with the following settings:

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Add the following production environment variable:

```env
VITE_API_BASE_URL=https://cyberfusion-backend.onrender.com
```

Redeploy the frontend after changing production environment variables.

### CORS Configuration

The backend must allow requests from the deployed Vercel frontend.

Set `CORS_ORIGINS` in Render to include the production frontend origin:

```env
CORS_ORIGINS=http://localhost:5173,https://cyber-eight-mauve.vercel.app
```

Use the exact deployed frontend origin, without an API path or trailing slash.

After changing the CORS configuration, redeploy or restart the backend.

---

## Production Verification

After deployment, verify the following components.

### 1. Frontend Availability

Open:

https://cyber-eight-mauve.vercel.app

Login page:

https://cyber-eight-mauve.vercel.app/login

Verify that the application loads and the login interface is accessible.

### 2. Backend Health Check

Open:

https://cyberfusion-backend.onrender.com/health

The backend should return a healthy status and module initialization information.

Expected lazy-loading behavior:

| Module | Expected Initial Status |
|---|---|
| Fake Email Detection | Loaded |
| Phishing URL Detection | Loaded |
| Fake Profile Detection | Loaded |
| Scam and Spam Detection | Loaded |
| APK Malware Analysis | Not loaded |
| Image Forgery Detection | Not loaded |
| Chat and Email Forensics | Loaded |
| Credit-Card Fraud Detection | Loaded |
| Network Intrusion Detection | Loaded |
| Server Log Analysis | Loaded |

APK Malware Analysis and Image Forgery Detection are initialized on their first corresponding analysis requests.

### 3. Authentication

- Test user registration.
- Test user login.
- Verify protected dashboard access.
- Verify authentication and authorization behavior.

### 4. Case Management

- Create an investigation case.
- View existing cases.
- Verify case-specific data and access controls.

### 5. Evidence Management

- Upload a test evidence file.
- Verify that the file is stored in Supabase Storage.
- Verify that evidence metadata is recorded in PostgreSQL.
- Verify SHA-256 hash generation.
- Test individual evidence integrity verification.
- Test case integrity-chain verification.

### 6. Investigation Reports

- Generate a PDF investigation report.
- Verify that the report is stored in the private report bucket.
- Download the report.
- Verify its SHA-256 integrity.

### 7. Machine-Learning Analysis

Test the individual cybersecurity analysis modules using harmless sample data.

For memory-intensive modules, monitor Render logs and memory usage during inference.

---

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
- Rotate any credentials that may have been exposed.

---

## Limitations

- Machine-learning detection results depend on model quality, training data, and input characteristics. They should not be treated as definitive proof of malicious activity.
- Git LFS model files must be downloaded and available before their corresponding analysis modules can operate.
- Render Free services have limited memory (512 MB) and may sleep after periods of inactivity.
- Lazy loading reduces startup memory consumption but does not guarantee that large-model inference will fit within the available memory.
- APK malware analysis and image-forgery detection may require a higher-memory hosting instance.
- Render Free services may experience cold-start delays after inactivity.
- Ephemeral hosting filesystems are not suitable for permanent evidence or report storage. CyberFusion uses Supabase Storage for durable cloud file storage.
- Database schema changes require an appropriate migration process. The application does not automatically migrate PostgreSQL databases at startup.
- Local SQLite migration scripts are not compatible with Supabase PostgreSQL.
- Detection results should be reviewed by an investigator and interpreted alongside other evidence.
- Cryptographic hash verification establishes consistency with recorded hash values; it does not independently establish the original authenticity or provenance of evidence.
- Cryptographic integrity chains are not blockchain and do not provide distributed-ledger consensus.

---

## License

This project is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.

---

**CyberFusion – AI Cybersecurity and Digital Forensics Platform**

Developed as a cybersecurity and digital-forensics engineering project.
