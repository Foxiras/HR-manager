"""Проверки сборки до доступа к хостингу: ссылки, секреты, форма и JavaScript."""
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'

class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ['src', 'href']:
            if key in attrs:
                self.urls.append(attrs[key])

def check():
    for path in PUBLIC.rglob('*'):
        if path.is_symlink():
            raise ValueError('Symlinks are not allowed: ' + str(path))
        if not path.is_file():
            continue
        relative = path.relative_to(PUBLIC).as_posix()
        if not relative.startswith('assets/') and relative not in {'index.html','privacy.html','consent.html','robots.txt','sitemap.xml'}:
            raise ValueError('Unexpected public file: ' + relative)
        if path.suffix.lower() in {'.php','.pem','.key','.sql','.env','.zip','.gz'} or path.name.startswith('.'):
            raise ValueError('Server or secret file in public tree: ' + relative)
        if path.suffix in {'.html','.js','.css'}:
            text = path.read_text(encoding='utf-8')
            if re.search(r'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|pipedream\.net|Тест пройден:|preview-notice|fonts\.googleapis\.com|fonts\.gstatic\.com', text):
                raise ValueError('Test mode, external form/fonts or secret in ' + relative)
        if path.suffix == '.js':
            subprocess.run(['node','--check',str(path)],check=True)
        if path.suffix == '.html':
            parser = References()
            parser.feed(text)
            urls = parser.urls
        elif path.suffix == '.css':
            urls = [u.strip('"\'') for u in re.findall(r'url\(([^)]+)\)',text)]
        else:
            urls = []
        for url in urls:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc or not parsed.path or parsed.path.startswith('/api/'):
                continue
            target = (PUBLIC / unquote(parsed.path).lstrip('/')) if parsed.path.startswith('/') else (path.parent / unquote(parsed.path))
            target = target.resolve()
            if not target.is_relative_to(PUBLIC.resolve()) or not target.is_file():
                raise ValueError('Missing or escaping asset: ' + relative + ' -> ' + url)
    main = (PUBLIC / 'index.html').read_text(encoding='utf-8')
    for fragment in ['action="/api/request.php"','name="message"','name="website"','name="consent" value="yes"','name="consent_version" value="2026-10-21"','assets/js/request-form.js']:
        if fragment not in main:
            raise ValueError('Form contract missing: ' + fragment)
    print('PASS: static assets, JavaScript syntax, form contract and absence of secret/test files')

if __name__ == '__main__':
    check()
