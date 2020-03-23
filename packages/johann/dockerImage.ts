export const DEFAULT_REGISTRY = 'registry-1.docker.io';
export const DEFAULT_REGISTRY_SERVICE = `https://${DEFAULT_REGISTRY}`;

const DEFAULT_REPOSITORY = 'library';

export default class DockerImage {
  constructor(
    private _service: string | null,
    private _repository: string | null,
    private _image: string,
    private _tag = 'latest',
  ) { }

  public get registry(): string {
    return this._service ? `https://${this._service}` : DEFAULT_REGISTRY_SERVICE;
  }

  public get image(): string {
    return (this._repository) ?
      `${this._repository}/${this._image}` :
      `${DEFAULT_REPOSITORY}/${this._image}`
  }

  public get fullImage(): string {
    if (this.registry === DEFAULT_REGISTRY_SERVICE && this._repository) {
      return `${this._repository}/${this._image}`;
    } else if (this.registry === DEFAULT_REGISTRY_SERVICE) {
      return this._image;
    } else if (this._service && this._repository) {
      return `${this._service}/${this._repository}/${this._image}`;
    }
    return this._image;
  }

  public get tag(): string {
    return this._tag;
  }

  static from (containerSlug: string): DockerImage {
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

    return new DockerImage(
      registry,
      repository,
      image,
      !tag === null? 'latest' : tag,
    );
  }

  public toString(): string {
    let rv = '';
    rv += `Registry ${this.registry}\n`
    rv += `Image    ${this.image}\n`
    rv += `Tag      ${this.tag}\n`
    return rv;
  }
}
