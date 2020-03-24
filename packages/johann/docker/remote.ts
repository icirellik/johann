import { Headers } from 'node-fetch';
import { URL } from 'url';
import DockerImage from './image';
import { fetchViaProxy } from '../util/fetch';

export async function remoteDigest(image: DockerImage, authToken: string): Promise<string> {
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${authToken}`);
  headers.append('Accept', 'application/vnd.oci.image.index.v1+json');
  headers.append('Accept', 'application/vnd.oci.image.manifest.v1+json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.v1+prettyjws');
  headers.append('Accept', 'application/json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.v2+json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.list.v2+json');

  const registryUrl = new URL(`${image.registry}/v2/${image.repository}/${image.image}/manifests/${image.tag}`);
  const response = await fetchViaProxy(registryUrl.toString(), {
    headers,
  });
  const digest = response.headers.get('docker-content-digest');
  return `${image.fullImage}@${digest}`;
}
