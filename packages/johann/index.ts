import chalk from 'chalk';
import minimist from 'minimist';
import os from 'os';
import { loadYamlToJson, parseImageNames } from './dockerCompose';
import { containerProcessor, Container } from './processors/processor';
import Refresh from './processors/refresh';
import RefreshReportOnly from './processors/report-only';

/**
 *
 */
function help(): void {
  console.log('Usage:  johann [OPTIONS] [FILES]');
  console.log('');
  console.log('A self-sufficient tool for keeping docker-compose files syncronized.');
  console.log('');
  console.log('If no file is supplied johann will look for a docker-compose.yml in the local folder.');
  console.log('');
  console.log('  Options:');
  console.log('        --cpu-count number    Do not refresh images report on the local state only');
  console.log('        --image string        The name of a single image to synchronize.');
  console.log('        --report-only         Do not refresh images report on the local state only');
  console.log('');
  process.exit(1);
}

/**
 * Parses a set of docker-compose files and returns the image names.
 *
 * @param files
 */
async function loadYaml(files: string[]): Promise<string[]> {
  try {
    const containers = new Set<string>();
    for (const file of files) {
      const yamlJson = loadYamlToJson(file);
      for (const container of parseImageNames(yamlJson)) {
        containers.add(container);
      }
    }
    return Array.from(containers);
  } catch (err) {
    console.log(chalk.red(err.message));
    process.exit(1)
  }
}

/**
 * The different options that the cli accepts.
 */
interface CliOptions {
  cpuCount: number;
  dryRun: boolean;
  files: string[];
  help: boolean;
  image: string | null;
  reportOnly: boolean;
}

/**
 * Main entrypoint, all input here is raw and has yet to be parsed.
 */
export async function run(): Promise<void> {
  try {
    const args = minimist(process.argv.slice(2), {
      boolean: ['dry-run', 'report-only', 'help'],
      default: {
        command: 'refresh',
        'cpu-count': os.cpus().length - 1,
        'dry-run': false,
        'help': false,
        'image': null,
        'report-only': false,
      },
    });

    const options: CliOptions = {
      cpuCount: args['cpu-count'],
      dryRun: args['dry-run'],
      files: args._,
      help: args.help,
      image: args.image,
      reportOnly: args['report-only'],
    };

    const processor: Container<unknown> = (options.reportOnly) ?
      new RefreshReportOnly() : new Refresh({
        dryRun: options.dryRun,
      });

    if (args.help) {
      help();
    } else if (options.image) {
      containerProcessor([options.image], processor, options.cpuCount);
    } else if (options.files.length === 0) {
      const containers = await loadYaml(['docker-compose.yml']);
      await containerProcessor(containers.sort(), processor, options.cpuCount);
    } else if (args.command === 'refresh') {
      const containers = await loadYaml(options.files);
      await containerProcessor(containers.sort(), processor, options.cpuCount);
    } else {
      help();
    }

  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
}
