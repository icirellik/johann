const DEFAULT_REGISTRY = 'registry-1.docker.io';
const DEFAULT_REGISTRY_SERVICE = `https://${DEFAULT_REGISTRY}`;

const DEFAULT_REPOSITORY = 'library';

export default class DockerId {
  private _service: string;
  private _repository: string;

  constructor(
    service: string | null,
    repository: string | null,
    private _image: string,
    private _tag = 'latest',
  ) {
    this._service = service ?? DEFAULT_REGISTRY;
    this._repository = repository ?? DEFAULT_REPOSITORY;
  }

  public get registry(): string {
    return `https://${this._service}`;
  }

  public get service(): string {
    return this._service;
  }

  public get repository(): string {
    return this._repository;
  }

  public get image(): string {
    return this._image;
  }

  public get tag(): string {
    return this._tag;
  }

  public get fullImage(): string {
    if (this.registry === DEFAULT_REGISTRY_SERVICE && this._repository && this._repository !== DEFAULT_REPOSITORY) {
      return `${this._repository}/${this._image}`;
    } else if (this.registry === DEFAULT_REGISTRY_SERVICE) {
      return this._image;
    } else if (this._service && this._repository) {
      return `${this._service}/${this._repository}/${this._image}`;
    }
    // TODO: May be dead code.
    return this._image;
  }

  static from (containerSlug: string): DockerId {
    const [ imageSlug, tag ] = containerSlug.split(':');

    const slugParts = imageSlug.split('/')
    if (slugParts.length < 1) {
      throw new Error('Invalid slug')
    }

    const image = slugParts.pop()
    const repository = slugParts.pop() ?? null
    const registry = slugParts.pop() ?? null

    if (!image) {
      throw new Error(`The image name could not be parsed. ${containerSlug}`);
    }

    return new DockerId(
      registry,
      repository,
      image,
      !tag === null? 'latest' : tag,
    );
  }

  public toString(): string {
    let rv = '';
    rv += `Registry   ${this.registry}\n`
    rv += `Repository ${this.repository}\n`
    rv += `Image      ${this.image}\n`
    rv += `Tag        ${this.tag}\n`
    return rv;
  }
}
