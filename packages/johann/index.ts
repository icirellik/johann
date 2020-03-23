import DockerRepo from './dockerImage';
import { getAuthUrl, getAuthToken } from './dockerAuth';
import { loadYamlToJson, parseImageNames } from './dockerCompose';
import { remoteDigest } from './dockerRemote';
import { dockerDigest, dockerPull, dockerRemoveImage, dockerImageSize } from './dockerLocal';
import util from 'util';
import chalk from 'chalk';
import { lpad } from './util/lpad';

async function verifyDigests(image: DockerRepo, authToken: string): Promise<boolean> {
  const digest = await remoteDigest(image, authToken);
  const locaDigest = await dockerDigest(image)
  // console.log(' local: ', locaDigest);
  // console.log('remote: ', digest)

  return digest.length > 0 && locaDigest.length > 0 && digest === locaDigest;
}

async function pullIfNewer(containerSlug: string): Promise<void> {
  const image = DockerRepo.from(containerSlug)
  const authRealm = await getAuthUrl(image);
  const authToken = await getAuthToken(authRealm, image);

  if (!await verifyDigests(image, authToken)) {
    process.stdout.write(util.format('%s\n', `${lpad(chalk.bgRed('Out of Sync'), 25)}`))
    const oldSize = await dockerImageSize(image);
    if (oldSize !== '0B') {
      console.log(chalk.cyan(`Removing old image. ${image.fullImage}:${image.tag}`));
      await dockerRemoveImage(image);
    }
    console.log(chalk.cyan(`Pulling new image. ${image.fullImage}:${image.tag}`));
    await dockerPull(image);
    const newSize = await dockerImageSize(image);
    console.log('removed: ', lpad(oldSize, 10), 'added', lpad(newSize, 10))
  } else {
    const size = await dockerImageSize(image);
    process.stdout.write(util.format('%s %s\n', `${lpad(chalk.bgGreen('In Sync'), 25)}`, lpad(size, 10)))
  }

  if (!await verifyDigests(image, authToken)) {
    throw new Error('Failed to refresh image.')
  }
}

function help(): void {
  console.log(`Help`)
  process.exit(1)
}


async function commander(command: string, file: string): Promise<void> {
  const yamlJson = loadYamlToJson(file);
  const containers = parseImageNames(yamlJson);
  switch (command) {
    case 'yaml':
      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        process.stdout.write(util.format("%s %s", lpad(`[${i + 1}/${containers.length}]`, 10), lpad(`Refreshing ${container}`, 70)));
        await pullIfNewer(container);
      }
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
