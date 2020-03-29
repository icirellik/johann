import crypto from 'crypto';
import util from 'util';
import lpad from '../util/lpad';
import DockerId from '../docker/image';

export default class ImageLayerStats {

  #layerHistorysUsageMap: Map<string, DockerId[]>;
  #roots: DockerId[];

  constructor() {
    this.#layerHistorysUsageMap = new Map<string, DockerId[]>();
    this.#roots = [];
  }

  accumulate(id: DockerId, layerDigests: string[]): void {
    let previousHash = '';
    for (let i = 0; i < layerDigests.length; i++) {
      const layerDigest = layerDigests[i];
      const hash = crypto.createHash('sha256')
        .update(previousHash, 'utf8')
        .update(layerDigest, 'utf8')
        .digest('hex');

      if (this.#layerHistorysUsageMap.has(hash)) {
        const usageMap = this.#layerHistorysUsageMap.get(hash);
        if (usageMap) {
          usageMap.push(id);
        }
      } else {
        if (previousHash.length === 0) {
          this.#roots.push(id);
        }
        this.#layerHistorysUsageMap.set(hash, [id]);
      }
      previousHash = hash;
    }
  }

  logResults(): void {
    let totalLayers = 0;
    let totalLayersReused = 0;
    for (const key of this.#layerHistorysUsageMap.keys()) {
      const layerHistoryUsage = this.#layerHistorysUsageMap.get(key);
      if (layerHistoryUsage && layerHistoryUsage.length > 1) {
        totalLayersReused += layerHistoryUsage.length;
        totalLayers += layerHistoryUsage.length;
      } else {
        totalLayers++;
      }
    }
    console.log('Unique Base Images:', this.#roots.length);
    console.log(util.format('%s %s %s',
      lpad(`Total layers    ${totalLayers}`, 22),
      lpad(`Shared layers   ${totalLayersReused}`, 22),
      lpad(`Reused ${Math.round((totalLayersReused / totalLayers) * 1000) / 10}%`, 15),
    ));
  }
}
