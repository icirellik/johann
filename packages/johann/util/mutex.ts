type RESOLVE_CALLBACK = (...args: unknown[]) => void;

export default class Mutex {
  #locked = false;
  #interval = 100;
  #promise: Promise<void> | null = null;

  private poll(resolve: RESOLVE_CALLBACK, reject: unknown): void {
    if (!this.#locked) {
      resolve(this);
      return;
    }
    setTimeout(() => this.poll(resolve, reject), this.#interval);
  }

  public locked(): Promise<void> {
    if (this.#promise === null) {
      return Promise.resolve();
    }
    return this.#promise;
  }

  public lock(): Promise<void> {
    if (this.#promise !== null) {
      return this.#promise;
    }
    this.#locked = true;
    this.#promise = new Promise<void>((resolve, reject) => {
      this.poll(resolve, reject);
    });
    return Promise.resolve();
  }

  public unlock(): void {
    this.#locked = false;
    this.#promise = null;
  }

  public promise(): Mutex {
    return new Mutex();
  }
}
