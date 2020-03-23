import fs from 'fs';
import yaml from 'js-yaml';

export interface DockerComposeService {
  image: string;
}

export interface DockerCompose {
  services: { [key: string]: DockerComposeService };
}

export function loadYamlToJson(file: string): DockerCompose {
  const yamlFile = fs.readFileSync(file, 'utf-8')
  return yaml.safeLoad(yamlFile) as DockerCompose;
}

export function parseImageNames(yaml: DockerCompose): string[] {
  const containers: string[] = [];
  for (const key of Object.keys(yaml.services)) {
    if (yaml.services[key].image) {
      containers.push(yaml.services[key].image);
    }
  }
  return containers;
}
