import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import DockerImage from './image';
import { fetchViaProxy } from '../util/fetch';
import KeychainAccess, { InternetPassword } from '../util/osxkeychain';

const DOCKER_HOME = path.join(os.homedir(), '.docker');
const DOCKER_CONFIG = path.join(DOCKER_HOME, 'config.json');

interface ServiceCredentials {
  account: string;
  header:  string;
}

export interface AuthEndpoint {
  serviceToken: string;
  url: string;
}

/**
 * The auth endpoints a for a single service are not expected to change during
 * a single execution and we memoize them to reduce network requests.
 */
const ENDPOINT_MEMO = new Map<string, AuthEndpoint>();

const SERVICE_MAP = new Map<string, ServiceCredentials | null>();
const DOCKER_CREDENTIALS_KEYCHAIN = 'Docker Credentials';

let credentialStore: string | null = null;

/**
 * Handles accessing the osx credential store (Keychain Access)
 */
async function osxkeychain(service: string): Promise<InternetPassword> {
  const keychain = new KeychainAccess();
  return keychain.getPassword({
    label: DOCKER_CREDENTIALS_KEYCHAIN,
    service,
    type: 'internet',
  });
}

/**
 * Checks to see if there are any credential that should be used for accessing
 * a docker service.
 */
async function securityStore(service: string): Promise<ServiceCredentials | null> {
  if (SERVICE_MAP.has(service)) {
    const auth = SERVICE_MAP.get(service);
    if (typeof auth !== 'undefined') {
      return auth;
    }
  }
  if (credentialStore === 'osxkeychain' || credentialStore === 'desktop') {
    try {
      const internetPassword = await osxkeychain(service);
      const buffer = Buffer.from(`${internetPassword.account}:${internetPassword.password}`, 'utf-8');
      const credentials = {
        account: service,
        header: buffer.toString('base64'),
      };

      SERVICE_MAP.set(service, credentials);
      return credentials;
    } catch (err) {
      console.warn(chalk.yellow(`Service not found in osxkeychain: ${service}`));
      SERVICE_MAP.set(service, null);
      return null
    }
  }
  return null;
}

/**
 * Reads the local docker configuration to see if there are any service auths or
 * credential stores defined.
 */
function readDockerConfig(): void {
  try {
    const dockerConfigRaw = fs.readFileSync(DOCKER_CONFIG, 'utf-8');
    const dockerConfig = JSON.parse(dockerConfigRaw);

    if (dockerConfig.credsStore) {
      credentialStore = dockerConfig.credsStore;
    }

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
    console.warn('Could not read the docker configuration:', err.message);
  }
}

// Load the initial docker credentials from the configuration.
readDockerConfig();

/**
 * Locates the authentication endpoint for a docker registry.
 *
 * @param image
 */
export async function getAuthEndpoint(registry: string): Promise<AuthEndpoint> {
  if (ENDPOINT_MEMO.has(registry)) {
    const endpoint = ENDPOINT_MEMO.get(registry);
    if (!endpoint) {
      throw new Error(`Authentication endpoint memo '${registry}' was null.`);
    }
    return endpoint;
  }

  const url = new URL(`${registry}/v2/`);
  const response = await fetchViaProxy(url.toString());
  const authEndpointHeader = response.headers.get('www-authenticate');

  if (!authEndpointHeader) {
    throw new Error('Authentication endpoint header \'www-authenticate\' missing.');
  }

  // Example:
  // Bearer realm="https://example.com/v2/auth",service="example"
  const [ realm, service ] = authEndpointHeader.substr(7)
    .replace(/"/g, '')
    .split(',');

  if (!realm || !service) {
    throw new Error('Authentication endpoint header could not be parsed.');
  }

  const [ realmHeader, realmUrl ] = realm.split('=');
  const [ serviceHeader, serviceToken ] = service.split('=');
  if (realmHeader === 'realm' && serviceHeader === 'service') {
    const authEndpoint = {
      url: realmUrl,
      serviceToken: serviceToken,
    }
    ENDPOINT_MEMO.set(registry, authEndpoint);
    return authEndpoint;
  } else {
    throw new Error('Authentication endpoint header could not be parsed.')
  }
}

/**
 *
 */
export async function getAuthToken(authRealm: AuthEndpoint, image: DockerImage): Promise<string> {
  const headers = {};
  const authUrl = new URL(authRealm.url);
  authUrl.searchParams.append('service', authRealm.serviceToken);
  authUrl.searchParams.append('scope', `repository:${image.repository}/${image.image}:pull`);

  const serviceCredentials = await securityStore(authRealm.serviceToken);
  if (serviceCredentials) {
    authUrl.searchParams.append('account', serviceCredentials.account);
    headers['Authorization'] = `Basic ${serviceCredentials.header}`;
  }

  try {
    const response = await fetchViaProxy(authUrl.toString(), {
      headers,
    });
    // TODO: set the type on this JSON
    const json = await response.json();
    return json.token;
  } catch {
    throw new Error(`Could not get auth token for '${image.fullImage}:${image.tag}'`);
    // TODO: Ignore this for now
  }
}
