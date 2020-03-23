import { dockerCommand } from './util/dockerCommand';
import DockerRepo from './dockerImage';

export async function dockerInspect(image: DockerRepo): Promise<string> {
  return JSON.parse(await dockerCommand(`inspect --format "{{json .}}" ${image.fullImage}:${image.tag}`));
}

export async function dockerDigest(image: DockerRepo): Promise<string> {
  try {
    // TODO: Remove any
    const inspect = await dockerInspect(image) as any;
    // TODO: Verify all digests
    return inspect.RepoDigests[0].trim();
  } catch {
    return '';
  }
}

export async function dockerPull(image: DockerRepo): Promise<void> {
  await dockerCommand(`pull ${image.fullImage}:${image.tag}`, {
    echo: false,
  });
}

export async function dockerRemoveImage(image: DockerRepo): Promise<void> {
  try {
    await dockerCommand(`rmi ${image.fullImage}:${image.tag}`, {
      echo: false,
    });
  } catch {
    // TODO: We don't currently care that this fails.
  }
}

export async function dockerImageSize(image: DockerRepo): Promise<string> {
  try {
    const size = await dockerCommand(`image ls --format '{{ .Size }}' ${image.fullImage}:${image.tag}`);
    return size.trim().length === 0 ? '0B' : size.trim();
  } catch {
    return '0B';
  }
}
