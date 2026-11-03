# Ed25519 integrity checkpoints

New `CASE_CHAIN_V2` records receive an Ed25519-signed checkpoint in the same
SQLite transaction as the record and chain-head update. Checkpoints sign a
versioned, canonical JSON payload containing the chain ID, case ID, sequence,
head record hash, checkpoint version, and key ID. Existing legacy records and
unsigned V2 records remain verifiable under their existing rules and are not
rewritten.

## Generate an initial key pair

Run this in PowerShell with a protected directory outside the repository. It
writes an unencrypted PKCS8 private PEM, restricts permissions where supported,
and creates a separate JSON trust file containing the raw public key in Base64.
On Windows, use an ACL to restrict the private file and directory to the
service account; `chmod` does not replace Windows ACL management.

```powershell
python -c "from pathlib import Path; import base64,json; from cryptography.hazmat.primitives import serialization; from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; d=Path(r'C:\secure\cyberfusion'); d.mkdir(parents=True,exist_ok=True); k=Ed25519PrivateKey.generate(); (d/'integrity-private.pem').write_bytes(k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())); (d/'integrity-private.pem').chmod(0o600); p=k.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw); (d/'trusted-public-keys.json').write_text(json.dumps({'cyberfusion-ed25519-2026-01':base64.b64encode(p).decode('ascii')},indent=2),encoding='utf-8')"
```

Never put either file in the repository. Protect the private key with restrictive
filesystem ACLs and backups; never log or expose it. The trust file contains
public keys and must be protected against unauthorized replacement.

## Configure the backend

Set these variables in the backend process environment (or the existing
untracked backend `.env` file):

```powershell
$env:CYBERFUSION_INTEGRITY_PRIVATE_KEY_FILE = 'C:\secure\cyberfusion\integrity-private.pem'
$env:CYBERFUSION_INTEGRITY_KEY_ID = 'cyberfusion-ed25519-2026-01'
$env:CYBERFUSION_INTEGRITY_TRUSTED_PUBLIC_KEYS_FILE = 'C:\secure\cyberfusion\trusted-public-keys.json'
```

All paths must be absolute and outside the project repository. The active key ID
must exist in the trust file and its public key must match the configured private
key. New record creation fails with HTTP 503 when signing configuration is
missing or invalid; it never silently writes an unsigned new V2 record. Public
key verification of older signatures needs only the trusted-keys file.

## Apply the SQLite migration

Migrations are explicit commands; `init_db` does not run them automatically.
Back up the existing database, then from `backend` run:

```powershell
python -m app.db.migrations.v003_integrity_checkpoints --database .\cyberfusion.db
```

This additive migration creates `integrity_checkpoints`, adds the nullable
`checkpoint_start_sequence` to `integrity_chains`, adds uniqueness/indexes, and
records revision `v003_integrity_checkpoints`. It does not alter integrity
records. A chain's first newly signed sequence marks the start of its signed
range; prior V2 records are reported as historical unsigned records.

## Verification and key rotation

The existing local chain, evidence, and ownership checks remain in force.
Verification additionally reports checkpoint sequence/context/head mismatches,
missing checkpoints, unknown key IDs, invalid signatures, and historical
unsigned records. Each checkpoint records the signing key ID. To rotate keys:

1. Generate a new key pair and add the new key ID and public key to the trust
   JSON while retaining every public key needed for historical verification.
2. Deploy the new private-key path and set `CYBERFUSION_INTEGRITY_KEY_ID` to the
   new ID.
3. Keep the old public keys trusted; old checkpoints are verified with the key
   ID stored in each checkpoint. Do not rewrite historical signatures.

Signature status is separate from the existing local `chain_valid` fields.
`independently_anchored` is always false: a valid signature detects unauthorized
checkpoint modification only while the trusted public key is protected. Since
checkpoint signatures and the chain head are stored in the same SQLite database,
they do not reliably detect database rollback or deletion of the latest signed
tail. Independent append-only anchoring for rollback and deletion protection is
future work and is not implemented in this academic stage.
