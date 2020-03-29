import util from 'util';
import { Container } from './processor';
import DockerId from '../docker/image';
import { dockerInspect, dockerSizeBytes, dockerImageLayers, dockerImageHistory } from '../docker/local';
import ImageHistoryStats from '../stats/image-history-stats';
import ImageLayerStats from '../stats/layer-stats';
import lpad from '../util/lpad';
import highlightSize from '../util/highlight-size';
import prettyBytes from '../util/prettyBytes';
import unprettyBytes from '../util/unprettyBytes';

export default class RefreshReportOnly implements Container<void> {

  #imageHistoryStats = new ImageHistoryStats();
  #imageLayerStats = new ImageLayerStats();

  #imageLog = new Map<DockerId, string>();

  async process(containerSlug: string, index: number, total: number): Promise<void> {

    // Parse slug into a usable format.
    const id = DockerId.from(containerSlug);

    // Stats
    let bytesSteady = 0;

    // Check remote image against local.
    const inspect = await dockerInspect(id);

    bytesSteady = await dockerSizeBytes(inspect);
    this.#imageLog.set(id,
      util.format('%s %s %s',
        lpad(`[${index + 1}/${total}]`, 10),
        lpad(`Refreshing ${containerSlug}`, 70),
        lpad(highlightSize(bytesSteady), 20),
      )
    );

    const layers = dockerImageLayers(inspect);
    this.#imageLayerStats.accumulate(id, layers)

    const imageHistories = await dockerImageHistory(id);
    this.#imageHistoryStats.accumulate(id, imageHistories)
  }

  fulfilled(): void {
    // Fulfileld handler
  }

  error(): void {
    // Error handler
  }

  complete(): void {

    // 10, 70, 20, 20

    const tableWidth = 10 + 70 + 20 + 20;
    console.log('\nREPORT:')
    console.log(''.padEnd(tableWidth, '-'));
    console.log(util.format('%s %s %s %s',
      lpad('', 10),
      lpad('Image', 70),
      lpad('Virtual Size', 20),
      lpad('Reuse', 20),
    ));
    console.log(''.padEnd(tableWidth, '-'));
    for (const id of this.#imageLog.keys()) {
      const slug = `${id.fullImage}:${id.tag}`;
      const hashes = this.#imageHistoryStats.serviceToHashes.get(slug);
      if (hashes) {
        const bytes = hashes.reduce<number>((prev, cur) => {
          const usage = this.#imageHistoryStats.imageHistorysUsageMap.get(cur);
          if (usage && usage.length > 1) {
            const history = this.#imageHistoryStats.imageHistorysMap.get(cur);
            if (history) {
              return prev + unprettyBytes(history.Size);
            }
          }
          return prev + 0;
        }, 0);
        console.log(`${this.#imageLog.get(id)} ${lpad(highlightSize(bytes), 20)}`);
      }
    }

    console.log('\nIMAGE STATS:');
    console.log(''.padEnd(tableWidth, '-'));
    this.#imageLayerStats.logResults();
    this.#imageHistoryStats.logResults();

    console.log('\nDISK STATS:');
    console.log(''.padEnd(tableWidth, '-'));
    console.log('Total Real Size:    ', prettyBytes(this.#imageHistoryStats.totalBytes), '\n');
  }

}
