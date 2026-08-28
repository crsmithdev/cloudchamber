#!/usr/bin/env python3
"""Regenerate ideas-v2.md from parts/ and stories/.

ideas-v2.md is a GENERATED file. Do not hand-edit it -- edit the story file
under stories/ and re-run this script.

    python3 build.py            # write ideas-v2.md
    python3 build.py --check    # verify the file on disk matches, exit 1 if not
"""
import glob, json, os, re, sys, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'ideas-v2.md')
SEP = '\n\n---\n\n'


def read_story(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n', raw, re.S)
    if not m:
        sys.exit('%s: missing front matter' % path)
    meta = {}
    for line in m.group(1).split('\n'):
        if not line.strip():
            continue
        k, _, v = line.partition(':')
        v = v.strip()
        meta[k.strip()] = json.loads(v) if v.startswith('"') else int(v)
    for k in ('number', 'heading', 'contents_cell', 'status'):
        if k not in meta:
            sys.exit('%s: front matter missing %r' % (path, k))
    meta['body'] = raw[m.end():].lstrip('\n').rstrip('\n')
    meta['path'] = path
    return meta


def build():
    stories = sorted((read_story(p) for p in
                      glob.glob(os.path.join(ROOT, 'stories', '*.md'))),
                     key=lambda s: s['number'])
    if not stories:
        sys.exit('no story files found under stories/')
    nums = [s['number'] for s in stories]
    if nums != list(range(1, len(nums) + 1)):
        sys.exit('story numbers are not a gapless 1..N sequence: %r' % nums)

    table = ['| # | Title | Status |', '| :-- | :-- | :-- |']
    table += ['| %d | %s | %s |' % (s['number'], s['contents_cell'], s['status'])
              for s in stories]

    front = open(os.path.join(ROOT, 'parts', '00-front-matter.md'),
                 encoding='utf-8').read().rstrip('\n')
    if '<!-- CONTENTS-TABLE -->' not in front:
        sys.exit('parts/00-front-matter.md: CONTENTS-TABLE marker missing')
    front = front.replace('<!-- CONTENTS-TABLE -->', '\n'.join(table), 1)

    slate = open(os.path.join(ROOT, 'parts', '99-slate-notes.md'),
                 encoding='utf-8').read().rstrip('\n')

    chunks = ['## %d. %s\n\n%s' % (s['number'], s['heading'], s['body'])
              for s in stories]

    return (front + '\n\n---\n\n# The stories\n\n---\n\n'
            + SEP.join(chunks) + '\n\n---\n\n' + slate + '\n')


if __name__ == '__main__':
    text = build()
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        a = hashlib.sha256(cur.encode()).hexdigest()
        b = hashlib.sha256(text.encode()).hexdigest()
        if a != b:
            print('MISMATCH\n  on disk   %s (%d bytes)\n  generated %s (%d bytes)'
                  % (a, len(cur.encode()), b, len(text.encode())))
            sys.exit(1)
        print('OK  ideas-v2.md matches the parts  %s' % b)
    else:
        open(OUT, 'w', encoding='utf-8').write(text)
        print('wrote ideas-v2.md  %d bytes  %s'
              % (len(text.encode()), hashlib.sha256(text.encode()).hexdigest()))
