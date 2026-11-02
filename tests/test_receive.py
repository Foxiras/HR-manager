import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import receive

SHA = 'a' * 40
PREFIX = 'public/assets/releases/' + SHA + '/'

def entries():
    return [('public/' + name, b'<html>test</html>') for name in ['index.html','privacy.html','consent.html']] + [
        ('public/release.json', json.dumps({'source_commit':SHA}).encode())] + [
        (PREFIX + name, b'test') for name in ['css/style.css','fonts/fonts.css','js/main.js','js/request-form.js','js/legal-docs.js']]

def archive(path, items):
    with tarfile.open(path, 'w:gz') as tar:
        for name, data in items:
            info = tarfile.TarInfo(name)
            if data is None:
                info.type = tarfile.SYMTYPE
                info.linkname = '/etc/passwd'
                tar.addfile(info)
            else:
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))

class ReceiverTests(unittest.TestCase):
    def test_command_rejects_arbitrary_shell(self):
        self.assertEqual(receive.command('deploy '+SHA+' '+'b'*64), (SHA,'b'*64))
        for command in ['pwd','scp -t public','deploy '+SHA+' '+'b'*64+'; id','deploy ../bad bad']:
            with self.subTest(command=command), self.assertRaises(ValueError):
                receive.command(command)

    def test_valid_archive_and_forbidden_entries(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive(root/'valid.tar.gz', entries())
            receive.extract(root/'valid.tar.gz', root/'valid', SHA)
            self.assertTrue((root/'valid/public/index.html').is_file())
            forbidden = [('../escape.txt', b'x'), ('public/api/request.php',b'<?php'),
                         (PREFIX+'config.php',b'<?php'),(PREFIX+'.htaccess',b'x'),
                         (PREFIX+'link.css',None),('public/index.html',b'duplicate')]
            for index, entry in enumerate(forbidden):
                with self.subTest(entry=entry):
                    target = root/('bad'+str(index)+'.tar.gz')
                    archive(target, entries()+[entry])
                    with self.assertRaises(ValueError):
                        receive.extract(target,root/('bad'+str(index)),SHA)
            self.assertFalse((root/'escape.txt').exists())

    def test_missing_files_and_wrong_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for index, values in enumerate([entries()[:-1], [(n,b'{}' if n=='public/release.json' else d) for n,d in entries()]]):
                archive(root/'input.tar.gz',values)
                with self.assertRaises(ValueError):
                    receive.extract(root/'input.tar.gz',root/str(index),SHA)

    def test_publish_preserves_api_and_config_and_can_repeat(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            site = base/'www/hc-capital.ru'
            site.mkdir(parents=True)
            (site/'api').mkdir()
            (site/'api/request.php').write_text('existing API')
            private = base/'hc-capital-private'
            private.mkdir()
            (private/'config.php').write_text('private settings')
            (site/'index.html').write_text('previous index')
            archive(base/'input.tar.gz',entries())
            with patch.object(receive,'BASE',base), patch.object(receive,'SITE',site):
                for index in range(2):
                    stage=base/('stage'+str(index))
                    receive.extract(base/'input.tar.gz',stage,SHA)
                    backup=receive.publish(stage/'public',SHA)
                    self.assertTrue((backup/'index.html').is_file())
            self.assertEqual((site/'api/request.php').read_text(),'existing API')
            self.assertEqual((private/'config.php').read_text(),'private settings')
            self.assertEqual(json.loads((site/'release.json').read_text())['source_commit'],SHA)

    def test_failed_switch_restores_previous_documents(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp).resolve(); site=base/'www/hc-capital.ru'
            site.mkdir(parents=True)
            for name in ['index.html','privacy.html','consent.html']:
                (site/name).write_text('previous '+name)
            archive(base/'input.tar.gz',entries())
            receive.extract(base/'input.tar.gz',base/'stage',SHA)
            original=receive.atomic_copy
            def fail_index(source,target):
                if source.parent == base/'stage/public' and target.name=='index.html':
                    raise OSError('Simulated failed switch')
                return original(source,target)
            with patch.object(receive,'BASE',base), patch.object(receive,'SITE',site), patch.object(receive,'atomic_copy',fail_index):
                with self.assertRaises(OSError):
                    receive.publish(base/'stage/public',SHA)
            for name in ['index.html','privacy.html','consent.html']:
                self.assertEqual((site/name).read_text(),'previous '+name)

if __name__=='__main__':
    unittest.main()
