"""Protect the wiring that keeps failed checks and PR code away from VPS secrets."""
import json
import os
from pathlib import Path
import subprocess
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]


class QualityGateTests(unittest.TestCase):
    def setUp(self):
        self.deploy = yaml.safe_load((ROOT / '.github/workflows/deploy.yml').read_text())
        self.quality_text = (ROOT / '.github/workflows/quality.yml').read_text()
        self.quality = yaml.safe_load(self.quality_text)

    def test_deployment_requires_quality_checks_and_main(self):
        jobs = self.deploy['jobs']
        self.assertEqual(jobs['quality']['uses'], './.github/workflows/quality.yml')
        self.assertEqual(jobs['deploy']['needs'], 'quality')
        self.assertIn("github.ref == 'refs/heads/main'", jobs['deploy']['if'])
        self.assertNotIn('always()', jobs['deploy']['if'])
        self.assertNotIn('continue-on-error', jobs['deploy'])
        self.assertNotIn('secrets', jobs['quality'])

    def test_quality_checks_cannot_access_production_secrets_or_environment(self):
        self.assertNotIn('secrets.', self.quality_text)
        for job in self.quality['jobs'].values():
            self.assertNotIn('environment', job)
            self.assertNotIn('continue-on-error', job)

    def test_production_policy_is_verified_before_any_ssh_secret_is_loaded(self):
        steps = self.deploy['jobs']['deploy']['steps']
        policy = next(i for i, step in enumerate(steps) if step.get('run') == 'node ci/check-production-policy.mjs')
        ssh = next(i for i, step in enumerate(steps) if step.get('name') == 'Configure SSH')
        self.assertLess(policy, ssh)

    def test_vps_diagnostics_are_main_only(self):
        workflow = yaml.safe_load((ROOT / '.github/workflows/check-vps.yml').read_text())
        self.assertIn("github.ref == 'refs/heads/main'", workflow['jobs']['check']['if'])

    def test_gate_rejects_every_failure_cancellation_or_skip(self):
        gate = self.quality['jobs']['gate']
        dependencies = set(self.quality['jobs']) - {'gate'}
        self.assertEqual(set(gate['needs']), dependencies)
        script = gate['steps'][0]['run']
        for status in ['success', 'failure', 'cancelled', 'skipped']:
            with self.subTest(status=status):
                results = {name: {'result': 'success'} for name in dependencies}
                results[sorted(dependencies)[0]]['result'] = status
                result = subprocess.run(['bash', '-c', script],
                                        env={**os.environ, 'RESULTS': json.dumps(results)},
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, status == 'success', result.stderr)


if __name__ == '__main__':
    unittest.main()
