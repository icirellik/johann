import util from 'util';
import chalk from 'chalk';
import DockerImage from './dockerImage';
import { getAuthEndpoint, getAuthToken } from './dockerAuth';
import { loadYamlToJson, parseImageNames } from './dockerCompose';
import { remoteDigest } from './dockerRemote';
import { dockerDigest, dockerPull, dockerRemoveImage, dockerSizeBytes } from './dockerLocal';
import { lpad } from './util/lpad';
import prettyBytes from './util/prettyBytes';

/**
 * Compares the remote and local docker digests, returning true if they are
 * equivalent.
 *
 * @param image
 * @param authToken
 */
async function compareDigests(image: DockerImage, authToken: string): Promise<boolean> {
  const digest = await remoteDigest(image, authToken);
  const locaDigest = await dockerDigest(image)
  return digest.length > 0 && locaDigest.length > 0 && digest === locaDigest;
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
}

async function pullIfNewer(containerSlug: string): Promise<DockerRefreshStats> {
  const image = DockerImage.from(containerSlug)
  const authRealm = await getAuthEndpoint(image);
  const authToken = await getAuthToken(authRealm, image);

  let addedBytes = 0;
  let removedBytes = 0;
  let bytesSteady = 0;
  let updated = false;
  if (!await compareDigests(image, authToken)) {
    process.stdout.write(util.format('%s\n', `${lpad(chalk.bgRed('Out of Sync'), 25)}`))
    removedBytes = await dockerSizeBytes(image);
    if (removedBytes !== 0) {
      console.log(chalk.cyan(`Removing old image. ${image.fullImage}:${image.tag}`));
      await dockerRemoveImage(image);
    }
    console.log(chalk.cyan(`Pulling new image. ${image.fullImage}:${image.tag}`));
    await dockerPull(image);
    addedBytes = await dockerSizeBytes(image);
    updated = true;
    console.log(
      'removed:', lpad(prettyBytes(removedBytes), 10),
      'added:', lpad(prettyBytes(addedBytes), 10),
      'delta:', prettyBytes(addedBytes - removedBytes)
    );
  } else {
    bytesSteady = await dockerSizeBytes(image);
    process.stdout.write(
      util.format('%s %s\n', `${lpad(chalk.bgGreen('In Sync'), 25)}`, lpad(prettyBytes(bytesSteady), 10))
    );
  }

  if (!await compareDigests(image, authToken)) {
    throw new Error('Failed to refresh image.');
  }

  return new DockerRefreshStats(
    addedBytes,
    removedBytes,
    bytesSteady,
    (updated ? 1 : 0),
  );
}

function help(): void {
  console.log(`Help`)
  process.exit(1)
}


async function commander(command: string, file: string): Promise<void> {
  const yamlJson = loadYamlToJson(file);
  const containers = parseImageNames(yamlJson);
  const stats = new DockerRefreshStats();
  switch (command) {
    case 'yaml':
      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        process.stdout.write(util.format("%s %s", lpad(`[${i + 1}/${containers.length}]`, 10), lpad(`Refreshing ${container}`, 70)));
        const currentStats = await pullIfNewer(container);
        stats.accumulate(currentStats);
      }
      console.log('Stats:');
      console.log('refreshed:', stats.imagesRefreshed);
      console.log(
        'added:', prettyBytes(stats.bytesAdded),
        'removed:', prettyBytes(stats.bytesRemoved),
        'delta:', prettyBytes(stats.bytesAdded - stats.bytesRemoved)
      );
      console.log('stable:', prettyBytes(stats.bytesSteady));
      console.log('total space used:', prettyBytes(stats.bytesSteady + stats.bytesAdded));
      break;
    default:
      help();
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv.length === 4) {
    await commander(argv[2], argv[3])
  } else {
    help()
  }
}

export async function run(): Promise<void> {
  try {
    await main(process.argv)
  } catch (err) {
    console.log(err)
  }
}
