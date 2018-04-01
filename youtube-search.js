import { YouTubeError } from './youtube-error.js';

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search?';

/**
 * @param {Object} params - Query string params
 * @returns {String}
 */
function makeQueryString(params = {}) {
    return Object.keys(params)
        .map(param => `${param}=` + encodeURIComponent(params[param]))
        .join('&');
}

/**
 * Make request to YouTube API
 * @link https://developers.google.com/youtube/v3/docs/search/list
 * @param {Object} options - Parameters the request should be performed with
 * @returns {Promise}
 */
function makeApiRequest(options = {}) {
    return fetch(YOUTUBE_API_URL + makeQueryString(options))
        .then(resp => {
            return resp.json();
        })
        .then(data => {
            if (data.error) {
                throw new YouTubeError(data.error);
            }
            return data;
        });
}

/**
 * This function returns a generator. Each iteration returns the next page.
 * @param {Object} options - YouTube API parameters
 * @returns {Generator}
 */
async function* search(options = {}) {
    let etag;
    let nextPageToken = options.pageToken;
    while (!etag || nextPageToken) {
        if (nextPageToken) {
            options.pageToken = nextPageToken;
        }
        let result = await makeApiRequest(options);
        nextPageToken = result.nextPageToken;
        etag = result.etag;
        yield result;
    }
}

export class YoutubeSearch {
    /**
     * @param {Object} options - YouTube API parameters
     */
    constructor(options = {}) {
        this.options = options;

        /**
         * @private
         */
        this._gen = null;

        /**
         * @private
         */
        this._lastQuery = null;
    }

    /**
     * Make search request.
     * Each call with the same query string returns next page.
     * @param {String} query - Query search string
     * @returns {Promise}
     */
    async search(query) {
        if (!this._lastQuery || query !== this._lastQuery) {
            this._lastQuery = query;
            this._gen = search({ ...this.options, q: query });
        }
        let data = await this._gen.next();
        return data.done ? [] : data.value.items;
    }
}
