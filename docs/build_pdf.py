#!/usr/bin/env python3
"""Build docs/ecp-manual.pdf from the five page documentation files."""

import os, re, markdown
from weasyprint import HTML, CSS

BASE = os.path.dirname(os.path.abspath(__file__))

PAGES = [
    ("Announce",       "announce.md"),
    ("Audio",          "audio.md"),
    ("Control Panel",  "control-panel.md"),
    ("Visuals",        "visuals.md"),
    ("Settings",       "settings.md"),
]

md = markdown.Markdown(extensions=["tables", "fenced_code", "attr_list"])

def convert(path):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    md.reset()
    # Convert blockquote tips/warnings (> **X:**) to styled divs
    src = re.sub(r'^> \*\*(Tip|Note|Warning|File size warning):\*\*', r'> **\1:**', src, flags=re.M)
    html = md.convert(src)
    # Wrap blockquotes that came from > lines
    return html

sections_html = ""
toc_entries = []

for title, fname in PAGES:
    anchor = title.lower().replace(" ", "-")
    toc_entries.append(f'<li><a href="#{anchor}">{title}</a></li>')
    body = convert(os.path.join(BASE, fname))
    sections_html += f'''
<section id="{anchor}" class="page-section">
  <div class="section-header">{title}</div>
  {body}
</section>
'''

toc_html = "<ul>" + "".join(toc_entries) + "</ul>"

FULL_HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Event Control Panel — Operator Manual</title>
</head>
<body>

<!-- Cover page -->
<div class="cover">
  <div class="cover-logo">ECP</div>
  <div class="cover-title">Event Control Panel</div>
  <div class="cover-subtitle">Operator Manual</div>
  <div class="cover-meta">MagmaLabs · github.com/MagmaSpeedCubes/event-control-panel</div>
</div>

<!-- TOC -->
<div class="toc-page">
  <h2 class="toc-heading">Contents</h2>
  {toc_html}
</div>

{sections_html}

</body>
</html>"""

CSS_SRC = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

@page {
  size: A4;
  margin: 22mm 20mm 22mm 20mm;
  @bottom-center {
    content: counter(page);
    font-family: 'Inter', sans-serif;
    font-size: 9pt;
    color: #888;
  }
}
@page :first { @bottom-center { content: none; } }

* { box-sizing: border-box; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.6;
  color: #1a1a1a;
}

/* ── Cover ── */
.cover {
  page-break-after: always;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 240mm;
  background: #0d0d10;
  color: #eee;
  border-radius: 6px;
  text-align: center;
  padding: 40px;
}
.cover-logo {
  font-family: 'JetBrains Mono', monospace;
  font-size: 52pt;
  font-weight: 700;
  color: #7055e5;
  letter-spacing: .06em;
  margin-bottom: 12px;
}
.cover-title {
  font-size: 24pt;
  font-weight: 700;
  letter-spacing: .04em;
  margin-bottom: 8px;
}
.cover-subtitle {
  font-size: 14pt;
  color: #aaa;
  margin-bottom: 32px;
}
.cover-meta {
  font-size: 9pt;
  color: #666;
  font-family: 'JetBrains Mono', monospace;
}

/* ── TOC ── */
.toc-page {
  page-break-after: always;
  padding-top: 12mm;
}
.toc-heading {
  font-size: 16pt;
  font-weight: 700;
  color: #111;
  border-bottom: 2px solid #7055e5;
  padding-bottom: 6px;
  margin-bottom: 16px;
}
.toc-page ul { list-style: none; padding: 0; margin: 0; }
.toc-page li {
  padding: 5px 0;
  border-bottom: 1px solid #eee;
  font-size: 11pt;
}
.toc-page a { color: #7055e5; text-decoration: none; font-weight: 600; }

/* ── Section pages ── */
.page-section { page-break-before: always; }

.section-header {
  font-size: 20pt;
  font-weight: 700;
  color: #7055e5;
  border-bottom: 3px solid #7055e5;
  padding-bottom: 6px;
  margin-bottom: 20px;
  letter-spacing: .02em;
}

/* ── Headings ── */
h1 { display: none; }
h2 {
  font-size: 13pt;
  font-weight: 700;
  color: #111;
  border-bottom: 1px solid #ddd;
  padding-bottom: 3px;
  margin-top: 18px;
  margin-bottom: 8px;
}
h3 {
  font-size: 11pt;
  font-weight: 700;
  color: #333;
  margin-top: 14px;
  margin-bottom: 6px;
}

/* ── Body text ── */
p { margin: 6px 0 10px; }
a { color: #7055e5; }

/* ── Tables ── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0 14px;
  font-size: 9.5pt;
}
thead { background: #f0f0f8; }
th {
  padding: 6px 10px;
  text-align: left;
  font-weight: 700;
  border-bottom: 2px solid #ccc;
  color: #222;
}
td {
  padding: 5px 10px;
  border-bottom: 1px solid #e8e8e8;
  vertical-align: top;
}
tr:nth-child(even) td { background: #fafafa; }

/* ── Code ── */
code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8.5pt;
  background: #f4f4f8;
  border: 1px solid #e0e0e8;
  border-radius: 3px;
  padding: 1px 5px;
  color: #5a35c0;
}
pre {
  background: #f4f4f8;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 8.5pt;
  overflow-x: auto;
}
pre code { background: none; border: none; padding: 0; }

/* ── Blockquotes ── */
blockquote {
  margin: 10px 0;
  padding: 8px 14px;
  border-left: 4px solid #7055e5;
  background: #f5f3ff;
  border-radius: 0 4px 4px 0;
  color: #333;
}
blockquote p { margin: 0; }

/* ── Lists ── */
ul, ol {
  padding-left: 20px;
  margin: 6px 0 10px;
}
li { margin-bottom: 4px; }

/* ── HR ── */
hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 16px 0;
}
"""

out_html = os.path.join(BASE, "ecp-manual.html")
out_pdf  = os.path.join(BASE, "ecp-manual.pdf")

with open(out_html, "w", encoding="utf-8") as f:
    f.write(FULL_HTML)

print("Rendering PDF…")
HTML(string=FULL_HTML, base_url=BASE).write_pdf(
    out_pdf,
    stylesheets=[CSS(string=CSS_SRC)],
)
print(f"✓ {out_pdf}")
