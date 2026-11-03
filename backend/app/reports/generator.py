
import json
import uuid
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import (
    getSampleStyleSheet,
    ParagraphStyle,
)
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from sqlalchemy.orm import Session

from app.db.models import (
    Case,
    User,
    Evidence,
    IntegrityRecord,
    DetectionFinding,
)


# --------------------------------------------------
# REPORT STORAGE
# --------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPORTS_DIR = BACKEND_DIR / "storage" / "reports"


# --------------------------------------------------
# FORMATTING HELPERS
# --------------------------------------------------

def format_datetime(value):
    if not value:
        return "Not available"

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).strftime(
        "%d-%m-%Y %H:%M:%S UTC"
    )


def safe_text(value):
    """
    Escape special XML characters before adding
    user-provided text to a ReportLab Paragraph.
    """
    return escape(str(value or ""))


def format_hash(value, style):
    """
    Display hashes in readable chunks using
    a monospace font.
    """
    value = str(value or "")

    chunks = [
        value[index:index + 32]
        for index in range(0, len(value), 32)
    ]

    return Paragraph(
        "<br/>".join(chunks),
        style,
    )


# --------------------------------------------------
# EVIDENCE INTEGRITY VERIFICATION
# --------------------------------------------------

def verify_evidence_file(evidence):
    """
    Recalculate the evidence file's SHA-256 hash
    and compare it with the stored upload hash.
    """

    try:
        evidence_path = Path(
            evidence.storage_path
        ).resolve()

        evidence_root = (
            BACKEND_DIR / "storage" / "evidence"
        ).resolve()

        if not evidence_path.is_relative_to(evidence_root):
            return "INVALID STORAGE PATH"

        if not evidence_path.is_file():
            return "FILE NOT FOUND"

        calculated_hash = hashlib.sha256()

        with evidence_path.open("rb") as file:
            for chunk in iter(
                lambda: file.read(1024 * 1024),
                b"",
            ):
                calculated_hash.update(chunk)

        actual_hash = calculated_hash.hexdigest()

        if actual_hash == evidence.sha256_hash:
            return "VERIFIED"

        return "HASH MISMATCH"

    except OSError:
        return "VERIFICATION ERROR"


# --------------------------------------------------
# PDF GENERATION
# --------------------------------------------------

def generate_investigation_pdf(
    db: Session,
    case: Case,
    investigator: User,
    report_number: str,
):
    """
    Generate an investigation PDF using existing
    case, evidence and integrity-record data.
    """

    REPORTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    filename = f"{uuid.uuid4().hex}.pdf"
    report_path = REPORTS_DIR / filename

    styles = getSampleStyleSheet()

    # --------------------------------------------------
    # STYLES
    # --------------------------------------------------

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#2A0800"),
        fontSize=17,
        leading=21,
        spaceAfter=5,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["BodyText"],
        alignment=TA_CENTER,
        textColor=colors.grey,
        fontSize=9,
        leading=12,
    )

    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        textColor=colors.HexColor("#775144"),
        fontSize=11,
        leading=14,
        spaceBefore=7,
        spaceAfter=4,
    )

    normal_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        spaceAfter=2,
    )

    hash_style = ParagraphStyle(
        "HashStyle",
        parent=normal_style,
        fontName="Courier",
        fontSize=5.8,
        leading=7,
        splitLongWords=1,
    )

    analysis_details_style = ParagraphStyle(
        "AnalysisDetails",
        parent=normal_style,
        fontName="Courier",
        fontSize=7,
        leading=9,
        splitLongWords=1,
    )

    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Italic"],
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#555555"),
    )

    story = []

    # --------------------------------------------------
    # REPORT HEADER
    # --------------------------------------------------

    story.append(
        Paragraph("CYBERFUSION", title_style)
    )

    story.append(
        Paragraph(
            "AI Cybersecurity and Digital Forensics Platform",
            subtitle_style,
        )
    )

    story.append(Spacer(1, 4 * mm))

    story.append(
        Paragraph(
            "INVESTIGATION REPORT",
            title_style,
        )
    )

    story.append(Spacer(1, 3 * mm))

    # --------------------------------------------------
    # CASE DETAILS
    # --------------------------------------------------

    report_details = [
        ["Report Number", safe_text(report_number)],
        [
            "Generated On",
            format_datetime(datetime.now(timezone.utc)),
        ],
        ["Case Number", safe_text(case.case_number)],
        ["Case Title", safe_text(case.title)],
        ["Case Status", safe_text(case.status)],
        ["Investigator", safe_text(investigator.username)],
        ["Investigator Email", safe_text(investigator.email)],
        ["Case Created", format_datetime(case.created_at)],
    ]

    details_table = Table(
        report_details,
        colWidths=[45 * mm, 115 * mm],
    )

    details_table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (0, -1),
                colors.HexColor("#F2E9E7"),
            ),
            (
                "TEXTCOLOR",
                (0, 0),
                (0, -1),
                colors.HexColor("#2A0800"),
            ),
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.4,
                colors.lightgrey,
            ),
            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),
            (
                "FONTSIZE",
                (0, 0),
                (-1, -1),
                8,
            ),
            (
                "PADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
        ])
    )

    story.append(details_table)

    # --------------------------------------------------
    # CASE DESCRIPTION
    # --------------------------------------------------

    story.append(
        Paragraph(
            "1. Case Description",
            heading_style,
        )
    )

    description = (
        case.description
        or "No case description was provided."
    )

    story.append(
        Paragraph(
            safe_text(description),
            normal_style,
        )
    )

    # --------------------------------------------------
    # EVIDENCE DETAILS
    # --------------------------------------------------

    evidence_items = (
        db.query(Evidence)
        .filter(Evidence.case_id == case.id)
        .order_by(Evidence.id.asc())
        .all()
    )

    # Verify each evidence file once per report.
    verification_results = {
        evidence.id: verify_evidence_file(evidence)
        for evidence in evidence_items
    }

    story.append(
        Paragraph(
            "2. Evidence Details",
            heading_style,
        )
    )

    if evidence_items:

        evidence_data = [[
            "ID",
            "Filename",
            "Size (bytes)",
            "SHA-256",
            "File Check",
        ]]

        for evidence in evidence_items:

            evidence_data.append([
                str(evidence.id),

                Paragraph(
                    safe_text(evidence.original_filename),
                    normal_style,
                ),

                str(evidence.file_size),

                format_hash(
                    evidence.sha256_hash,
                    hash_style,
                ),

                verification_results[evidence.id],
            ])

        evidence_table = Table(
            evidence_data,
            colWidths=[
                9 * mm,
                39 * mm,
                19 * mm,
                56 * mm,
                30 * mm,
            ],
            repeatRows=1,
            hAlign="LEFT",
        )

        evidence_table.setStyle(
            TableStyle([
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.HexColor("#775144"),
                ),
                (
                    "TEXTCOLOR",
                    (0, 0),
                    (-1, 0),
                    colors.white,
                ),
                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.4,
                    colors.lightgrey,
                ),
                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "TOP",
                ),
                (
                    "FONTSIZE",
                    (0, 0),
                    (-1, -1),
                    6.5,
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    3,
                ),
            ])
        )

        story.append(evidence_table)

    else:

        story.append(
            Paragraph(
                "No evidence files are registered for this case.",
                normal_style,
            )
        )

    # --------------------------------------------------
    # INTEGRITY RECORDS
    # --------------------------------------------------

    story.append(
        Paragraph(
            "3. Integrity Records",
            heading_style,
        )
    )

    evidence_ids = [
        item.id
        for item in evidence_items
    ]

    integrity_records = []

    if evidence_ids:

        integrity_records = (
            db.query(IntegrityRecord)
            .filter(
                IntegrityRecord.evidence_id.in_(evidence_ids)
            )
            .order_by(IntegrityRecord.id.asc())
            .all()
        )

    if integrity_records:

        integrity_data = [[
            "Record ID",
            "Evidence ID",
            "Chain ID",
            "Sequence",
            "Format",
            "Previous Hash",
            "Record Hash",
            "Recorded At",
        ]]

        for record in integrity_records:

            integrity_data.append([
                str(record.id),

                str(record.evidence_id),

                (
                    str(record.chain_id)
                    if record.chain_id is not None
                    else "Legacy"
                ),

                (
                    str(record.sequence_number)
                    if record.sequence_number is not None
                    else "Legacy"
                ),

                record.hash_version or "Legacy",

                format_hash(
                    record.previous_record_hash,
                    hash_style,
                ),

                format_hash(
                    record.record_hash,
                    hash_style,
                ),

                format_datetime(record.recorded_at),
            ])

        integrity_table = Table(
            integrity_data,
            colWidths=[
                8 * mm,
                10 * mm,
                12 * mm,
                10 * mm,
                24 * mm,
                34 * mm,
                34 * mm,
                36 * mm,
            ],
            repeatRows=1,
            hAlign="LEFT",
        )

        integrity_table.setStyle(
            TableStyle([
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.HexColor("#775144"),
                ),
                (
                    "TEXTCOLOR",
                    (0, 0),
                    (-1, 0),
                    colors.white,
                ),
                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.4,
                    colors.lightgrey,
                ),
                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "TOP",
                ),
                (
                    "FONTSIZE",
                    (0, 0),
                    (-1, -1),
                    6.5,
                ),
                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    3,
                ),
            ])
        )

        story.append(integrity_table)

    else:

        story.append(
            Paragraph(
                "No integrity records are available for this case.",
                normal_style,
            )
        )

    # --------------------------------------------------
    # VERIFICATION SUMMARY
    # --------------------------------------------------

    story.append(
        Paragraph(
            "4. Verification Summary",
            heading_style,
        )
    )

    verified_count = sum(
        1
        for result in verification_results.values()
        if result == "VERIFIED"
    )

    total_evidence = len(evidence_items)

    unverified_count = total_evidence - verified_count

    summary_data = [
        ["Total Evidence Files", str(total_evidence)],
        ["Files Matching Stored SHA-256", str(verified_count)],
        ["Files Not Verified or Mismatched", str(unverified_count)],
        ["Integrity Records Found", str(len(integrity_records))],
    ]

    summary_table = Table(
        summary_data,
        colWidths=[75 * mm, 85 * mm],
    )

    summary_table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (0, -1),
                colors.HexColor("#F2E9E7"),
            ),
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.4,
                colors.lightgrey,
            ),
            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "MIDDLE",
            ),
            (
                "FONTSIZE",
                (0, 0),
                (-1, -1),
                8,
            ),
            (
                "PADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
        ])
    )

    story.append(summary_table)

    story.append(Spacer(1, 4 * mm))

    # --------------------------------------------------
    # AI DETECTION FINDINGS
    # --------------------------------------------------

    detection_findings = (
        db.query(DetectionFinding)
        .filter(DetectionFinding.case_id == case.id)
        .order_by(
            DetectionFinding.created_at.asc(),
            DetectionFinding.id.asc(),
        )
        .all()
    )

    story.append(
        Paragraph(
            "5. AI Detection Findings",
            heading_style,
        )
    )

    if detection_findings:
        for finding in detection_findings:
            story.append(
                Paragraph(
                    f"Finding {finding.id}: "
                    f"{safe_text(finding.module_name)}",
                    styles["Heading3"],
                )
            )

            confidence = (
                f"{finding.confidence_score:.4f}"
                if finding.confidence_score is not None
                else "Not available"
            )

            finding_fields = (
                ("Prediction", finding.prediction),
                ("Confidence", confidence),
                ("Severity", finding.severity),
                ("Timestamp", format_datetime(finding.created_at)),
            )

            for label, value in finding_fields:
                story.append(
                    Paragraph(
                        f"<b>{safe_text(label)}:</b> {safe_text(value)}",
                        normal_style,
                    )
                )

            if finding.analysis_details is None:
                details_text = "No additional analysis details."
            else:
                details_text = json.dumps(
                    finding.analysis_details,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )

            safe_details = "<br/>".join(
                "&#160;" * (len(line) - len(line.lstrip(" ")))
                + safe_text(line.lstrip(" "))
                for line in details_text.splitlines()
            )
            story.append(
                Paragraph(
                    f"<b>Analysis details:</b><br/>{safe_details}",
                    analysis_details_style,
                )
            )
            story.append(Spacer(1, 2 * mm))
    else:
        story.append(
            Paragraph(
                "No AI detection findings are saved for this case.",
                normal_style,
            )
        )

    story.append(Spacer(1, 4 * mm))

    # --------------------------------------------------
    # DISCLAIMER
    # --------------------------------------------------

    disclaimer = (
         "This report reflects information stored in the CyberFusion database "
         "at generation time. File checks reflect the verification performed "
         "during report generation. Integrity records alone do not prove that "
         "the complete integrity chain is valid. Saved AI detection findings "
         "linked to this case are included."
    )

    story.append(
        Paragraph(
            safe_text(disclaimer),
            disclaimer_style,
        )
    )

    # --------------------------------------------------
    # PAGE FOOTER
    # --------------------------------------------------

    def add_page_number(canvas, document):

        canvas.saveState()

        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)

        canvas.drawString(
            20 * mm,
            12 * mm,
            "CyberFusion Investigation Report",
        )

        canvas.drawRightString(
            A4[0] - 20 * mm,
            12 * mm,
            f"Page {document.page}",
        )

        canvas.restoreState()

    # --------------------------------------------------
    # BUILD PDF
    # --------------------------------------------------

    document = SimpleDocTemplate(
        str(report_path),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=15 * mm,
        bottomMargin=20 * mm,
        title=f"Investigation Report - {case.case_number}",
        author="CyberFusion",
    )

    document.build(
        story,
        onFirstPage=add_page_number,
        onLaterPages=add_page_number,
    )

    return str(report_path)
