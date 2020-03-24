import HttpsProxyAgent from 'https-proxy-agent';
import nodeFetch, { Response, RequestInit } from 'node-fetch';
const _fetch = nodeFetch

/**
 * Fetch wrapped with proxy support.
 *
 * @param url
 * @param options
 */
export function fetchViaProxy(url: string, options?: RequestInit): Promise<Response> {
  const instanceOptions: { [key: string]: unknown } = {};

  if (process.env.HTTPS_PROXY) {
    instanceOptions.agent = HttpsProxyAgent(process.env.HTTPS_PROXY);
  }

  return _fetch(url, {
    ...options,
    ...instanceOptions,
  });
}

/**
 * Raw fetch module.
 */
export const fetch = _fetch;
