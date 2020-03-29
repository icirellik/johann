import crypto from 'crypto';
import util from 'util';
import { DockerImageHistory } from '../docker/local';
import DockerId from '../docker/image';
import lpad from '../util/lpad';
import unprettyBytes from '../util/unprettyBytes';

export default class ImageHistoryStats {

  // Hash to image history
  #imageHistorysMap: Map<string, DockerImageHistory>;

  // Hash to images using it.
  #imageHistorysUsageMap: Map<string, DockerId[]>;

  #serviceToHash: Map<string, string[]>;

  // Slug - History
  #imageHistory: Map<string, DockerImageHistory[]>;

  #roots: DockerImageHistory[];

  constructor() {
    this.#imageHistorysMap = new Map<string, DockerImageHistory>();
    this.#imageHistorysUsageMap = new Map<string, DockerId[]>();
    this.#roots = [];
    this.#serviceToHash = new Map<string, string[]>();
    this.#imageHistory = new  Map<string, DockerImageHistory[]>();
  }

  public get imageHistorysMap(): Map<string, DockerImageHistory> {
    return this.#imageHistorysMap;
  }

  public get imageHistorysUsageMap(): Map<string, DockerId[]> {
    return this.#imageHistorysUsageMap;
  }

  public get imageHistory(): Map<string, DockerImageHistory[]> {
    return this.#imageHistory;
  }

  public get serviceToHashes(): Map<string, string[]> {
    return this.#serviceToHash;
  }

  public get totalBytes(): number {
    let totalBytes = 0;
    for (const history of this.#imageHistorysMap.values()) {
      totalBytes += unprettyBytes(history.Size);
    }
    return totalBytes;
  }

  accumulate(id: DockerId, imageHistories: DockerImageHistory[]): void {
    let previousHash = '';
    for (let i = imageHistories.length - 1; i >= 0; i--) {
      const imageHistory = imageHistories[i];
      const hash = crypto.createHash('sha256')
        .update(previousHash, 'utf8')
        .update(imageHistory.CreatedBy, 'utf8')
        .update(imageHistory.CreatedAt, 'utf8')
        .update(imageHistory.Size, 'utf8')
        .digest('hex');

      if (this.#imageHistorysMap.has(hash)) {
        const usageMap = this.#imageHistorysUsageMap.get(hash);
        if (usageMap) {
          usageMap.push(id);
        }
      } else {
        if (previousHash.length === 0) {
          this.#roots.push(imageHistory);
        }
        this.#imageHistorysUsageMap.set(hash, [id]);
        this.#imageHistorysMap.set(hash, imageHistory);
      }

      const slug = `${id.fullImage}:${id.tag}`;
      if (this.#serviceToHash.has(slug)) {
        const history = this.#serviceToHash.get(slug);
        if (history) {
          history.push(hash);
        }
      } else {
        this.#serviceToHash.set(slug, [hash]);
      }

      if (this.#imageHistory.has(slug)) {
        const history = this.#imageHistory.get(slug);
        if (history) {
          history.push(imageHistory);
        }
      } else {
        this.#imageHistory.set(slug, [imageHistory]);
      }
      previousHash = hash;
    }
  }

  logResults(): void {
    let totalCommands = 0;
    let totalCommangesReused = 0;
    for (const key of this.#imageHistorysUsageMap.keys()) {
      const imageHistorysUsage = this.#imageHistorysUsageMap.get(key);
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

}
