import prettyBytes from './util/prettyBytes';

export class DockerRefreshStats {
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
    console.log('\nReport:');
    console.log('==========================================================');
    console.log('');
    console.log('Images Refreshed:', this.imagesRefreshed);
    console.log('    added:', prettyBytes(this.bytesAdded));
    console.log('  removed:', prettyBytes(this.bytesRemoved));
    console.log('    delta:', prettyBytes(this.bytesAdded - this.bytesRemoved));
    console.log('');
    console.log('Stable Virtual Disk:', prettyBytes(this.bytesSteady));
    console.log('Total Virtual Disk: ', prettyBytes(this.bytesSteady + this.bytesAdded));
    console.log('');
  }
}
