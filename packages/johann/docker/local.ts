import { docker } from './cli';
import DockerImage from './image';

interface DockerInspect {
  RepoDigests: string[];
  RootFS: {
    Layers: string[];
  };
  Size: number;
}

export async function dockerInspect(image: DockerImage): Promise<DockerInspect> {
  try {
    // TODO: Remove casting
    return JSON.parse(await docker(`inspect --format "{{json .}}" ${image.fullImage}:${image.tag}`)) as DockerInspect;
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

export async function dockerPull(image: DockerImage): Promise<void> {
  await docker(`pull ${image.fullImage}:${image.tag}`, {
    echo: false,
  });
}

export async function dockerRemoveImage(image: DockerImage): Promise<void> {
  try {
    await docker(`rmi ${image.fullImage}:${image.tag}`, {
      echo: false,
    });
  } catch {
    console.warn('Failed to remove image');
  }
}

/**
 * Tags a docker image with another tag.
 *
 * @param image The current image.
 * @param tag The new tag name.
 */
export async function dockerTagImage(image: DockerImage, tag: string): Promise<void> {
  try {
    await docker(`tag ${image.fullImage}:${image.tag} ${image.fullImage}:${tag}`);
  } catch {
    throw new Error('Failed to rename image.');
  }
}

export async function dockerImageSize(image: DockerImage): Promise<string> {
  try {
    const size = await docker(`image ls --format '{{ .Size }}' ${image.fullImage}:${image.tag}`);
    return size.trim().length === 0 ? '0B' : size.trim();
  } catch {
    return '0B';
  }
}
