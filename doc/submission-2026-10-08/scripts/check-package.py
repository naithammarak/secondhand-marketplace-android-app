#!/usr/bin/env python3
"""Validate the handoff packet; this does not test application behavior."""
from pathlib import Path
from datetime import datetime, timezone
import csv
import json
import re

ROOT = Path(__file__).resolve().parents[1]
errors = []
checked_links = 0
for source in ROOT.rglob('*.md'):
    content = source.read_text()
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', content):
        if target.startswith(('http://', 'https://', '#', 'mailto:')):
            continue
        target = target.split('#', 1)[0].strip('<>')
        if not target:
            continue
        checked_links += 1
        if not (source.parent / target).exists():
            errors.append(f'Missing link: {source.relative_to(ROOT)} -> {target}')

tasks = sorted((ROOT / 'tasks').glob('*.md'))
if len(tasks) != 14:
    errors.append(f'Expected 14 task files, found {len(tasks)}')
for i, source in enumerate(tasks):
    if not source.name.startswith(f'{i:02d}-'):
        errors.append(f'Task sequence mismatch: {source.name}')
    content = source.read_text()
    if 'Prompt สำหรับ Codex' not in content or '```text\n' not in content:
        errors.append(f'Missing copyable prompt: {source.name}')
    if 'submission-2026-10-08' not in content:
        errors.append(f'Missing context entry point: {source.name}')

for source in ROOT.rglob('*.json'):
    try:
        json.loads(source.read_text())
    except (ValueError, UnicodeError) as exc:
        errors.append(f'Invalid JSON: {source.relative_to(ROOT)} {exc}')

dependency_rows = json.loads((ROOT/'manifests/tasks.json').read_text())['tasks']
graph_errors_before = len(errors)
dependencies = {row['id']: row['depends_on'] for row in dependency_rows}
visited, visiting = set(), set()
def visit(task_id):
    if task_id in visiting:
        errors.append(f'Dependency cycle at task {task_id}')
        return
    if task_id in visited:
        return
    if task_id not in dependencies:
        errors.append(f'Unknown dependency task {task_id}')
        return
    visiting.add(task_id)
    for dep in dependencies[task_id]:
        visit(dep)
    visiting.remove(task_id)
    visited.add(task_id)
for row in dependency_rows:
    if not (ROOT/row['file']).is_file():
        errors.append(f'Missing dependency task file {row["file"]}')
    visit(row['id'])
if set(dependencies) != {f'{i:02d}' for i in range(14)}:
    errors.append('Dependency manifest must cover all task IDs 00..13')
graph_ok = len(errors) == graph_errors_before

rows = list(csv.DictReader((ROOT / 'requirements.csv').open(newline='')))
expected = {f'FR-{i:02d}' for i in range(1,50)} | {f'NFR-{i:02d}' for i in range(1,11)}
if len(rows) != 59 or {r['id'] for r in rows} != expected:
    errors.append('Requirements must contain each FR-01..49 and NFR-01..10 exactly once')
matrix = (ROOT / 'QA-MATRIX.md').read_text()
srs = (ROOT / 'SRS-SUBMISSION.md').read_text()
for row in rows:
    if row['id'] not in srs:
        errors.append(f'Requirement not mentioned in SRS: {row["id"]}')
    for case in filter(None, row['acceptance_cases'].split(';')):
        if f'| {case} |' not in matrix:
            errors.append(f'Unknown acceptance case: {row["id"]} -> {case}')
    if row['disposition'] != 'DEFERRED' and not row['acceptance_cases']:
        errors.append(f'Retained/revised requirement has no QA mapping: {row["id"]}')

result = {
    'checked_at_utc': datetime.now(timezone.utc).isoformat(),
    'scope_prepared_on': '2026-10-01',
    'scope': 'documentation validation only; no application acceptance',
    'task_files': len(tasks), 'dependency_graph': 'acyclic' if graph_ok else 'invalid',
    'requirements': len(rows),
    'qa_cases': len(re.findall(r'^\| Q\d\d \|', matrix, re.M)),
    'local_links_checked': checked_links,
    'errors': errors, 'result': 'PASS' if not errors else 'FAIL',
}
if result['qa_cases'] != 28:
    errors.append('QA matrix must contain Q01..Q28')
    result['result'] = 'FAIL'
(ROOT / 'reports').mkdir(exist_ok=True)
(ROOT / 'reports/00-package-validation.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
