import fs from 'fs';
import yaml from 'js-yaml';

export interface DockerComposeService {
  image: string;
}

export interface DockerCompose {
  services: { [key: string]: DockerComposeService };
}

/**
 * Attempts to parse a yaml file and converts it to json.
 *
 * @param file
 */
export function loadYamlToJson(file: string): DockerCompose {
  try {
    const yamlFile = fs.readFileSync(file, 'utf-8')
    // TODO: Remove cast
    return yaml.safeLoad(yamlFile) as DockerCompose;
  } catch {
    throw new Error(`Failed to parse '${file}'`);
  }
}

/**
 * Pulls all the images names out of a parsed docker compose file.
 *
 * @param yaml
 */
export function parseImageNames(yaml: DockerCompose): string[] {
  const containers: string[] = [];
  for (const key of Object.keys(yaml.services)) {
    if (yaml.services[key].image) {
      containers.push(yaml.services[key].image);
    }
  }
  return containers;
}
