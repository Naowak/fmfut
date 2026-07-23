#!/usr/bin/env python3
"""Generate the polished V0.13.3 audit PDF from the canonical README."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "README.md"
OUTPUT = ROOT / "output" / "pdf" / "fmfut_audit_v0.13.3.pdf"

ORANGE = colors.HexColor("#E56F13")
INK = colors.HexColor("#211B17")
MUTED = colors.HexColor("#6F655D")
PAPER = colors.HexColor("#FBF7F0")
LINE = colors.HexColor("#DED3C5")
DARK = colors.HexColor("#30251F")


def inline_markup(value: str) -> str:
    value = html.escape(value.strip())
    value = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"\[([^]]+)]\(([^)]+)\)", r"<link href='\2' color='#B65008'>\1</link>", value)
    return value


def page_decoration(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(ORANGE)
        canvas.drawString(18 * mm, height - 11.5 * mm, "FMFUT - AUDIT V0.13.3")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(width - 18 * mm, 11 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=28, leading=31, textColor=INK, alignment=TA_CENTER, spaceAfter=8 * mm),
        "subtitle": ParagraphStyle("Subtitle", parent=base["Normal"], fontName="Helvetica", fontSize=12, leading=17, textColor=MUTED, alignment=TA_CENTER),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=INK, spaceBefore=7 * mm, spaceAfter=3 * mm, keepWithNext=True),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=ORANGE, spaceBefore=5 * mm, spaceAfter=2 * mm, keepWithNext=True),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13.2, textColor=INK, spaceAfter=2.4 * mm, alignment=TA_LEFT),
        "bullet": ParagraphStyle("Bullet", parent=base["BodyText"], fontName="Helvetica", fontSize=9, leading=12.5, leftIndent=5 * mm, firstLineIndent=-3.5 * mm, bulletIndent=1 * mm, textColor=INK, spaceAfter=1.2 * mm),
        "quote": ParagraphStyle("Quote", parent=base["BodyText"], fontName="Helvetica-Oblique", fontSize=9.5, leading=14, leftIndent=7 * mm, rightIndent=7 * mm, textColor=MUTED, borderColor=ORANGE, borderWidth=0, borderPadding=4 * mm, spaceAfter=4 * mm),
        "code": ParagraphStyle("Code", parent=base["Code"], fontName="Courier", fontSize=7.5, leading=10, leftIndent=4 * mm, rightIndent=4 * mm, textColor=colors.HexColor("#F9EDE2"), backColor=DARK, borderPadding=3 * mm, spaceBefore=1 * mm, spaceAfter=3 * mm),
        "table": ParagraphStyle("Table", parent=base["BodyText"], fontName="Helvetica", fontSize=7.2, leading=9, textColor=INK),
        "table_head": ParagraphStyle("TableHead", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.2, leading=9, textColor=colors.white),
    }


def table_story(rows: list[list[str]], styles):
    if not rows:
        return []
    width = 174 * mm
    columns = len(rows[0])
    col_widths = [width / columns] * columns
    data = []
    for row_index, row in enumerate(rows):
        style = styles["table_head"] if row_index == 0 else styles["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5EEE5")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Spacer(1, 1.5 * mm), table, Spacer(1, 3 * mm)]


def parse_markdown(text: str, styles):
    lines = text.splitlines()
    story = []
    paragraph: list[str] = []
    code: list[str] = []
    table: list[list[str]] = []
    in_code = False

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(paragraph)), styles["body"]))
            paragraph = []

    def flush_table():
        nonlocal table
        if table:
            cleaned = [row for index, row in enumerate(table) if not (index == 1 and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in row))]
            story.extend(table_story(cleaned, styles))
            table = []

    for line in lines:
        if line.startswith("```"):
            flush_paragraph()
            flush_table()
            if in_code:
                story.append(Paragraph("<br/>".join(html.escape(item) or " " for item in code), styles["code"]))
                code = []
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue
        if line.startswith("|") and line.endswith("|"):
            flush_paragraph()
            table.append([cell.strip() for cell in line.strip("|").split("|")])
            continue
        flush_table()
        if not line.strip():
            flush_paragraph()
            continue
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            flush_paragraph()
            title = line[3:].strip()
            story.append(Paragraph(inline_markup(title), styles["h1"]))
            continue
        if line.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[4:]), styles["h2"]))
            continue
        if line.startswith("> "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[2:]), styles["quote"]))
            continue
        bullet = re.match(r"^(?:- |\d+\. )(.*)$", line)
        if bullet:
            flush_paragraph()
            story.append(Paragraph(inline_markup(bullet.group(1)), styles["bullet"], bulletText="•"))
            continue
        if line.startswith("- ["):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[2:]), styles["bullet"], bulletText="□"))
            continue
        paragraph.append(line.strip())

    flush_paragraph()
    flush_table()
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    frame = Frame(18 * mm, 17 * mm, 174 * mm, 258 * mm, id="normal")
    template = PageTemplate(id="audit", frames=[frame], onPage=page_decoration)
    doc = BaseDocTemplate(str(OUTPUT), pagesize=A4, pageTemplates=[template], title="FMFUT - Audit V0.13.3", author="Projet FMFUT")

    cover = [
        Spacer(1, 52 * mm),
        Paragraph("FMFUT", styles["title"]),
        Paragraph("Audit technique, manuel et guide de reprise", styles["subtitle"]),
        Spacer(1, 9 * mm),
        Table([["VERSION", "0.13.3"], ["ÉTAT", "Prototype local validé"], ["AUDIT", "23 juillet 2026"]], colWidths=[35 * mm, 72 * mm], hAlign="CENTER", style=TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), ORANGE),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.white),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("TEXTCOLOR", (1, 0), (1, -1), INK),
            ("BACKGROUND", (1, 0), (1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), .5, LINE),
            ("PADDING", (0, 0), (-1, -1), 8),
        ])),
        Spacer(1, 18 * mm),
        Paragraph("Référence produit et technique destinée à une reprise du projet par une personne accompagnée d'un agent.", styles["subtitle"]),
        PageBreak(),
    ]
    story = cover + parse_markdown(SOURCE.read_text(encoding="utf-8"), styles)
    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
