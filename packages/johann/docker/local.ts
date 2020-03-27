import { docker } from './cli';
import DockerId from './image';

export interface DockerInspect {
  RepoDigests: string[];
  RootFS: {
    Layers: string[];
  };
  Size: number;
}

export async function dockerInspect(id: DockerId): Promise<DockerInspect> {
  try {
    return JSON.parse(await docker(`inspect --format '{{ json . }}' ${id.fullImage}:${id.tag}`)) as DockerInspect;
  } catch {
    return {
      RepoDigests: [ '' ],
      RootFS: {
        Layers: [],
      },
      Size: 0,
    };
  }
}

export function dockerDigest(inspect: DockerInspect): string {
  // TODO: Verify all digests
  return inspect.RepoDigests[0].trim();
}

export function dockerSizeBytes(inspect: DockerInspect): number {
  return inspect.Size
}

export function dockerImageLayers(inspect: DockerInspect): string[] {
  return inspect.RootFS.Layers;
}

/**
 * Pulls a docker image from a remote repository.
 *
 * @param id
 */
export async function dockerPull(id: DockerId): Promise<void> {
  try {
    await docker(`pull ${id.fullImage}:${id.tag}`);
  } catch {
    throw new Error(`Failed to load 'pull' for ${id.fullImage}:${id.tag}`);
  }
}

/**
 *  Removes an image.
 *
 * @param id
 */
export async function dockerRemoveImage(id: DockerId): Promise<void> {
  try {
    await docker(`rmi ${id.fullImage}:${id.tag}`);
  } catch {
    throw new Error(`Failed to load 'rmi' for ${id.fullImage}:${id.tag}`);
  }
}

/**
 * Tags a docker image with another tag.
 *
 * @param id The current docker image.
 * @param tag The new tag name.
 */
export async function dockerTagImage(id: DockerId, tag: string): Promise<void> {
  try {
    await docker(`tag ${id.fullImage}:${id.tag} ${id.fullImage}:${tag}`);
  } catch {
    throw new Error(`Failed to load 'tag' for ${id.fullImage}:${id.tag}`);
  }
}

export interface DockerImage {
  Containers: string;
  CreatedAt: string;
  CreatedSince: string;
  Digest: string;
  ID: string;
  Repository: string;
  SharedSize: string;
  Size: string;
  Tag: string;
  UniqueSize: string;
  VirtualSize: string;
}

/**
 * Reads a single docker images metadata.
 *
 * @param id
 */
export async function dockerImage(id: DockerId): Promise<DockerImage> {
  try {
    const json = await docker(`image ls --format '{{ json . }}' ${id.fullImage}:${id.tag}`);
    return JSON.parse(json) as DockerImage;
  } catch {
    throw new Error(`Failed to load 'image ls' for ${id.fullImage}:${id.tag}`);
  }
}

export interface DockerImageHistory {
  Comment: string;
  CreatedAt: string;
  CreatedBy: string;
  CreatedSince: string;
  ID: string;
  Size: string;
}

/**
 * Reads the image history.
 *
 * @param id
 */
export async function dockerImageHistory(id: DockerId): Promise<DockerImageHistory[]> {
  try {
    const imageHistories = await docker(`history --format '{{ json . }}' ${id.fullImage}:${id.tag}`);
    const histories: DockerImageHistory[] = [];
    for (const imageHistory of imageHistories.split('\n')) {
      if (imageHistory.trim().length > 0 ) {
        histories.push(JSON.parse(imageHistory) as DockerImageHistory);
      }
    }
    return histories;
  } catch (e) {
    console.log(e)
    throw new Error(`Failed to load 'history' for ${id.fullImage}:${id.tag}`);
  }
}

export async function dockerImageSize(imageHistory: DockerImageHistory): Promise<string> {
  try {
    return imageHistory.Size.trim().length === 0 ? '0B' : imageHistory.Size.trim();
  } catch {
    return '0B';
  }
}
