import chalk from 'chalk';
import crypto from 'crypto';
import PromisePool from 'es6-promise-pool';
import minimist from 'minimist';
import os from 'os';
import util from 'util';
import DockerId from './docker/image';
import { getAuthEndpoint, getAuthToken } from './docker/authentication';
import { loadYamlToJson, parseImageNames } from './dockerCompose';
import { remoteDigest } from './docker/remote';
import {
  dockerDigest,
  dockerImageHistory,
  DockerImageHistory,
  dockerImageLayers,
  dockerInspect,
  DockerInspect,
  dockerPull,
  dockerRemoveImage,
  dockerSizeBytes,
  dockerTagImage,
} from './docker/local';
import { lpad } from './util/lpad';
import prettyBytes from './util/prettyBytes';
import { partial, flush } from './util/log';
import { DockerRefreshStats } from './stats';
import unprettyBytes from './util/unprettyBytes';

/**
 * Compares the remote and local docker digests, returning true if they are
 * equivalent.
 *
 * @param image
 * @param authToken
 */
async function compareDigests(digest: string, otherDigest: string): Promise<boolean> {
  return digest.length > 0 && otherDigest.length > 0 && digest === otherDigest;
}

/**
 * Pretty prints and highlights values based on their size.
 *
 * @param bytes The number of bytes.
 */
function highlightSize(bytes: number): string {
  if (bytes > 1000000000) {
    return chalk.bgRed(prettyBytes(bytes));
  } else if (bytes > 500000000) {
    return chalk.red(prettyBytes(bytes));
  } else if (bytes > 100000000) {
    return chalk.yellow(prettyBytes(bytes));
  } else {
    return chalk.green(prettyBytes(bytes));
  }
}

const imageHistorysMap = new Map<string, DockerImageHistory>();
const imageHistorysUsageMap = new Map<string, DockerId[]>();

function hashImageHistory(id: DockerId, imageHistories: DockerImageHistory[]): void {
  let previousHash = '';
  for (let i = imageHistories.length - 1; i >= 0; i--) {
    const imageHistory = imageHistories[i];
    const hash = crypto.createHash('sha256')
      .update(previousHash, 'utf8')
      .update(imageHistory.CreatedBy, 'utf8')
      .update(imageHistory.CreatedAt, 'utf8')
      .update(imageHistory.Size, 'utf8')
      .digest('hex');

    if (imageHistorysMap.has(hash)) {
      const usageMap = imageHistorysUsageMap.get(hash);
      if (usageMap) {
        usageMap.push(id);
      }
    } else {
      imageHistorysUsageMap.set(hash, [id]);
      imageHistorysMap.set(hash, imageHistory);
    }
    previousHash = hash;
  }
}

function logCommandStats(): void {
  let totalCommands = 0;
  let totalCommangesReused = 0;
  for (const key of imageHistorysUsageMap.keys()) {
    const imageHistorysUsage =imageHistorysUsageMap.get(key);
    if (imageHistorysUsage && imageHistorysUsage.length > 1) {
      totalCommangesReused += imageHistorysUsage.length;
      totalCommands += imageHistorysUsage.length;
    } else {
      totalCommands++;
    }
  }
  console.log(util.format('%s %s %s',
    lpad(`Total commands  ${totalCommands}`, 22),
    lpad(`Shared commands ${totalCommangesReused}`, 22),
    lpad(`Reused ${Math.round((totalCommangesReused / totalCommands) * 1000) / 10}%`, 15),
  ));
}

const layerHistorysUsageMap = new Map<string, DockerId[]>();

function hashLayerHistory(id: DockerId, layerDigests: string[]): void {
  let previousHash = '';
  for (let i = 0; i < layerDigests.length; i++) {
    const layerDigest = layerDigests[i];
    const hash = crypto.createHash('sha256')
      .update(previousHash, 'utf8')
      .update(layerDigest, 'utf8')
      .digest('hex');

    if (layerHistorysUsageMap.has(hash)) {
      const usageMap = layerHistorysUsageMap.get(hash);
      if (usageMap) {
        usageMap.push(id);
      }
    } else {
      layerHistorysUsageMap.set(hash, [id]);
    }
    previousHash = hash;
  }
}

function logLayerStats(): void {
  let totalLayers = 0;
  let totalLayersReused = 0;
  for (const key of layerHistorysUsageMap.keys()) {
    const layerHistoryUsage = layerHistorysUsageMap.get(key);
    if (layerHistoryUsage && layerHistoryUsage.length > 1) {
      totalLayersReused += layerHistoryUsage.length;
      totalLayers += layerHistoryUsage.length;
    } else {
      totalLayers++;
    }
  }
  console.log(util.format('%s %s %s',
    lpad(`Total layers    ${totalLayers}`, 22),
    lpad(`Shared layers   ${totalLayersReused}`, 22),
    lpad(`Reused ${Math.round((totalLayersReused / totalLayers) * 1000) / 10}%`, 15),
  ));
}

/**
 * Using a docker slug. Checks to see if there is a different remote image and
 * pulls it down is nescesary.
 *
 * @param containerSlug
 */
async function pullIfNewer(containerSlug: string, index: number, total: number): Promise<DockerRefreshStats> {
  const logId = partial(util.format("%s %s", lpad(`[${index + 1}/${total}]`, 10), lpad(`Refreshing ${containerSlug}`, 70)));

  // Parse slug into a usable format.
  const id = DockerId.from(containerSlug);

  // Get the authentication token for reading the remote repository.
  const authEndpoint = await getAuthEndpoint(id.registry);
  const authToken = await getAuthToken(authEndpoint, id);

  // Stats
  let addedBytes = 0;
  let removedBytes = 0;
  let bytesSteady = 0;
  let updated = false;

  // Check remote image against local.
  const digest = await remoteDigest(id, authToken);
  const inspect = await dockerInspect(id);
  let inspectUpdated: DockerInspect | null = null;
  if (!await compareDigests(digest, await dockerDigest(inspect))) {
    partial(util.format('%s\n', lpad(chalk.red('Out of Sync'), 25)), logId);

    // Remove previous image.
    removedBytes = await dockerSizeBytes(inspect);

    let backupId: DockerId | null = null;
    if (removedBytes !== 0) {
      backupId = DockerId.from(`${id.fullImage}:backup`);
      partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Tagging backup image. ${id.fullImage}:${id.tag} -> ${backupId.fullImage}:${backupId.tag}\n`), logId);
      await dockerTagImage(id, 'backup');
    }

    // Pull latest image.
    partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Pulling new image. ${id.fullImage}:${id.tag}\n`), logId);
    flush(logId);
    await dockerPull(id);

    if (backupId !== null) {
      console.log(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Removing old image. ${backupId.fullImage}:${backupId.tag}`));
      await dockerRemoveImage(backupId);
    }

    // Track updated stats.
    inspectUpdated = await dockerInspect(id);
    addedBytes = await dockerSizeBytes(inspectUpdated);
    updated = true;
    console.log(util.format('%s %s %s %s %s %s %s',
      lpad(`[${index + 1}/${total}]`, 10),
      'removed:', lpad(prettyBytes(removedBytes), 10),
      'added:', lpad(prettyBytes(addedBytes), 10),
      'delta:', prettyBytes(addedBytes - removedBytes),
    ));

    if (!await compareDigests(digest, await dockerDigest(inspectUpdated))) {
      throw new Error('Failed to refresh image.');
    }
  } else {
    bytesSteady = await dockerSizeBytes(inspect);
    partial(
      util.format('%s %s\n', lpad(chalk.greenBright('In Sync'), 25), lpad(highlightSize(bytesSteady), 10)),
      logId,
    );
    flush(logId);
  }

  const layers = dockerImageLayers(inspectUpdated ?? inspect);
  hashLayerHistory(id, layers)

  const imageHistories = await dockerImageHistory(id);
  hashImageHistory(id, imageHistories)

  return new DockerRefreshStats(
    addedBytes,
    removedBytes,
    bytesSteady,
    (updated ? 1 : 0),
  );
}

function help(): void {
  console.log('Usage:  johann [OPTIONS] [FILES]');
  console.log('');
  console.log('A self-sufficient tool for keeping docker-compose files syncronized.');
  console.log('');
  console.log('If no file is supplied johann will look for a docker-compose.yml in the local folder.');
  console.log('');
  console.log('  Options:');
  console.log('        --image string        The name of a single image to syncronize.');
  console.log('');
  process.exit(1);
}

/**
 * Refreshes all image that are found in the specified docker-compose files.
 *
 * @param files
 */
async function refresh(containers: string[]): Promise<void> {
  const stats = new DockerRefreshStats();
  let fullFilledCount = 0;
  let allPromisesCreated = false;
  function* promiseProducer(): Iterator<Promise<DockerRefreshStats>> {
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      yield pullIfNewer(container, i , containers.length);
    }
    if (fullFilledCount !== containers.length) {
      console.log(`There are still ${containers.length - fullFilledCount} refreshes outstanding.`);
    }
    allPromisesCreated = true;
  }

  // Create a pool.
  const promiseIterator = promiseProducer();
  const pool = new PromisePool<DockerRefreshStats>(promiseIterator as any, os.cpus().length - 1);

  // Start the pool.
  const poolPromise = pool.start();

  (pool as any).addEventListener('fulfilled', (event: any) => {
    fullFilledCount++;
    stats.accumulate(event.data.result);

    if (allPromisesCreated && containers.length - fullFilledCount > 0) {
      console.log(`There are still ${containers.length - fullFilledCount} refreshes outstanding.`);
    }
  });

  const errorMessages: string[] = [];
  (pool as any).addEventListener('rejected', (event: any) => {
    errorMessages.push(event.data.error.message)
  });

  // Wait for the pool to settle.
  poolPromise.then(() => {
    stats.logResults();
    let totalBytes = 0;
    for (const history of imageHistorysMap.values()) {
      totalBytes += unprettyBytes(history.Size);
    }
    console.log('Total Real Size:    ', prettyBytes(totalBytes), '\n');
    logLayerStats();
    logCommandStats();
  });
}

async function loadYaml(files: string[]): Promise<void> {
  try {
    let containers: string[] = [];
    for (const file of files) {
      const yamlJson = loadYamlToJson(file);
      containers = containers.concat(parseImageNames(yamlJson));
    }
    await refresh(containers.sort());
  } catch (err) {
    console.log(chalk.red(err.message));
    process.exit(1)
  }
}

/**
 * Determines which command will be executed.
 *
 * @param command
 * @param files
 */
async function whatCommand(command: string, files: string[]): Promise<void> {
  switch (command) {
    case 'refresh':
      await loadYaml(files);
      break;
    default:
      help();
  }
}

/**
 * Main entrypoint, all input here is raw and has yet to be parsed.
 */
export async function run(): Promise<void> {
  try {
    const args = minimist(process.argv.slice(2), {
      default: {
        command: 'refresh',
      },
    });
    if (args.help) {
      help();
    } else if (args.image) {
      refresh([args.image]);
    } else if (args._.length === 0) {
      whatCommand(args.command, ['docker-compose.yml']);
    } else {
      await whatCommand(args.command, args._);
    }
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}
