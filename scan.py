#!/usr/bin/env python3
"""Scan policy text; never print matching credential values."""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
PATTERN = re.compile(r'(?:gh[po]_|github_pat_|glpat-|sk-[A-Za-z0-9_-]{16,}|xox[abp]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|Bearer [A-Za-z0-9._-]{20,}|(?:access_token|refresh_token|api_key|password)[\"\x27]?\s*[:=]\s*[\"\x27]?[A-Za-z0-9/+_.-]{12,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})')

def main():
    if len(sys.argv) > 1:
        files = [pathlib.Path(p) for p in sys.argv[1:]]
    else:
        result = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], check=True, stdout=subprocess.PIPE)
        files = [ROOT / p.decode() for p in result.stdout.split(b'\0') if p]
    failed = False
    for path in files:
        if path.resolve() == pathlib.Path(__file__).resolve():
            continue
        if path.is_symlink():
            print(f'{path}: symbolic link refused', file=sys.stderr)
            failed = True
            continue
        if len(sys.argv) == 1 and not path.exists():
            continue  # Deleted tracked files contain no installable content.
        text = path.read_text(encoding='utf-8')
        for number, line in enumerate(text.splitlines(), 1):
            if PATTERN.search(line):
                print(f'{path}:{number}: possible secret', file=sys.stderr)
                failed = True
    return int(failed)

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, UnicodeError, subprocess.CalledProcessError):
        print('scan: unable to inspect all files', file=sys.stderr)
        sys.exit(2)
