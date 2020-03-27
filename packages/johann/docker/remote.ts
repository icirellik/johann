import { Headers } from 'node-fetch';
import { URL } from 'url';
import DockerId from './image';
import { fetchViaProxy } from '../util/fetch';

export async function remoteDigest(id: DockerId, authToken: string): Promise<string> {
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${authToken}`);
  headers.append('Accept', 'application/vnd.oci.image.index.v1+json');
  headers.append('Accept', 'application/vnd.oci.image.manifest.v1+json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.v1+prettyjws');
  headers.append('Accept', 'application/json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.v2+json');
  headers.append('Accept', 'application/vnd.docker.distribution.manifest.list.v2+json');

  const registryUrl = new URL(`${id.registry}/v2/${id.repository}/${id.image}/manifests/${id.tag}`);
  const response = await fetchViaProxy(registryUrl.toString(), {
    headers,
  });
  const digest = response.headers.get('docker-content-digest');
  return `${id.fullImage}@${digest}`;
}
