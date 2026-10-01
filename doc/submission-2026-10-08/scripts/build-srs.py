#!/usr/bin/env python3
"""Build the English submission SRS from its editable Markdown source.

Requires reportlab. Run with the bundled Python or any Python with reportlab.
After building, render with pdftoppm and visually review every page.
"""
from pathlib import Path
import html
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, KeepTogether,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'SRS-SUBMISSION.md'
OUTPUT = ROOT / 'output/pdf/SRS-SUBMISSION-2026-10-08.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

# Embed actual glyphs instead of depending on PDF viewer base-font substitution.
font_dirs = [
    Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/share/fonts/truetype',
    Path('/usr/share/fonts/truetype/liberation2'),
    Path('/usr/share/fonts/truetype/liberation'),
    Path('/usr/share/fonts/liberation-sans'),
    Path('/usr/share/fonts/liberation'),
]
font_dir = next((p for p in font_dirs if (p/'LiberationSans-Regular.ttf').exists()
                 and (p/'LiberationSans-Bold.ttf').exists()), None)
if font_dir is None:
    raise RuntimeError('Liberation Sans Regular/Bold fonts required for embedded, portable PDF text')
pdfmetrics.registerFont(TTFont('SrsSans', str(font_dir/'LiberationSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('SrsSansBold', str(font_dir/'LiberationSans-Bold.ttf')))
pdfmetrics.registerFontFamily('SrsSans', normal='SrsSans', bold='SrsSansBold')

INK = colors.HexColor('#16324f')
GREEN = colors.HexColor('#047857')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle('SrsBody', fontName='SrsSans', fontSize=10,
    leading=15, spaceAfter=9, textColor=colors.HexColor('#243746')))
styles.add(ParagraphStyle('SrsTitle', fontName='SrsSansBold', fontSize=25,
    leading=31, spaceAfter=18, textColor=INK))
styles.add(ParagraphStyle('SrsHeading', fontName='SrsSansBold', fontSize=14,
    leading=20, spaceBefore=16, spaceAfter=9, textColor=GREEN, keepWithNext=True))
styles.add(ParagraphStyle('SrsCell', parent=styles['SrsBody'], fontSize=9,
    leading=13, spaceAfter=0))
styles.add(ParagraphStyle('SrsHeader', parent=styles['SrsCell'],
    fontName='SrsSansBold', textColor=colors.white))
styles.add(ParagraphStyle('SrsBullet', parent=styles['SrsBody'],
    leftIndent=12, firstLineIndent=-8))

def inline(text):
    text = text.replace('—', '-').replace('–', '-').replace('\u2011', '-')
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = html.escape(text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`([^`]+)`', r'<font name="Courier">\1</font>', text)
    return text

def add_table(lines):
    rows = [[part.strip() for part in row.strip().strip('|').split('|')]
            for row in lines]
    rows = [row for row in rows if not all(re.fullmatch(r':?-+:?', c) for c in row)]
    cells = [[Paragraph(inline(c), styles['SrsHeader' if i == 0 else 'SrsCell'])
              for c in row] for i, row in enumerate(rows)]
    table = LongTable(cells, colWidths=[23*mm, 151*mm], repeatRows=1,
                      hAlign='LEFT', splitByRow=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), INK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f2f7f6')]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, 0), .5, INK),
        ('LINEBELOW', (0, 1), (-1, -1), .25, colors.HexColor('#d8e2e9')),
    ]))
    return table

story = []
lines = SOURCE.read_text().splitlines()
i = 0
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    if line.startswith('|'):
        table_lines = []
        while i < len(lines) and lines[i].strip().startswith('|'):
            table_lines.append(lines[i]); i += 1
        story.extend([add_table(table_lines), Spacer(1, 8)])
        continue
    if line.startswith('# '):
        story.append(Paragraph(inline(line[2:]), styles['SrsTitle']))
    elif line.startswith('## '):
        story.append(Paragraph(inline(line[3:]), styles['SrsHeading']))
    elif line.startswith('- '):
        story.append(KeepTogether([Paragraph('- ' + inline(line[2:]), styles['SrsBullet'])]))
    else:
        paragraph = [line]
        while i+1 < len(lines) and lines[i+1].strip() and not lines[i+1].startswith(('#','|','- ')):
            i += 1; paragraph.append(lines[i].strip())
        story.append(KeepTogether([Paragraph(inline(' '.join(paragraph)), styles['SrsBody'])]))
    i += 1

def page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(GREEN)
    canvas.setLineWidth(2)
    canvas.line(18*mm, height-14*mm, width-18*mm, height-14*mm)
    canvas.setFont('SrsSans', 8)
    canvas.setFillColor(INK)
    canvas.drawString(18*mm, height-11*mm, '2NDHAND  |  Submission requirements  |  1 October 2026')
    canvas.setFillColor(colors.HexColor('#54657a'))
    canvas.drawString(18*mm, 12*mm, 'Selected scope - implementation / final acceptance pending')
    canvas.drawRightString(width-18*mm, 12*mm, str(doc.page))
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=18*mm,
    leftMargin=18*mm, topMargin=22*mm, bottomMargin=23*mm,
    title='2NDHAND - Submission SRS - 8 October 2026',
    author='2NDHAND project / Lead', pageCompression=1)
doc.build(story, onFirstPage=page, onLaterPages=page)
print(OUTPUT)
