import chalk from 'chalk';
import PromisePool from 'es6-promise-pool';
import minimist from 'minimist';
import os from 'os';
import util from 'util';
import DockerImage from './docker/image';
import { getAuthEndpoint, getAuthToken } from './docker/authentication';
import { loadYamlToJson, parseImageNames } from './dockerCompose';
import { remoteDigest } from './docker/remote';
import { dockerDigest, dockerPull, dockerRemoveImage, dockerSizeBytes, dockerInspect, dockerTagImage, dockerImageLayers } from './docker/local';
import { lpad } from './util/lpad';
import prettyBytes from './util/prettyBytes';
import { partial, flush } from './util/log';
import { DockerRefreshStats } from './stats';

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

/**
 * Using a docker slug. Checks to see if there is a different remote image and
 * pulls it down is nescesary.
 *
 * @param containerSlug
 */
async function pullIfNewer(containerSlug: string, index: number, total: number): Promise<DockerRefreshStats> {
  const logId = partial(util.format("%s %s", lpad(`[${index + 1}/${total}]`, 10), lpad(`Refreshing ${containerSlug}`, 70)));

  // Parse slug into a usable format.
  const image = DockerImage.from(containerSlug);

  // Get the authentication token for reading the remote repository.
  const authEndpoint = await getAuthEndpoint(image.registry);
  const authToken = await getAuthToken(authEndpoint, image);

  // Stats
  let addedBytes = 0;
  let removedBytes = 0;
  let bytesSteady = 0;
  let updated = false;

  // Check remote image against local.
  const digest = await remoteDigest(image, authToken);
  const inspect = await dockerInspect(image);

  if (!await compareDigests(digest, await dockerDigest(inspect))) {
    partial(util.format('%s\n', lpad(chalk.red('Out of Sync'), 25)), logId);

    // Remove previous image.
    removedBytes = await dockerSizeBytes(inspect);

    // track image layers + size

    let backupImage: DockerImage | null = null;
    if (removedBytes !== 0) {
      backupImage = DockerImage.from(`${image.fullImage}:backup`);
      partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Tagging backup image. ${image.fullImage}:${image.tag} -> ${backupImage.fullImage}:${backupImage.tag}\n`), logId);
      await dockerTagImage(image, 'backup');
    }

    // Pull latest image.
    partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Pulling new image. ${image.fullImage}:${image.tag}\n`), logId);
    flush(logId);
    await dockerPull(image);

    if (backupImage !== null) {
      console.log(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Removing old image. ${backupImage.fullImage}:${backupImage.tag}`));
      await dockerRemoveImage(backupImage);
    }

    // Track updated stats.
    const inspectUpdated = await dockerInspect(image);
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

  return new DockerRefreshStats(
    addedBytes,
    removedBytes,
    bytesSteady,
    (updated ? 1 : 0),
  );
}

function help(): void {
  console.log(`Help`);
  process.exit(1);
}

/**
 * Refreshes all image that are found in the specified docker-compose files.
 *
 * @param files
 */
async function refresh(files: string[]): Promise<void> {
  let containers: string[] = [];
  for (const file of files) {
    const yamlJson = loadYamlToJson(file);
    containers = containers.concat(parseImageNames(yamlJson));
  }

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
  const pool = new PromisePool<DockerRefreshStats>(promiseIterator as any,  os.cpus().length - 1);

  // Start the pool.
  const poolPromise = pool.start();

  (pool as any).addEventListener('fulfilled', (event: any) => {
    fullFilledCount++;
    stats.accumulate(event.data.result);

    if (allPromisesCreated && containers.length !== fullFilledCount) {
      console.log(`There are ${containers.length - fullFilledCount} refreshes processing.`);
    }
  });

  const errorMessages: string[] = [];
  (pool as any).addEventListener('rejected', (event: any) => {
    errorMessages.push(event.data.error.message)
  });

  // Wait for the pool to settle.
  poolPromise.then(() => {
    stats.logResults();
  });
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
      await refresh(files);
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
      default: { command: 'refresh' },
    });
    await whatCommand(args.command, args._);
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}
