"""Recovery tooling must reject remote selectors and fixture path traversal."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RecoverySafetyTests(unittest.TestCase):
    def test_a_remote_host_is_rejected_before_docker_is_called(self):
        result = subprocess.run(['bash', str(ROOT / 'ci/verify-recovery.sh')],
                                env={**os.environ, 'CI_POSTGRES_CONTAINER': '187.77.112.247'},
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not a remote host', result.stderr)

    def test_path_traversal_is_rejected_before_dump_or_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp = Path(directory)
            log = tmp / 'docker.log'
            fake = tmp / 'docker'
            fake.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_DOCKER_LOG"\nprintf "postgres:18\\n"\n')
            fake.chmod(0o755)
            files = tmp / 'files.txt'
            files.write_text('storage/app/public/recovery-ci/../../secret\n')
            result = subprocess.run(['bash', str(ROOT / 'ci/verify-recovery.sh')],
                                    env={**os.environ, 'PATH': f'{tmp}:{os.environ["PATH"]}',
                                         'CI_POSTGRES_CONTAINER': 'a' * 12,
                                         'CI_RECOVERY_FILES': str(files), 'TEST_DOCKER_LOG': str(log)},
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('dedicated test directories', result.stderr)
            calls = log.read_text()
            self.assertIn('--host=unix:///var/run/docker.sock inspect', calls)
            self.assertNotIn('exec', calls)
