import util from 'util';
import chalk from 'chalk';
import PromisePool from 'es6-promise-pool';
import DockerImage from './docker/image';
import { getAuthEndpoint, getAuthToken } from './docker/authentication';
import { loadYamlToJson, parseImageNames } from './dockerCompose';
import { remoteDigest } from './docker/remote';
import { dockerDigest, dockerPull, dockerRemoveImage, dockerSizeBytes, dockerInspect } from './docker/local';
import { lpad } from './util/lpad';
import prettyBytes from './util/prettyBytes';
import { partial, flush } from './util/log';

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

class DockerRefreshStats {
  constructor(
    public bytesAdded: number = 0,
    public bytesRemoved: number = 0,
    public bytesSteady: number = 0,
    public imagesRefreshed: number = 0
  ) { }

  public accumulate(stats: DockerRefreshStats): void {
    this.bytesAdded += stats.bytesAdded;
    this.bytesRemoved += stats.bytesRemoved;
    this.bytesSteady += stats.bytesSteady;
    this.imagesRefreshed += stats.imagesRefreshed;
  }

  public logResults(): void {
    console.log('Stats:');
    console.log('refreshed:', this.imagesRefreshed);
    console.log(
      'added:', prettyBytes(this.bytesAdded),
      'removed:', prettyBytes(this.bytesRemoved),
      'delta:', prettyBytes(this.bytesAdded - this.bytesRemoved)
    );
    console.log('stable:', prettyBytes(this.bytesSteady));
    console.log('total space used:', prettyBytes(this.bytesSteady + this.bytesAdded));
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
  const authEndpoint = await getAuthEndpoint(image);
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
    partial(util.format('%s\n', lpad(chalk.bgRed('Out of Sync'), 25)), logId);

    // Remove previous image.
    removedBytes = await dockerSizeBytes(inspect);
    if (removedBytes !== 0) {
      partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Removing old image. ${image.fullImage}:${image.tag}\n`), logId);
      await dockerRemoveImage(image);
    }

    // Pull latest image.
    partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Pulling new image. ${image.fullImage}:${image.tag}\n`), logId);
    flush(logId);
    await dockerPull(image);

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
      util.format('%s %s\n', lpad(chalk.bgGreen('In Sync'), 25), lpad(prettyBytes(bytesSteady), 10)),
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

async function yaml(file: string): Promise<void> {
  const yamlJson = loadYamlToJson(file);
  const containers = parseImageNames(yamlJson);
  const stats = new DockerRefreshStats();

  // for (let i = 0; i < containers.length; i++) {
  //   const container = containers[i];
  //   const currentStats = await pullIfNewer(container, i , containers.length);
  //   stats.accumulate(currentStats);
  // }
  // stats.logResults();

  const promiseProducer = function* (): Generator<unknown, Promise<DockerRefreshStats> | void> {
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      yield pullIfNewer(container, i , containers.length);
    }
  }

  // Create a pool.
  const promiseIterator = promiseProducer();
  const pool = new PromisePool<DockerRefreshStats>(promiseIterator as any, 4);

  // Start the pool.
  const poolPromise = pool.start();

  (pool as any).addEventListener('fulfilled', function (event: any) {
    stats.accumulate(event.data.result);
  })

  // Wait for the pool to settle.
  poolPromise.then(function () {
    stats.logResults();
  }, function (error) {
    console.log('Some promise rejected: ' + error.message);
  })
}

async function commander(command: string, file: string): Promise<void> {
  switch (command) {
    case 'yaml':
      await yaml(file);
      break;
    default:
      help();
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv.length === 4) {
    await commander(argv[2], argv[3])
  } else if (argv.length === 5) {
    await commander(argv[3], argv[4])
  } else {
    help();
  }
}

export async function run(): Promise<void> {
  try {
    await main(process.argv);
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}
