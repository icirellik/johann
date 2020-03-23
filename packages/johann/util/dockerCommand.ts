import { exec, ExecException } from 'child_process'

export interface Options {
  currentWorkingDirectory?: string;
  echo?: boolean;
}

export const dockerCommand = async (
  command: string,
  options: Options = {
    echo: false,
  },
): Promise<string> => {
  const flags: string[] = [];

  const execCommand = `docker ${flags.join(' ')} ${command}`
  const execOptions = {
    cwd: options.currentWorkingDirectory,
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
    },
    maxBuffer: 200 * 1024 * 1024,
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const childProcess = exec(
      execCommand,
      execOptions,
      (error: ExecException, stdout: string, stderr: string) => {
        if (error) {
          return reject(
            Object.assign(
              new Error(`Error: stdout ${stdout}, stderr ${stderr}`),
              { ...error, stdout, stderr, innerError: error },
            ),
          )
        }
        resolve(stdout)
      },
    )

    if (options.echo) {
      childProcess.stdout && childProcess.stdout.on('data', (chunk: unknown) => {
        if (chunk instanceof String) {
          process.stdout.write(chunk.toString());
        }
      });

      childProcess.stderr && childProcess.stderr.on('data', (chunk: unknown) => {
        if (chunk instanceof String) {
          process.stderr.write(chunk.toString());
        }
      });
    }
  })
  return raw;
}
