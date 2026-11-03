
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
    Float,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.db.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="INVESTIGATOR")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    cases = relationship("Case", back_populates="owner")
    reports = relationship("InvestigationReport", back_populates="investigator")
    findings = relationship("DetectionFinding", back_populates="investigator")


class RevokedAccessToken(Base):
    __tablename__ = "revoked_access_tokens"
    __table_args__ = (
        UniqueConstraint("jti", name="uq_revoked_access_tokens_jti"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    jti: Mapped[str] = mapped_column(String(128), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    case_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="OPEN")

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    owner = relationship("User", back_populates="cases")
    evidence_items = relationship("Evidence", back_populates="case")
    reports = relationship("InvestigationReport", back_populates="case")
    findings = relationship("DetectionFinding", back_populates="case")
    integrity_chain = relationship(
        "IntegrityChain",
        back_populates="case",
        uselist=False,
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    original_filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1000))
    media_type: Mapped[str | None] = mapped_column(String(150), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer)
    sha256_hash: Mapped[str] = mapped_column(String(64), index=True)
    # Supabase Storage metadata
    storage_bucket: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    storage_object_key: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    case = relationship("Case", back_populates="evidence_items")


class IntegrityChain(Base):
    __tablename__ = "integrity_chains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id"),
        unique=True,
        index=True,
    )
    head_sequence: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    head_record_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="GENESIS",
        server_default="GENESIS",
    )
    checkpoint_start_sequence: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    case = relationship("Case", back_populates="integrity_chain")
    records = relationship("IntegrityRecord", back_populates="chain")
    checkpoints = relationship("IntegrityCheckpoint", back_populates="chain")


class IntegrityRecord(Base):
    __tablename__ = "integrity_records"

    __table_args__ = (
        UniqueConstraint(
            "chain_id",
            "sequence_number",
            name="uq_integrity_records_chain_sequence",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidence.id"), index=True)

    sha256_hash: Mapped[str] = mapped_column(String(64))
    previous_record_hash: Mapped[str] = mapped_column(String(64))
    record_hash: Mapped[str] = mapped_column(String(64), unique=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    chain_id: Mapped[int | None] = mapped_column(
        ForeignKey("integrity_chains.id"),
        nullable=True,
        index=True,
    )
    sequence_number: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    hash_version: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    chain = relationship("IntegrityChain", back_populates="records")


class IntegrityCheckpoint(Base):
    __tablename__ = "integrity_checkpoints"
    __table_args__ = (
        UniqueConstraint(
            "chain_id",
            "sequence_number",
            name="uq_integrity_checkpoints_chain_sequence",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chain_id: Mapped[int] = mapped_column(
        ForeignKey("integrity_chains.id"),
        nullable=False,
        index=True,
    )
    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id"),
        nullable=False,
        index=True,
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    head_record_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    checkpoint_version: Mapped[str] = mapped_column(String(64), nullable=False)
    key_id: Mapped[str] = mapped_column(String(128), nullable=False)
    signature: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    chain = relationship("IntegrityChain", back_populates="checkpoints")


@event.listens_for(IntegrityCheckpoint, "before_update")
def _reject_integrity_checkpoint_update(mapper, connection, target):
    raise ValueError("Integrity checkpoints are append-only.")


@event.listens_for(IntegrityCheckpoint, "before_delete")
def _reject_integrity_checkpoint_delete(mapper, connection, target):
    raise ValueError("Integrity checkpoints are append-only.")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class InvestigationReport(Base):
    __tablename__ = "investigation_reports"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    report_number: Mapped[str] = mapped_column(
        String(50), unique=True, index=True
    )

    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id"), index=True
    )

    investigator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )

    report_path: Mapped[str] = mapped_column(String(1000))
    # Supabase Storage metadata
    storage_bucket: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    storage_object_key: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    file_sha256: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    case = relationship("Case", back_populates="reports")
    investigator = relationship("User", back_populates="reports")


class DetectionFinding(Base):
    __tablename__ = "detection_findings"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    case_id: Mapped[int] = mapped_column(
        ForeignKey("cases.id"), index=True
    )

    investigator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )

    module_name: Mapped[str] = mapped_column(String(100))

    input_summary: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    prediction: Mapped[str] = mapped_column(String(100))

    confidence_score: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    severity: Mapped[str] = mapped_column(String(20))

    analysis_details: Mapped[dict | list | None] = mapped_column(
        JSON, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    case = relationship("Case", back_populates="findings")
    investigator = relationship("User", back_populates="findings")
