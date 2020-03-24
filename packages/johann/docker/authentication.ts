import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import DockerImage from './image';
import { fetchViaProxy } from '../util/fetch';

const DOCKER_HOME = path.join(os.homedir(), '.docker');
const DOCKER_CONFIG = path.join(DOCKER_HOME, 'config.json');

interface ServiceCredentials {
  account: string;
  header:  string;
}

const SERVICE_MAP = new Map<string, ServiceCredentials>();

function readDockerConfig(): void {
  try {
    // TODO: Handle osxkeychain
    const dockerConfigRaw = fs.readFileSync(DOCKER_CONFIG, 'utf-8');
    const dockerConfig = JSON.parse(dockerConfigRaw);
    if (dockerConfig.auths) {
      for (const service of Object.keys(dockerConfig.auths)) {
        const data = dockerConfig.auths[service];
        if (data.auth) {
          const dataBuffer = Buffer.from(data.auth, 'base64');
          const credentials = dataBuffer.toString('ascii');
          const [ account ] = credentials.split(':');
          SERVICE_MAP.set(service, {
            account: account ? account : '',
            header: data.auth
          })
        }
      }
    }
  } catch (err) {
    console.warn('Could not read the docker configuration', err.message);
  }
}

// Load the initial docker credentials from the configuration.
readDockerConfig();

export interface AuthEndpoint {
  url: string;
  serviceToken: string;
}

const ENDPOINT_MEMO = new Map<string, AuthEndpoint>();

/**
 *
 * @param image
 */
export async function getAuthEndpoint(image: DockerImage): Promise<AuthEndpoint> {
  if (ENDPOINT_MEMO.has(image.registry)) {
    const endpoint = ENDPOINT_MEMO.get(image.registry);
    if (!endpoint) {
      throw new Error(`Authentication endpoint memo for '${image.registry}' could not be found.`);
    }
    return endpoint;
  }

  const url = new URL(`${image.registry}/v2/`);
  try {
    const response = await fetchViaProxy(url.toString());
    const authEndpointHeader = response.headers.get('www-authenticate');

    if (!authEndpointHeader) {
      throw new Error('Authentication endpoint header could not be located.');
    }

    // Example:
    // Bearer realm="https://example.com/v2/auth",service="example"
    const [ realm, service ] = authEndpointHeader.substr(7)
      .replace(/"/g, '')
      .split(',');

    if (!realm || !service) {
      throw new Error('The authentication endpoint header could not be parsed.');
    }

    const [ realmHeader, realmUrl ] = realm.split('=');
    const [ serviceHeader, serviceToken ] = service.split('=');
    if (realmHeader === 'realm' && serviceHeader === 'service') {
      const authEndpoint = {
        url: realmUrl,
        serviceToken: serviceToken,
      }
      ENDPOINT_MEMO.set(image.registry, authEndpoint);
      return authEndpoint;
    } else {
      throw new Error('The authentication endpoint header could not be parsed.')
    }
  } catch (err) {
    throw new Error('Authentication endpoint header could not be located.')
  }
}

export async function getAuthToken(authRealm: AuthEndpoint, image: DockerImage): Promise<string> {
  const headers = {};
  const authUrl = new URL(authRealm.url);
  authUrl.searchParams.append('service', authRealm.serviceToken);
  authUrl.searchParams.append('scope', `repository:${image.repository}/${image.image}:pull`);

  if (SERVICE_MAP.has(authRealm.serviceToken)) {
    const serviceAuth = SERVICE_MAP.get(authRealm.serviceToken);
    if (serviceAuth) {
      authUrl.searchParams.append('account', serviceAuth.account);
      headers['Authorization'] = `Basic ${serviceAuth.header}`;
    }
  }

  try {
    const response = await fetchViaProxy(authUrl.toString(), {
      headers,
    });
    // TODO: set the type on this JSON
    const json = await response.json();
    return json.token;
  } catch {
    throw new Error(`Could not get auth token for ${image.fullImage}`);
    // TODO: Ignore this for now
  }
}
