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
            DEPLOY_CONFIG='/dev/null',
            DEPLOY_FRONTEND=str(self.front_repo / 'frontend'),
            DEPLOY_BUILD_ROOT=str(self.base / 'builds'),
            DEPLOY_BACKUPS=str(self.base / 'backups'),
            CALL_LOG=str(self.call_log),
            TEST_FAIL_DB='0',
            TEST_FAIL_RESTORE='0',
            TEST_FAIL_MIGRATION='0',
            TEST_ALREADY_DOWN='0',
            TEST_BACKEND_RUNNING='true',
            TEST_HEALTH_FAILURE='',
            TEST_CORRUPT_ARCHIVE='0',
        )
        self.git(self.repo, 'init', '-b', 'main')
        self.git(self.repo, 'config', 'user.name', 'Deployment Test')
        self.git(self.repo, 'config', 'user.email', 'deploy-test@example.invalid')
        files = {
            '.gitignore': '.env\nstorage/\nvendor/\nnode_modules/\n.next/\n',
            'backend/app.php': 'github backend\n',
            'backend/Dockerfile': 'FROM scratch\n',
            'deploy/verify-production-backup.sh': SCRIPT.with_name('verify-production-backup.sh').read_text(),
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
  *" run --detach "*) printf '%064d\\n' 0 ;;
  *"pg_restore --exit-on-error"*) cat >/dev/null; if [ "$TEST_FAIL_RESTORE" = 1 ]; then echo PRIVATE_RESTORE_DETAIL >&2; exit 1; fi ;;
  *"SELECT count(*) FROM public.migrations"*) printf '21\\n' ;;
  *isDownForMaintenance*) [ "$TEST_ALREADY_DOWN" != 1 ] || exit 1 ;;
  *"php artisan migrate"*) [ "$TEST_FAIL_MIGRATION" != 1 ] || exit 1 ;;
  *pg_dump*)
    if [ "$TEST_FAIL_DB" = 1 ]; then exit 1; fi
    printf 'test database archive'
    ;;
  *pg_restore*) cat >/dev/null ;;
  *State.Running*) printf '%s\n' "$TEST_BACKEND_RUNNING" ;;
  inspect*) printf 'test-image-id\n' ;;
esac
''')
        self.command('npm', '''
if [ "$1" = ci ]; then mkdir -p node_modules; fi
if [ "$1" = run ]; then mkdir -p .next; printf 'new build\n' > .next/BUILD_ID; fi
''')
        self.command('systemctl', 'exit 0\n')
        self.command('curl', r'''
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    *) url="$1"; shift ;;
  esac
done
status=200
body='<html>Login</html>'
case "$url" in
  */api/regions/provinces) body='[]'; [ "$TEST_HEALTH_FAILURE" != html ] || body='<html>Fallback</html>' ;;
  */api/me) status=401; body='{"message":"Unauthenticated."}'; [ "$TEST_HEALTH_FAILURE" != auth ] || status=200 ;;
  */login) [ "$TEST_HEALTH_FAILURE" != redirect ] || status=302 ;;
esac
printf '%s' "$body" > "$output"
printf '%s' "$status"
''')
        self.command('rsync', 'exit 0\n')
        self.command('tar', '''
if [ "$TEST_CORRUPT_ARCHIVE" = 1 ]; then
  previous=''
  for argument in "$@"; do
    if [ "$previous" = -czf ]; then printf 'corrupt archive' > "$argument"; exit 0; fi
    previous="$argument"
  done
fi
exec /usr/bin/tar "$@"
''')

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
        self.assertFalse((self.repo / '.git/tracking-deploy-pending').exists())
        self.assertFalse(list((self.base / 'builds').glob('build.*')))
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
        calls = self.call_log.read_text()
        self.assertNotIn('systemctl stop', calls)
        self.assertIn('docker compose start backend', calls)
        self.assertIn('php artisan up', calls)
        self.assertFalse((self.repo / '.git/tracking-deploy-pending').exists())

    def test_failed_real_restore_resumes_old_backend_without_production_migration(self):
        self.env['TEST_FAIL_RESTORE'] = '1'
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.repo / 'backend/app.php').read_text(), 'local backend\n')
        calls = self.call_log.read_text()
        self.assertNotIn('php artisan migrate', calls)
        self.assertIn('docker compose start backend', calls)
        self.assertIn('php artisan up', calls)
        self.assertIn('rm --force --volumes', calls)
        self.assertFalse((self.repo / '.git/tracking-deploy-pending').exists())
        self.assertFalse(any((self.base / 'backups').glob('*/RESTORE_VERIFIED')))
        self.assertNotIn('PRIVATE_RESTORE_DETAIL', result.stderr + result.stdout)
        self.assertIn('PRIVATE_RESTORE_DETAIL', next((self.base / 'backups').glob('*/restore-private.log')).read_text())

    def test_corrupt_backup_invalidates_old_restore_marker_before_container_creation(self):
        self.assertEqual(self.deploy().returncode, 0)
        backup = next((self.base / 'backups').iterdir())
        self.assertTrue((backup / 'RESTORE_VERIFIED').is_file())
        (backup / 'database.dump').write_text('corrupted after previous verification')
        self.call_log.write_text('')
        result = subprocess.run(['bash', str(SCRIPT.with_name('verify-production-backup.sh')), str(backup)],
                                env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((backup / 'RESTORE_VERIFIED').exists())
        self.assertEqual(self.call_log.read_text(), '')

    def test_manifest_cannot_select_a_file_outside_the_backup(self):
        self.assertEqual(self.deploy().returncode, 0)
        backup = next((self.base / 'backups').iterdir())
        manifest = backup / 'SHA256SUMS'
        manifest.write_text(manifest.read_text().replace('database.dump', '../database.dump'))
        self.call_log.write_text('')
        result = subprocess.run(['bash', str(SCRIPT.with_name('verify-production-backup.sh')), str(backup)],
                                env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((backup / 'RESTORE_VERIFIED').exists())
        self.assertEqual(self.call_log.read_text(), '')

    def test_routine_deploy_rejects_manual_source_changes(self):
        result = self.deploy(mode='')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('local changes', result.stderr)
        self.assertFalse(self.call_log.exists())

    def test_standalone_backup_refuses_live_writes_and_accepts_a_drained_backend(self):
        backup_script = SCRIPT.with_name('backup-vps.sh')
        result = subprocess.run(['bash', str(backup_script)], env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('gracefully stopped', result.stderr)
        self.assertNotIn('pg_dump', self.call_log.read_text())
        self.env['TEST_BACKEND_RUNNING'] = 'false'
        result = subprocess.run(['bash', str(backup_script)], env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(list((self.base / 'backups').glob('*/database.dump')))
        self.assertTrue((self.repo / 'backend/storage/upload.txt').exists())

    def test_operator_maintenance_is_not_overridden(self):
        self.env['TEST_ALREADY_DOWN'] = '1'
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('php artisan up', self.call_log.read_text())
        self.assertFalse((self.repo / '.git/tracking-deploy-pending').exists())
        self.assertEqual((self.repo / 'backend/app.php').read_text(), 'local backend\n')

    def test_backup_occurs_after_http_drain_and_before_source_or_schema_change(self):
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.call_log.read_text()
        stop = calls.index('docker compose stop --timeout 120 backend')
        dump = calls.index('pg_dump')
        archive = calls.index('/backend.tar.gz')
        start = calls.index('docker compose up -d')
        migration = calls.index('php artisan migrate --force')
        resume = calls.index('php artisan up')
        self.assertLess(stop, dump)
        self.assertLess(stop, archive)
        self.assertLess(dump, start)
        self.assertLess(calls.index('pg_restore --exit-on-error'), start)
        self.assertIn('--network none --memory 1g --cpus 1', calls)
        self.assertIn('docker --host=unix:///var/run/docker.sock rm --force --volumes', calls)
        self.assertLess(archive, start)
        self.assertLess(migration, resume)
        self.assertLess(calls.index('npm run build'), calls.index('npm prune --omit=dev'))
        self.assertLess(calls.index('npm prune --omit=dev'), stop)
        self.assertIn('PGOPTIONS=-c lock_timeout=5s -c statement_timeout=300s', calls)
        backup = next((self.base / 'backups').iterdir())
        self.assertTrue((backup / 'COMPLETE').is_file())
        checksum = subprocess.run(['sha256sum', '--check', '--status', 'SHA256SUMS'], cwd=backup)
        self.assertEqual(checksum.returncode, 0)

    def test_corrupt_archives_stop_before_source_change_or_migration(self):
        self.env['TEST_CORRUPT_ARCHIVE'] = '1'
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.repo / 'backend/app.php').read_text(), 'local backend\n')
        self.assertNotIn('php artisan migrate', self.call_log.read_text())
        self.assertIn('php artisan up', self.call_log.read_text())
        self.assertFalse(any((self.base / 'backups').glob('*/COMPLETE')))

    def test_failed_migration_blocks_a_retry_before_any_service_or_database_calls(self):
        self.env['TEST_FAIL_MIGRATION'] = '1'
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        marker = self.repo / '.git/tracking-deploy-pending'
        self.assertTrue(marker.exists())
        stages = list((self.base / 'builds').glob('build.*'))
        self.assertEqual(len(stages), 1)
        self.assertTrue((stages[0] / 'frontend/.next/BUILD_ID').exists())
        calls = self.call_log.read_text()
        retry = self.deploy(mode='')
        self.assertNotEqual(retry.returncode, 0)
        self.assertIn('needs recovery review', retry.stderr)
        self.assertEqual(self.call_log.read_text(), calls)
        self.assertTrue((self.repo / 'backend/storage/upload.txt').exists())

    def assert_failed_health_preserves_recovery(self, failure):
        self.env['TEST_HEALTH_FAILURE'] = failure
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Health check failed', result.stderr)
        self.assertEqual((self.frontend / '.next/BUILD_ID').read_text(), 'old build\n')
        self.assertTrue((self.repo / '.git/tracking-deploy-pending').exists())
        self.assertTrue(list((self.base / 'builds').glob('*/failed-.next/BUILD_ID')))
        self.assertTrue((self.repo / 'backend/storage/upload.txt').exists())

    def test_health_rejects_html_in_place_of_regions_json(self):
        self.assert_failed_health_preserves_recovery('html')

    def test_health_rejects_an_unauthenticated_endpoint_returning_200(self):
        self.assert_failed_health_preserves_recovery('auth')

    def test_health_rejects_a_login_redirect_instead_of_the_actual_page(self):
        self.assert_failed_health_preserves_recovery('redirect')

    def test_vps_audit_ssh_command_uses_server_checkout(self):
        import yaml
        workflow = yaml.safe_load((SCRIPT.parents[1] / '.github/workflows/check-vps.yml').read_text())
        step = next(step for step in workflow['jobs']['check']['steps']
                    if step.get('name') == 'Read-only production configuration and data audit')
        assignment = next(line.strip() for line in step['run'].splitlines()
                          if line.strip().startswith('remote_command='))
        checkout = self.base / 'checkout-with-spaces'
        checkout.mkdir()
        target = self.base / 'audit-cwd'
        self.command('docker', 'pwd > "$TEST_CWD_FILE"\n')
        result = subprocess.run(['bash', '-c', assignment + '\n'
                                 'printf -v escaped_command "%q" "$remote_command"\n'
                                 'bash -c "bash -c $escaped_command" < /dev/null'],
                                env={**self.env, 'DEPLOY_REPO': str(checkout),
                                     'TEST_CWD_FILE': str(target)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(target.read_text().strip(), str(checkout))

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
