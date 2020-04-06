import prettyBytes from '../util/prettyBytes';

export class DockerRefreshStats {
  #bytesAdded: number;
  #bytesRemoved: number;
  #bytesSteady: number;
  #imagesRefreshed: number;

  constructor(
    bytesAdded = 0,
    bytesRemoved = 0,
    bytesSteady = 0,
    imagesRefreshed = 0
  ) {
    this.#bytesAdded = bytesAdded;
    this.#bytesRemoved = bytesRemoved;
    this.#bytesSteady = bytesSteady;
    this.#imagesRefreshed = imagesRefreshed;
  }

  public accumulate(stats: DockerRefreshStats): void {
    if (!stats) {
      return;
    }
    this.#bytesAdded += stats.bytesAdded;
    this.#bytesRemoved += stats.bytesRemoved;
    this.#bytesSteady += stats.bytesSteady;
    this.#imagesRefreshed += stats.imagesRefreshed;
  }

  public get bytesAdded(): number {
    return this.#bytesAdded;
  }

  public get bytesRemoved(): number {
    return this.#bytesRemoved;
  }

  public get bytesSteady(): number {
    return this.#bytesSteady;
  }

  public get imagesRefreshed(): number {
    return this.#imagesRefreshed;
  }

  public logResults(): void {
    console.log('Images Refreshed:', this.#imagesRefreshed);
    console.log('    added:', prettyBytes(this.#bytesAdded));
    console.log('  removed:', prettyBytes(this.#bytesRemoved));
    console.log('    delta:', prettyBytes(this.#bytesAdded - this.#bytesRemoved));
    console.log('');
    console.log('Stable Virtual Disk:', prettyBytes(this.#bytesSteady));
    console.log('Total Virtual Disk: ', prettyBytes(this.#bytesSteady + this.#bytesAdded));
    console.log('');
  }
}
