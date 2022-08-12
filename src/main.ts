import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  buildRemoteRepoURL,
  generateNewVersion,
  getPackageJson,
  getSemverLabel,
  writePackageJson
} from './utils'
import {SEM_VERSIONS} from './constants'
import {createCommandManager, ICommandManager} from './command-manager'
import {GitCommandManager} from './git-command-manager'

async function run(): Promise<void> {
  const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN')
  const GITHUB_ACTOR = process.env.GITHUB_ACTOR || ''
  const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || ''
  const GITHUB_WORKSPACE = process.env['GITHUB_WORKSPACE'] || './'
  const {context} = github
  const pullRequest = context?.payload?.pull_request
  if (!pullRequest) return

  const labels: string[] =
    pullRequest?.labels.map((label) => label?.name.trim()) ?? []
  const semverLabel: string = getSemverLabel(labels)
  core.info(`semver ${semverLabel}`)
  if (!semverLabel) {
    core.setFailed(
      `❌ Invalid version labels, please provide one of these labels: ${SEM_VERSIONS.join(
        ', '
      )}`
    )
    return
  }
  const defaultBranch = pullRequest?.base.repo.default_branch
  core.debug(`Main branch: ${defaultBranch}`)
  const currentBranch = pullRequest?.head.ref
  core.debug(`Current branch: ${currentBranch}`)
  const commandManager: ICommandManager = createCommandManager(GITHUB_WORKSPACE)
  const gitCommandManager: GitCommandManager = new GitCommandManager(
    commandManager
  )
  await gitCommandManager.fetch()
  await gitCommandManager.checkout(currentBranch)
  const currentPkg = (await getPackageJson(GITHUB_WORKSPACE)) as any
  const currentBranchVersion = currentPkg.version
  await gitCommandManager.checkout(defaultBranch)
  const newVersion = generateNewVersion(semverLabel)
  core.info(`Current version: ${currentBranchVersion}`)
  core.info(`New version: ${newVersion}`)
  if (newVersion === currentBranchVersion) {
    core.info('✅ Version is already bumped! No action needed..')
    return
  }

  await gitCommandManager.checkout(currentBranch)
  currentPkg.version = newVersion
  writePackageJson(GITHUB_WORKSPACE, currentPkg)
  await gitCommandManager.setGithubUsernameAndPassword(GITHUB_ACTOR)
  const remoteRepo = buildRemoteRepoURL(
    GITHUB_ACTOR,
    GITHUB_TOKEN,
    GITHUB_REPOSITORY
  )
  await gitCommandManager.commit(`(chore): auto bump version to ${newVersion}`)
  core.info(`🔄 Pushing a new version to branch ${currentBranch}..`)
  await gitCommandManager.push(remoteRepo)
  core.info(`✅ Version bumped to ${newVersion} for this PR.`)
}

void run()
