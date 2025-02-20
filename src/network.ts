import type { AxiosRequestConfig } from 'axios';
import { URL } from 'url';

/**
 * Adds https proxy options to an axios request if they were defined as an env variable
 *
 * @param options The option object passed to axios
 */
export function applyHttpsProxy(options: AxiosRequestConfig): AxiosRequestConfig {
    const proxy: string | undefined = process.env.https_proxy || process.env.HTTPS_PROXY;
    if (proxy) {
        try {
            const proxyUrl = new URL(proxy);
            if (proxyUrl.hostname) {
                options.proxy = {
                    host: proxyUrl.hostname,
                    port: proxyUrl.port ? parseInt(proxyUrl.port, 10) : 443,
                };
            }
        } catch {
            // Invalid URL, don't use proxy
        }
    }
    return options;
}

export function getRequestTimeout(): number {
    let ret: number | undefined;
    if (process.env.REQUEST_TIMEOUT) {
        ret = parseInt(process.env.REQUEST_TIMEOUT, 10);
    }
    if (ret == undefined || Number.isNaN(ret)) {
        return 5000;
    }
    return ret;
}
