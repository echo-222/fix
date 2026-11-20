#!/usr/bin/env python3
"""说明书 PDF → 逐页图片 + 文字：python3 scripts/pdf-pages.py <pdf> <outdir> [--dpi 110] [--pages 1-12]

输出 <outdir>/p01.jpg … 和 <outdir>/text.md（每页可提取的文字）。读图做逐页转写，文字用来核对数字和原句。
未获授权的官方说明书放 manuals-src/<id>/（已 gitignore），不要放进 public/。
"""
import argparse
import pathlib
import sys

import fitz  # PyMuPDF

ap = argparse.ArgumentParser()
ap.add_argument('pdf')
ap.add_argument('outdir')
ap.add_argument('--dpi', type=int, default=110)
ap.add_argument('--pages', help='页码范围，例如 1-12 或 3,5,7（从 1 开始）')
a = ap.parse_args()

doc = fitz.open(a.pdf)
n = doc.page_count
if a.pages:
    picks = []
    for part in a.pages.split(','):
        lo, _, hi = part.partition('-')
        picks += range(int(lo), int(hi or lo) + 1)
    picks = [p for p in picks if 1 <= p <= n]
else:
    picks = list(range(1, n + 1))

out = pathlib.Path(a.outdir)
out.mkdir(parents=True, exist_ok=True)
width = len(str(n)) if n >= 100 else 2
text = [f'# {pathlib.Path(a.pdf).name} · {n} 页\n']
for p in picks:
    page = doc[p - 1]
    page.get_pixmap(dpi=a.dpi).save(out / f'p{p:0{width}d}.jpg', jpg_quality=82)
    body = page.get_text().strip()
    text.append(f'\n## 第 {p} 页\n\n{body or "（无可提取文字，看图）"}\n')
(out / 'text.md').write_text(''.join(text), encoding='utf-8')
print(f'{a.pdf}: {n} 页，导出 {len(picks)} 页 → {out}', file=sys.stderr)
