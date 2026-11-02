"""Собрать статический релиз с отдельным адресом ресурсов для каждого коммита."""
import io
import json
from pathlib import Path
import re
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]

def build(commit, target):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected full commit SHA')
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(str(target), 'w:gz') as archive:
        for path in sorted((ROOT / 'public').rglob('*')):
            if path.is_symlink():
                raise ValueError('Symlinks are not allowed')
            if not path.is_file():
                continue
            relative = path.relative_to(ROOT / 'public').as_posix()
            data = path.read_bytes()
            if relative.startswith('assets/'):
                relative = 'assets/releases/' + commit + '/' + relative[len('assets/'):]
            elif path.suffix == '.html':
                data = data.decode('utf-8').replace('assets/', 'assets/releases/' + commit + '/').encode('utf-8')
            info = tarfile.TarInfo('public/' + relative)
            info.size = len(data)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(data))
        data = json.dumps({'source_commit': commit}).encode()
        info = tarfile.TarInfo('public/release.json')
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))

if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
    print('Release archive prepared for ' + sys.argv[1])
