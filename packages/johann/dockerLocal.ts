import { dockerCommand } from './util/dockerCommand';
import DockerImage from './dockerImage';

export async function dockerInspect(image: DockerImage): Promise<any> {
  return JSON.parse(await dockerCommand(`inspect --format "{{json .}}" ${image.fullImage}:${image.tag}`));
}

export async function dockerDigest(image: DockerImage): Promise<string> {
  try {
    const inspect = await dockerInspect(image);
    // TODO: Verify all digests
    return inspect.RepoDigests[0].trim();
  } catch {
    return '';
  }
}

export async function dockerSizeBytes(image: DockerImage): Promise<number> {
  try {
    const inspect = await dockerInspect(image);
    return inspect.Size
  } catch {
    return 0;
  }
}

export async function dockerPull(image: DockerImage): Promise<void> {
  await dockerCommand(`pull ${image.fullImage}:${image.tag}`, {
    echo: false,
  });
}

export async function dockerRemoveImage(image: DockerImage): Promise<void> {
  try {
    await dockerCommand(`rmi ${image.fullImage}:${image.tag}`, {
      echo: false,
    });
  } catch {
    // TODO: We don't currently care that this fails.
  }
}

export async function dockerImageSize(image: DockerImage): Promise<string> {
  try {
    const size = await dockerCommand(`image ls --format '{{ .Size }}' ${image.fullImage}:${image.tag}`);
    return size.trim().length === 0 ? '0B' : size.trim();
  } catch {
    return '0B';
  }
}
