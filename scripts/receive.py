"""Ограниченный приёмник REG.RU. Совместим с Python 3.6 на хостинге."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tempfile
import time

BASE = Path('/var/www/u3690832/data')
SITE = BASE / 'www' / 'hc-capital.ru'
CONTROL = BASE / 'hc-deploy'
ROOT_FILES = {'index.html', 'privacy.html', 'consent.html', 'robots.txt', 'sitemap.xml', 'release.json'}
SUFFIXES = {'.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.txt'}
MAX_ARCHIVE = 40 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024

def command(value):
    match = re.fullmatch(r'deploy ([0-9a-f]{40}) ([0-9a-f]{64})', value)
    if not match:
        raise ValueError('Only the deployment command is allowed')
    return match.groups()

def allowed(name, commit):
    if '\\' in name or ':' in name or any(ord(c) < 32 for c in name):
        return False
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or path.as_posix() != name:
        return False
    if name in {'public/' + n for n in ROOT_FILES}:
        return True
    prefix = 'public/assets/releases/' + commit + '/'
    return name.startswith(prefix) and not any(p.startswith('.') for p in path.parts) and path.suffix.lower() in SUFFIXES

def extract(archive_path, destination, commit):
    seen = set()
    total = 0
    with tarfile.open(str(archive_path), 'r:gz') as archive:
        for index, member in enumerate(archive):
            if index >= 3000:
                raise ValueError('Too many files')
            if not member.isfile() or not allowed(member.name, commit) or member.name in seen:
                raise ValueError('Archive contains a forbidden path or file type')
            seen.add(member.name)
            total += member.size
            if total > MAX_EXPANDED:
                raise ValueError('Expanded archive too large')
            path = destination / member.name
            path.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, path.open('wb') as output:
                shutil.copyfileobj(source, output)
            os.chmod(str(path), 0o644)
    required = {'public/index.html', 'public/privacy.html', 'public/consent.html', 'public/release.json'}
    prefix = 'public/assets/releases/' + commit + '/'
    required.update(prefix + p for p in ['css/style.css','fonts/fonts.css','js/main.js','js/request-form.js','js/legal-docs.js'])
    if not required.issubset(seen):
        raise ValueError('Incomplete release')
    metadata = json.loads((destination / 'public' / 'release.json').read_text(encoding='utf-8'))
    if metadata.get('source_commit') != commit:
        raise ValueError('Release commit mismatch')

def same_tree(first, second):
    files = {p.relative_to(first).as_posix():p for p in first.rglob('*') if p.is_file()}
    other = {p.relative_to(second).as_posix():p for p in second.rglob('*') if p.is_file()}
    return set(files) == set(other) and all(not other[k].is_symlink() and files[k].read_bytes() == other[k].read_bytes() for k in files)

def atomic_copy(source, target):
    if target.is_symlink():
        raise ValueError('Destination must not be a symlink')
    fd, name = tempfile.mkstemp(prefix='.hc-deploy-', dir=str(target.parent))
    try:
        with os.fdopen(fd, 'wb') as output, source.open('rb') as data:
            shutil.copyfileobj(data, output)
        os.chmod(name, 0o644)
        os.replace(name, str(target))
    finally:
        if os.path.exists(name):
            os.unlink(name)

def publish(public, commit):
    if SITE.resolve() != SITE or SITE.is_symlink():
        raise ValueError('Unexpected document root')
    assets = SITE / 'assets' / 'releases'
    assets.mkdir(parents=True, exist_ok=True)
    if assets.resolve() != assets:
        raise ValueError('Unexpected assets directory')
    incoming = public / 'assets' / 'releases' / commit
    target = assets / commit
    if target.exists():
        if target.is_symlink() or not same_tree(incoming, target):
            raise ValueError('Commit assets already exist with different contents')
    else:
        for folder in incoming.rglob('*'):
            if folder.is_dir():
                os.chmod(str(folder), 0o755)
        os.chmod(str(incoming), 0o755)
        os.rename(str(incoming), str(target))
    backups = BASE / 'backups'
    backups.mkdir(mode=0o700, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='hc-capital-git-' + time.strftime('%Y%m%d-%H%M%S') + '-' + commit[:12] + '-', dir=str(backups)))
    previous = []
    for name in ROOT_FILES:
        path = SITE / name
        if path.is_symlink():
            raise ValueError('Unexpected root symlink')
        if path.is_file():
            shutil.copy2(str(path), str(backup / name))
            previous.append(name)
    changed = []
    try:
        # Ресурсы уже доступны по новому адресу; главную переключаем после документов.
        order = ['privacy.html','consent.html','robots.txt','sitemap.xml','index.html','release.json']
        for name in order:
            source = public / name
            if source.is_file():
                atomic_copy(source, SITE / name)
                changed.append(name)
    except Exception:
        for name in changed:
            if name in previous:
                atomic_copy(backup / name, SITE / name)
            elif (SITE / name).is_file():
                (SITE / name).unlink()
        raise
    (backup / 'deployment.json').write_text(json.dumps({'commit':commit,'previous_files':previous}), encoding='utf-8')
    return backup

def main():
    import fcntl
    commit, digest = command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    CONTROL.mkdir(mode=0o700, exist_ok=True)
    with (CONTROL / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with tempfile.TemporaryDirectory(prefix='incoming-', dir=str(CONTROL)) as temp:
            destination = Path(temp)
            archive = destination / 'release.tar.gz'
            sha = hashlib.sha256()
            length = 0
            with archive.open('wb') as output:
                while True:
                    chunk = sys.stdin.buffer.read(1024 * 1024)
                    if not chunk:
                        break
                    length += len(chunk)
                    if length > MAX_ARCHIVE:
                        raise ValueError('Archive too large')
                    sha.update(chunk)
                    output.write(chunk)
            if sha.hexdigest() != digest:
                raise ValueError('Archive checksum mismatch')
            extract(archive, destination, commit)
            backup = publish(destination / 'public', commit)
        result = {'ok':True,'source_commit':commit,'backup':str(backup)}
        with (CONTROL / 'deployments.jsonl').open('a') as log:
            log.write(json.dumps(result) + '\n')
        print(json.dumps(result))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Deployment refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
