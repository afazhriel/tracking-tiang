"""Exercise deployment against disposable Git checkouts and fake services."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'vps.sh'


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vps-deploy-test-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'backend-checkout'
        self.front_repo = self.base / 'frontend-checkout'
        self.repo.mkdir()
        self.call_log = self.base / 'calls'
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.env = os.environ.copy()
        self.env.update(
            PATH=str(self.bin) + os.pathsep + self.env['PATH'],
            DEPLOY_REPO=str(self.repo),
            DEPLOY_FRONTEND=str(self.front_repo / 'frontend'),
            DEPLOY_BUILD_ROOT=str(self.base / 'builds'),
            DEPLOY_BACKUPS=str(self.base / 'backups'),
            CALL_LOG=str(self.call_log),
            TEST_FAIL_DB='0',
        )
        self.git(self.repo, 'init', '-b', 'main')
        self.git(self.repo, 'config', 'user.name', 'Deployment Test')
        self.git(self.repo, 'config', 'user.email', 'deploy-test@example.invalid')
        files = {
            '.gitignore': '.env\nstorage/\nvendor/\nnode_modules/\n.next/\n',
            'backend/app.php': 'github backend\n',
            'backend/Dockerfile': 'FROM scratch\n',
            'frontend/package.json': '{}\n',
            'frontend/app.js': 'github frontend\n',
            'docker-compose.yml': 'services: {}\n',
        }
        for name, text in files.items():
            file = self.repo / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(text)
        self.git(self.repo, 'add', '.')
        self.git(self.repo, 'commit', '-m', 'Canonical GitHub source')
        self.sha = self.git(self.repo, 'rev-parse', 'HEAD').strip()
        self.git(self.repo, 'remote', 'add', 'origin', str(self.repo))
        self.git(self.base, 'clone', str(self.repo), str(self.front_repo))
        for checkout in (self.repo, self.front_repo):
            (checkout / 'backend/storage').mkdir()
            (checkout / 'backend/.env').write_text('TEST_CONFIGURATION=keep\n')
            (checkout / 'backend/storage/upload.txt').write_text('keep upload\n')
            (checkout / 'backend/vendor').mkdir()
            (checkout / 'backend/vendor/dependency.txt').write_text('keep vendor\n')
        self.frontend = self.front_repo / 'frontend'
        (self.frontend / '.env').write_text('TEST_FRONTEND_CONFIGURATION=keep\n')
        (self.frontend / '.next').mkdir()
        (self.frontend / '.next/BUILD_ID').write_text('old build\n')
        (self.frontend / 'node_modules').mkdir()
        (self.frontend / 'node_modules/old.txt').write_text('old dependency\n')
        (self.repo / 'backend/app.php').write_text('local backend\n')
        (self.repo / 'backend/custom.php').write_text('local untracked code\n')
        (self.frontend / 'app.js').write_text('local frontend\n')
        (self.frontend / 'custom.js').write_text('local untracked page\n')
        (self.repo / 'unrelated-tool.txt').write_text('keep unrelated file\n')
        self.command('docker', '''
case "$*" in
  *pg_dump*)
    if [ "$TEST_FAIL_DB" = 1 ]; then exit 1; fi
    printf 'test database archive'
    ;;
  *pg_restore*) cat >/dev/null ;;
  inspect*) printf 'test-image-id\n' ;;
esac
''')
        self.command('npm', '''
if [ "$1" = ci ]; then mkdir -p node_modules; fi
if [ "$1" = run ]; then mkdir -p .next; printf 'new build\n' > .next/BUILD_ID; fi
''')
        self.command('systemctl', 'exit 0\n')
        self.command('curl', 'exit 0\n')
        self.command('rsync', 'exit 0\n')

    @staticmethod
    def git(directory, *args):
        return subprocess.run(
            ['git', '-C', str(directory), *args], check=True,
            capture_output=True, text=True,
        ).stdout

    def command(self, name, body):
        executable = self.bin / name
        executable.write_text('#!/bin/sh\nprintf "%s %s\\n" "' + name
                              + '" "$*" >> "$CALL_LOG"\n' + body)
        executable.chmod(0o755)

    def deploy(self, mode='--replace-vps'):
        return subprocess.run(
            ['bash', str(SCRIPT), self.sha, mode], env=self.env,
            capture_output=True, text=True,
        )

    def test_replacement_preserves_runtime_data_and_unrelated_files(self):
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.repo / 'backend/app.php').read_text(), 'github backend\n')
        self.assertEqual((self.frontend / 'app.js').read_text(), 'github frontend\n')
        self.assertFalse((self.repo / 'backend/custom.php').exists())
        self.assertFalse((self.frontend / 'custom.js').exists())
        for name in ('backend/.env', 'backend/storage/upload.txt',
                     'backend/vendor/dependency.txt', 'unrelated-tool.txt'):
            self.assertTrue((self.repo / name).exists(), name)
        self.assertTrue((self.frontend / '.env').exists())
        self.assertEqual((self.frontend / '.next/BUILD_ID').read_text(), 'new build\n')
        self.assertTrue(list((self.base / 'backups').glob('*/database.dump')))
        self.assertTrue(list((self.base / 'backups').glob('*/backend.tar.gz')))
        # A subsequent docs-only deployment must not rebuild or restart services.
        self.call_log.write_text('')
        result = self.deploy(mode='')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.call_log.read_text()
        self.assertNotIn('npm ', calls)
        self.assertNotIn('docker build', calls)
        self.assertNotIn('systemctl stop', calls)

    def test_failed_database_backup_does_not_replace_live_source(self):
        self.env['TEST_FAIL_DB'] = '1'
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.repo / 'backend/app.php').read_text(), 'local backend\n')
        self.assertEqual((self.frontend / 'app.js').read_text(), 'local frontend\n')
        self.assertTrue((self.repo / 'backend/custom.php').exists())
        self.assertNotIn('systemctl stop', self.call_log.read_text())

    def test_routine_deploy_rejects_manual_source_changes(self):
        result = self.deploy(mode='')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('local changes', result.stderr)
        self.assertFalse(self.call_log.exists())

    def test_ssh_bootstrap_preserves_payload_and_arguments(self):
        workflow = SCRIPT.parents[1] / '.github/workflows/deploy.yml'
        assignment = next(line.strip() for line in workflow.read_text().splitlines()
                          if line.strip().startswith('remote_command='))
        payload = self.base / 'payload.sh'
        payload.write_text('printf "ARGS %s %s\\n" "$1" "$2"\n'
                           'cat >/dev/null\necho ALL_COMMANDS_EXECUTED\n')
        result = subprocess.run(
            ['bash', '-c', assignment + '\n'
             'printf -v escaped_command "%q" "$remote_command"\n'
             'bash -c "bash -c $escaped_command -- abc --replace-vps" < "$1"',
             '--', str(payload)], capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('ARGS abc --replace-vps', result.stdout)
        self.assertIn('ALL_COMMANDS_EXECUTED', result.stdout)


if __name__ == '__main__':
    unittest.main()
