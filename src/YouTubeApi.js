/**
 * @file YouTube API base class
 */

import { YouTubeError, YouTubeApiError } from './YouTubeError.js';

const isAbortControllerSupported = typeof AbortController === 'function';

/**
 * @class YouTube API base class
 * @abstract
 */
export default class YouTubeApi {
    /**
     * Request timeout in ms.
     * @static
     */
    static get REQUEST_TIMEOUT() {
        return 5000;
    }

    /**
     * @param {Object} params - Query string params
     * @returns {String}
     * @static
     */
    static makeQueryString(params = {}) {
        const queryParams = new URLSearchParams();
        Object.keys(params).forEach(param => queryParams.set(param, params[param]));
        return queryParams.toString();
    }

    /**
     * @param {Object} options - YouTube API parameters
     * @constructs
     */
    constructor(options = {}) {
        if (this.constructor.name === 'YouTubeApi') {
            throw new TypeError('YouTubeApi must not be constructed directly.');
        }

        // Clone options to prevent modifications
        this.options = { ...options };

        // Store access token
        if (this.options.access_token) {
            /**
             * Access token
             * @private
             */
            this.accessToken = this.options.access_token;
            delete this.options.access_token;
        }

        /**
         * Request timeout
         * @private
         */
        this.requestTimeout = 'timeout' in this.options ? this.options.timeout : YouTubeApi.REQUEST_TIMEOUT;
        delete this.options.timeout;

        /**
         * Instance of AbortController if supported
         * @private
         */
        this.abortController = null;
    }

    /**
     * Abort the current search request.
     * @public
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * YouTube API endpoint URL.
     * Must be overridden in inherited class.
     * @private
     */
    get url() {
        throw new ReferenceError('API endpoint URL is not defined.');
    }

    /**
     * Append path segment to the API endpoint
     * @param {String} path - Path segment that should be appended to the URL
     * @returns {String} - New URL
     * @private
     */
    at(...path) {
        return (
            this.url.replace(/\/+$/, '') + (path.length ? '/' : '') + path.map(at => encodeURIComponent(at)).join('/')
        );
    }

    /**
     * Make request to [YouTube API]{@link https://developers.google.com/youtube/v3/docs/}
     * @param {Object} options - Request options
     * @param {String} options.url - API endpoint URL
     * @param {Object} options.params - Parameters the request should be performed with
     * @returns {Promise}
     * @private
     */
    async makeApiRequest({ url = this.url, method = 'GET', params = {} } = {}) {
        // Request timeout
        let timeoutId;
        const timeout = new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('Request timeout.'));
            }, this.requestTimeout);
        });

        // Allow to abort request if supported
        const signal =
            isAbortControllerSupported && (this.abortController = new AbortController()) && this.abortController.signal;

        // Authorization with access token
        const headers = {};
        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        // Add request params to URL
        if (method === 'GET') {
            const query = YouTubeApi.makeQueryString({ ...this.options, ...params });
            if (query) {
                url += `?${query}`;
            }
        }

        // POST request
        const body = method === 'POST' ? JSON.stringify({ ...this.options, ...params }) : null;

        // Send request
        let response;
        try {
            response = await Promise.race([fetch(url, { method, headers, body, signal }), timeout]);
        } catch (e) {
            // Ignore errors caused by aborting request
            if (e.name === 'AbortError') {
                return Promise.resolve();
            }
            throw e;
        }

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type');
        const isJson = contentType.includes('application/json');

        if (!response.ok) {
            const data = isJson ? await response.json() : await response.text();
            if (data && data.error) {
                if (data.error.error_description) {
                    throw new YouTubeError(data.error.error_description);
                } else {
                    throw new YouTubeApiError(data.error);
                }
            }
            throw new YouTubeError(data || response.statusText || 'Status: ' + response.status);
        }

        return isJson ? await response.json() : await response.blob();
    }
}
