import chalk from 'chalk';
import throat from 'throat';

export interface FulfilledEvent<T> {
  data: { result: T };
}

export interface ErrorEvent {
  message: string;
}

export interface Container<T> {
  process(containerSlug: string, index: number, total: number): Promise<T>;
  fulfilled(event: T): void;
  error(event: ErrorEvent, index: number, total: number): void;
  complete(): void;
}

/**
 * Creates a promise processor to
 *
 * @param files
 */
export async function containerProcessor(
  containers: string[],
  processor: Container<unknown>,
  threads: number,
): Promise<void> {
  let fullfilled = 0;

  const errorMessages: string[] = [];
  const promises = containers.map(throat(threads, (container, i) => {
    return Promise.resolve()
      .then(() => {
        return processor.process(container, i , containers.length);
      })
      .then(results => {
        processor.fulfilled(results);
      })
      .catch(error => {
        processor.error(error, i , containers.length);
        errorMessages.push(`${container}: ${error.message}`)
      })
      .finally(() => {
        fullfilled += 1;
        const outstanding = containers.length - fullfilled;
        if (outstanding <= threads && outstanding > 0) {
          console.log(`There are still ${outstanding} refreshes outstanding.`);
        }
      });
  }));

  await Promise.all(promises)
    .then(() => {
      console.log('Refreshing complete.');
      processor.complete();
      for (const errorMessage of errorMessages) {
        console.log(chalk.red(errorMessage));
      }
    })
    .catch(() => {
      console.log('uncaught errors');
    });
}
