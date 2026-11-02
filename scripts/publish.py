"""GitHub runner: ограниченная загрузка по SSH и внешняя проверка без писем."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def main():
    commit = os.environ['GITHUB_SHA']
    key = os.environ.get('DEPLOY_KEY','')
    if not key.strip():
        raise RuntimeError('Add repository Actions secret REGRU_SSH_KEY before deployment')
    archive = ROOT / 'outputs' / 'release.tar.gz'
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory() as temp:
        identity = Path(temp) / 'deploy_key'
        identity.write_text(key.rstrip() + '\n', encoding='utf-8')
        os.chmod(identity, 0o600)
        hosts = Path(temp) / 'known_hosts'
        hosts.write_text(os.environ['DEPLOY_KNOWN_HOSTS'] + '\n', encoding='utf-8')
        cmd = ['ssh','-i',str(identity),'-o','IdentitiesOnly=yes','-o','BatchMode=yes',
               '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(hosts),
               '-o','ConnectTimeout=20','u3690832@server91.hosting.reg.ru','deploy '+commit+' '+digest]
        with archive.open('rb') as source:
            result = subprocess.run(cmd,stdin=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
        if result.returncode:
            raise RuntimeError('SSH deployment failed: ' + result.stderr.decode(errors='replace')[-1500:])
        receipt = json.loads(result.stdout)
        if receipt.get('ok') is not True or receipt.get('source_commit') != commit:
            raise RuntimeError('Invalid deployment receipt')
        print('Installed commit ' + commit + '; server backup: ' + receipt['backup'])
    for host in ['hc-capital.ru','www.hc-capital.ru']:
        last = None
        for attempt in range(4):
            try:
                def get(path):
                    req = urllib.request.Request('https://'+host+path,headers={'Cache-Control':'no-cache','User-Agent':'HC-Capital-deploy-check'})
                    with urllib.request.urlopen(req,timeout=20) as response:
                        return response.read()
                release = json.loads(get('/release.json?verify='+commit))
                if release.get('source_commit') != commit:
                    raise RuntimeError('Published commit does not match')
                page = get('/?verify='+commit).decode('utf-8')
                if 'assets/releases/'+commit+'/' not in page:
                    raise RuntimeError('Homepage points to another release')
                data = json.loads(get('/api/request.php'))
                if data.get('ok') is not True:
                    raise RuntimeError('Form initialization failed')
                print('PASS: HTTPS homepage, commit and form initialization: ' + host)
                break
            except Exception as error:
                last = error
                if attempt == 3:
                    raise RuntimeError('Public verification failed for '+host+': '+str(last))
                time.sleep(3)
    print('Deployment verified. No production application or email sent.')

if __name__ == '__main__':
    main()
