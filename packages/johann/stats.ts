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
