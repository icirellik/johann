import chalk from 'chalk';
import util from 'util';
import { Container, ErrorEvent } from './processor';
import DockerId from '../docker/image';
import { getAuthEndpoint, getAuthToken } from '../docker/authentication';
import {
  dockerDigest,
  dockerImageHistory,
  dockerImageLayers,
  dockerInspect,
  DockerInspect,
  dockerPull,
  dockerRemoveImage,
  dockerSizeBytes,
  dockerTagImage,
} from '../docker/local';
import { remoteDigest } from '../docker/remote';
import { DockerRefreshStats } from '../stats/docker-refresh-stats';
import ImageHistoryStats from '../stats/image-history-stats';
import ImageLayerStats from '../stats/layer-stats';
import highlightSize from '../util/highlight-size';
import { partial, flush } from '../util/log';
import lpad from '../util/lpad';
import prettyBytes from '../util/prettyBytes';

/**
 *
 */
export interface RefreshOptions {
  dryRun: boolean;
}

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

export default class Refresh implements Container<DockerRefreshStats> {

  #imageHistoryStats = new ImageHistoryStats();
  #imageLayerStats = new ImageLayerStats();
  #refreshStats = new DockerRefreshStats();

  #dryRun: boolean;

  constructor(opts: RefreshOptions) {
    this.#dryRun = opts.dryRun;
  }

  /**
   * Using a docker slug. Checks to see if there is a different remote image and
   * pulls it down is nescesary.
   *
   * @param containerSlug
   */
  async process(containerSlug: string, index: number, total: number): Promise<DockerRefreshStats> {
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
        if (!this.#dryRun) {
          await dockerTagImage(id, 'backup');
        }
      }

      // Pull latest image.
      partial(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Pulling new image. ${id.fullImage}:${id.tag}\n`), logId);
      flush(logId);
      if (!this.#dryRun) {
        await dockerPull(id);
      }

      if (backupId !== null) {
        console.log(lpad(`[${index + 1}/${total}]`, 10) + ' ' + chalk.cyan(`Removing old image. ${backupId.fullImage}:${backupId.tag}`));
        if (!this.#dryRun) {
          await dockerRemoveImage(backupId);
        }
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
        if (!this.#dryRun) {
          throw new Error(`Failed to refresh image: ${containerSlug}.`);
        }
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
    this.#imageLayerStats.accumulate(id, layers)

    const imageHistories = await dockerImageHistory(id);
    this.#imageHistoryStats.accumulate(id, imageHistories)

    return new DockerRefreshStats(
      addedBytes,
      removedBytes,
      bytesSteady,
      (updated ? 1 : 0),
    );
  }

  fulfilled(result: DockerRefreshStats): void {
    this.#refreshStats.accumulate(result);
  }

  error(event: ErrorEvent, index: number, total: number): void {
    console.log(util.format('%s %s',
      lpad(`[${index + 1}/${total}]`, 10),
      chalk.red(event.message),
    ));
  }

  complete(): void {
    console.log('\nReport:');
    console.log('==========================================================');
    console.log('');
    this.#refreshStats.logResults();
    console.log('Total Real Size:    ', prettyBytes(this.#imageHistoryStats.totalBytes), '\n');
    this.#imageLayerStats.logResults();
    this.#imageHistoryStats.logResults();
  }

}
