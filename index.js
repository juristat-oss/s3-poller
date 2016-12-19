const AWS = require('aws-sdk');

class S3Poller {
  /**
   * Make a new S3Poller.
   * @param {Object} opts - options to configure this S3Poller
   * @param {string} opts.key - the S3 key to fetch
   * @param {string} opts.bucket - the S3 bucket to fetch from
   * @param {Object} [opts.initialValue] - initial object value to prepopulate
   * @param {Date} [opts.lastModified] - initial lastModified date to use when checking for updates
   * @param {number} [opts.updateInterval] - update interval; polling will begin immediately if set
   * @param {function|function[]} [opts.updateListener] - update listener function(s)
   * @param {Object} [opts.s3Config] - config to pass to the AWS.S3 constructor
   */
  constructor(opts = {}) {
    this.opts = Object.assign({}, { /* future default options */ }, opts);
    this.updateListeners = [];

    if (typeof this.opts.key !== 'string' || typeof this.opts.bucket !== 'string') {
      throw new TypeError('key and bucket are required and should be strings');
    }

    if (this.opts.initialValue) {
      this.object = this.opts.initialValue;
    } else {
      this.object = undefined;
    }

    if (this.opts.lastModified) {
      if (!(this.opts.lastModified instanceof Date)) {
        throw new TypeError('opts.lastModified should be a Date');
      }

      this.lastModified = this.opts.lastModified;
    } else {
      this.lastModified = undefined;
    }

    if (this.opts.s3Config) {
      this.s3 = new AWS.S3(this.opts.s3Config);
    } else {
      this.s3 = new AWS.S3();
    }

    if (this.opts.updateListener) {
      const initListeners = [].concat(this.opts.updateListener);
      this.onUpdate(...initListeners);
    }

    if (this.opts.updateInterval) {
      this.poll(this.opts.updateInterval);
    } else {
      this.updateInterval = undefined;
    }
  }

  /**
   * Return, as a Promise, the target object, fetching it if it hasn't been fetched yet
   * @returns {Promise} the target object
   */
  getObject() {
    if (this.object) {
      return Promise.resolve(this.object);
    }

    return this.getUpdate();
  }

  /**
   * Return the target object, but return undefined if it hasn't been fetched yet
   * @returns {Object} the target object, or undefined
   */
  getCurrentValue() {
    if (this.object) {
      return this.object;
    }

    return undefined;
  }

  /**
   * Fetch the object, update the locally cached version, and return a result Promise. Uses the
   * IfModifiedSince S3 option to avoid unnecessary downloads.
   * @returns {Promise} the result of fetching the target object
   */
  getUpdate() {
    let resultPromise;
    let stale = false;

    if (this.object && this.lastModified) {
      resultPromise = this.s3.getObject({
        Bucket: this.opts.bucket,
        Key: this.opts.key,
        IfModifiedSince: this.lastModified,
      })
      .promise()
      .catch((err) => {
        if (err.Code === 'NotModified') {
          stale = true;
          return Promise.resolve(this.object);
        }

        return Promise.reject(err);
      });
    } else {
      resultPromise = this.s3.getObject({
        Bucket: this.opts.bucket,
        Key: this.opts.key,
      })
      .promise();
    }

    return resultPromise.then((result) => {
      if (stale) {
        this.object = result;
      } else {
        this.object = JSON.parse(result.Body);
        this.lastModified = result.LastModified;
        this.updateListeners.forEach(listener => listener(this.object));
      }

      return this.object;
    });
  }

  /**
   * Get the last modified date of the current cached copy of the object
   * @returns {Date} the last modified date, or undefined
   */
  getLastModified() {
    if (this.lastModified) {
      return this.lastModified;
    }

    return undefined;
  }

  /**
   * Set the polling interval for checking S3 for updates. Overrides previous intervals.
   * @param {number} interval - polling interval in milliseconds
   * @returns {S3Poller} this
   */
  poll(interval) {
    this.cancelPoll();
    this.updateInterval = setInterval(() => {
      this.getUpdate().catch(() => {});
    }, interval);
    return this;
  }

  /**
   * Cancel the existing polling interval, if any, by way of clearInterval.
   * @returns {S3Poller} this
   */
  cancelPoll() {
    if (this.updateInterval) { clearInterval(this.updateInterval); }
    return this;
  }

  /**
   * Register one or more listeners to be called whenever the target object has changed in S3
   * @param {...function} listeners - functions to be called when the object is updated
   * @returns {S3Poller} this
   */
  onUpdate(...listeners) {
    listeners.forEach((listener) => {
      if (typeof listener !== 'function') {
        throw new TypeError('listener is not a function');
      }

      this.updateListeners.push(listener);
    });

    return this;
  }

  /**
   * Remove previously-registered update listener functions
   * @param {...function} listeners - previously-registered update listener functions
   * @returns {S3Poller} this
   */
  offUpdate(...listeners) {
    this.updateListeners = this.updateListeners.filter(ul => listeners.indexOf(ul) === -1);
    return this;
  }

  /**
   * Remove all registered update listeners
   * @returns {S3Poller} this
   */
  removeListeners() {
    this.updateListeners = [];
    return this;
  }
}

module.exports = S3Poller;
