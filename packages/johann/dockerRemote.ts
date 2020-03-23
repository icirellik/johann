import DockerRepo from './dockerImage';
import fetch, { Headers } from 'node-fetch';
import { URL } from 'url';

export async function remoteDigest(repo: DockerRepo, authToken: string): Promise<string> {
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${authToken}`);
  headers.append('Accept', 'application/vnd.oci.image.index.v1+json');
  headers.append('Accept', 'application/vnd.oci.image.manifest.v1+json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.v1+prettyjws');
  headers.append('Accept', 'application/json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.v2+json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.list.v2+json');

  const registryUrl = new URL(`${repo.registry}/v2/${repo.image}/manifests/${repo.tag}`);
  const response = await fetch(registryUrl.toString(), {
    headers,
  });
  const digest = response.headers.get('docker-content-digest');
  return `${repo.fullImage}@${digest}`;
}
