import { pathToFileURL } from 'node:url'

export function productionPolicyErrors(branch, environment, policies, sha) {
  const errors = []
  if (branch.name !== 'main' || branch.protected !== true) errors.push('main must be protected')
  if (!/^[a-f0-9]{40}$/.test(sha || '') || branch.commit?.sha !== sha) errors.push('deployment commit must equal current main')
  if (!environment.protection_rules?.some((rule) => rule.type === 'required_reviewers' && rule.reviewers?.length > 0)) errors.push('production must require reviewer approval')
  const policy = environment.deployment_branch_policy
  const selected = policies?.branch_policies
  const exactMain = selected?.length > 0 && (policies.total_count === undefined || policies.total_count === selected.length) && selected.every((rule) => rule.name === 'main' && (!rule.type || rule.type === 'branch'))
  const mainOnly = policy?.protected_branches === true || (policy?.custom_branch_policies === true && exactMain)
  if (!mainOnly) errors.push('production must restrict deployment branches to protected branches or main')
  return errors
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !process.env.GH_TOKEN) throw new Error('Repository authentication is unavailable; no SSH started.')
  const get = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`Cannot verify production protections (HTTP ${response.status}); no SSH started.`)
    return response.json()
  }
  const [branch, environment] = await Promise.all([get('branches/main'), get('environments/production')])
  const policies = environment.deployment_branch_policy?.custom_branch_policies ? await get('environments/production/deployment-branch-policies?per_page=100') : null
  const errors = productionPolicyErrors(branch, environment, policies, process.env.GITHUB_SHA)
  if (errors.length) throw new Error(`Production gate rejected: ${errors.join('; ')}. No SSH started.`)
  console.log('Production protections and current main commit verified. Required PR/Quality gate configuration must also be reviewed by the owner.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
