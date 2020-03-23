import { URL } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import os from 'os';
import path from 'path';
import DockerRepo from './dockerImage';

const DOCKER_HOME = path.join(os.homedir(), '.docker');
const DOCKER_CONFIG = path.join(DOCKER_HOME, 'config.json');

interface ServiceCrednetials {
  account: string;
  header:  string;
}

const SERVICE_MAP = new Map<string, ServiceCrednetials>();

export interface AuthRealm {
  realm: string;
  token: string;
}

function readDockerConfig(): void {
  try {
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

export async function getAuthUrl(repo: DockerRepo): Promise<AuthRealm> {
  const authUrl = new URL(`${repo.registry}/v2/`);
  try {
    const response = await fetch(authUrl.toString());
    const authRealmHeader = response.headers.get('www-authenticate');
    const [ realm, service ] = authRealmHeader?.split(' ')[1].split(',')!;
    const [ realmHeader, realmUrl ] = realm.split('=')!;
    const [ serviceHeader, serviceToken ] = service.split('=')!;
    if (realmHeader === 'realm' && serviceHeader === 'service') {
      return {
        realm: realmUrl.replace(/"/g, ''),
        token: serviceToken.replace(/"/g, ''),
      }
    } else {
      throw new Error('Could no located auth realm')
    }
  } catch (err) {
    throw new Error('Could no located auth realm')
  }
}

export async function getAuthToken(authRealm: AuthRealm, repo: DockerRepo): Promise<string> {
  const headers = {};
  const authUrl = new URL(authRealm.realm);
  authUrl.searchParams.append('service', authRealm.token);
  authUrl.searchParams.append('scope', `repository:${repo.image}:pull`);

  if (SERVICE_MAP.has(authRealm.token)) {
    authUrl.searchParams.append('account', SERVICE_MAP.get(authRealm.token)!.account);
    headers['Authorization'] = `Basic ${SERVICE_MAP.get(authRealm.token)!.header}`;
  }

  try {
    const response = await fetch(authUrl.toString(), {
      headers
    });
    const json = await response.json();
    return json.token;
  } catch {
    throw new Error('Could not get auth token.')
    // TODO: Ignore this for now
  }
}

readDockerConfig();
