#!/usr/bin/env python3
"""Check that the Edge Function's copy of the flow engine is byte-identical to the browser copy.

North's flow engine lives in shared/flowEngine.js (used by Process Maps' simulator).
The flow-runner Edge Function ships its own copy at supabase/functions/flow-runner/flowEngine.js
because Supabase deploys each function folder on its own. The two must never drift.

Usage (from anywhere):  python "Claude outputs/2026-09-29-check-flow-engine-copy.py"
Exit code 0 = identical, 1 = different, 2 = a file is missing. Read-only: it never changes files.
"""
import hashlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'shared', 'flowEngine.js')
COPY = os.path.join(ROOT, 'supabase', 'functions', 'flow-runner', 'flowEngine.js')


def digest(path):
    with open(path, 'rb') as f:
        data = f.read()
    return data, hashlib.sha256(data).hexdigest()


def main():
    for p in (SRC, COPY):
        if not os.path.isfile(p):
            print('MISSING: ' + p)
            return 2
    a, ha = digest(SRC)
    b, hb = digest(COPY)
    if a == b:
        print('OK: flow engine copies are identical (sha256 %s, %d bytes)' % (ha[:16], len(a)))
        return 0
    first = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
    line = a[:first].count(b'\n') + 1
    print('DIFFERENT: %s (%d bytes, sha256 %s)' % (SRC, len(a), ha[:16]))
    print('       vs  %s (%d bytes, sha256 %s)' % (COPY, len(b), hb[:16]))
    print('First difference at byte %d (line %d). Copy shared/flowEngine.js over the function copy, '
          'then redeploy flow-runner.' % (first, line))
    return 1


if __name__ == '__main__':
    sys.exit(main())
