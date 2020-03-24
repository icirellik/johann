import { docker } from './cli';
import DockerImage from './image';

interface DockerInspect {
  RepoDigests: string[];
  Size: number;
}

export async function dockerInspect(image: DockerImage): Promise<DockerInspect> {
  try {
    // TODO: Remove casting
    return JSON.parse(await docker(`inspect --format "{{json .}}" ${image.fullImage}:${image.tag}`)) as DockerInspect;
  } catch {
    return {
      RepoDigests: [ '' ],
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
    // TODO: We don't currently care that this fails.
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
