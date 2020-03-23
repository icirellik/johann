export const DEFAULT_REGISTRY = 'registry-1.docker.io';
export const DEFAULT_REGISTRY_SERVICE = `https://${DEFAULT_REGISTRY}`;

export default class DockerRepo {
  constructor(
    private _service: string | null,
    private _organization: string | null,
    private _image: string,
    private _tag = 'latest',
  ) { }

  public get registry(): string {
    return this._service ? `https://${this._service}` : DEFAULT_REGISTRY_SERVICE;
  }

  public get service(): string {
    return this._service ?? DEFAULT_REGISTRY;
  }

  public get image(): string {
    return (this._organization) ?
      `${this._organization}/${this._image}` :
      `library/${this._image}`
  }

  public get fullImage(): string {
    if (this.registry === DEFAULT_REGISTRY_SERVICE && this._organization) {
      return `${this._organization}/${this._image}`;
    } else if (this.registry === DEFAULT_REGISTRY_SERVICE) {
      return this._image;
    } else if (this._service && this._organization) {
      return `${this._service}/${this._organization}/${this._image}`;
    }
    return this._image;
  }

  public get tag(): string {
    return this._tag;
  }

  static from (slug: string): DockerRepo {
    const [ imageSlug, tag ] = slug.split(':');

    const slugParts = imageSlug.split('/')
    if (slugParts.length < 1) {
      throw new Error('Invalid slug')
    }

    const image = slugParts.pop()
    const organization = slugParts.pop() ?? null
    const registry = slugParts.pop() ?? null

    return new DockerRepo(
      registry,
      organization,
      image!,
      !tag === null? 'latest' : tag,
    );
  }

  public toString(): string {
    let rv = '';
    rv += `Registry ${this.registry}\n`
    rv += `Service  ${this.service}\n`
    rv += `Image    ${this.image}\n`
    rv += `Tag      ${this.tag}\n`
    return rv;
  }
}
