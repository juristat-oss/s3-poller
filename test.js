/* eslint-env node, mocha */
const AWS = require('aws-sdk-mock');
const expect = require('chai').expect;
const S3Poller = require('./');

describe('S3Poller', () => {
  afterEach(() => {
    AWS.restore();
  });

  describe('#getObject()', () => {
    it('fetches object when unset', () => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
        });

        callback(null, {
          Body: '{"neato": "mosquito"}',
          LastModified: new Date('2000-01-01'),
        });
      });

      return new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
      })
      .getObject()
      .then((val) => {
        expect(val).to.eql({ neato: 'mosquito' });
      });
    });

    it('returns object when set', () => {
      AWS.mock('S3', 'getObject', () => {
        throw new Error('should not have called S3#getObject');
      });

      return new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: { fizz: 'buzz' },
      })
      .getObject()
      .then((val) => {
        expect(val).to.eql({ fizz: 'buzz' });
      });
    });
  });

  describe('#getCurrentValue()', () => {
    it('returns object when set', () => {
      AWS.mock('S3', 'getObject', () => {
        throw new Error('should not have called S3#getObject');
      });

      const obj = new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: { hi: 'mom' },
      })
      .getCurrentValue();

      expect(obj).to.eql({ hi: 'mom' });
    });

    it('returns undefined when object not set', () => {
      AWS.mock('S3', 'getObject', () => {
        throw new Error('should not have called S3#getObject');
      });

      const obj = new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
      })
      .getCurrentValue();

      expect(obj).to.be.an('undefined');
    });
  });

  describe('#getUpdate()', () => {
    it('fetches object when not set', () => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
        });

        callback(null, {
          Body: '{"party on": true}',
          LastModified: new Date('2000-01-01'),
        });
      });

      return new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
      })
      .getUpdate()
      .then((val) => {
        expect(val).to.eql({ 'party on': true });
      });
    });

    it('fetches object when no lastModified', () => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
        });

        callback(null, {
          Body: '{"something": "spicy"}',
          LastModified: new Date('2000-01-01'),
        });
      });

      return new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: { something: 'fierce' },
      })
      .getUpdate()
      .then((val) => {
        expect(val).to.eql({ something: 'spicy' });
      });
    });

    it('conditionally fetches fresh object w/ lastModified', () => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
          IfModifiedSince: new Date('2000-01-01'),
        });

        callback(null, {
          Body: '{"something": "borrowed"}',
          LastModified: new Date('2001-01-01'),
        });
      });

      return new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: { something: 'blue' },
        lastModified: new Date('2000-01-01'),
      })
      .getUpdate()
      .then((val) => {
        expect(val).to.eql({ something: 'borrowed' });
      });
    });

    it('conditionally fetches stale object w/ lastModified', () => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
          IfModifiedSince: new Date('2001-01-01'),
        });

        callback({ Code: 'NotModified' });
      });

      const init = { something: 'red' };

      return new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: init,
        lastModified: new Date('2001-01-01'),
      })
      .getUpdate()
      .then((val) => {
        expect(val).to.equal(init);
      });
    });

    it('sets object and lastModified', () => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
        });

        callback(null, {
          Body: '{"something": "green"}',
          LastModified: new Date('2002-01-01'),
        });
      });

      const poller = new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
      });

      return poller.getUpdate()
      .then(() => {
        expect(poller.getCurrentValue()).to.eql({ something: 'green' });
        expect(poller.getLastModified()).to.eql(new Date('2002-01-01'));
      });
    });
  });

  describe('polling and updating', () => {
    it('basic onUpdate() + poll()', (done) => {
      let count = 0;

      AWS.mock('S3', 'getObject', (params, callback) => {
        count += 1;

        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
          IfModifiedSince: new Date('2000-01-01'),
        });

        if (count >= 4) {
          callback(null, {
            Body: '{"something": "purple"}',
            LastModified: new Date('2003-01-01'),
          });
        } else {
          callback({ Code: 'NotModified' });
        }
      });

      const poller = new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: { something: 'old' },
        lastModified: new Date('2000-01-01'),
      });

      const listener = (val) => {
        poller.offUpdate(listener);
        expect(count).to.eql(4);
        expect(val).to.eql({ something: 'purple' });
        done();
      };

      poller.onUpdate(listener).poll(10);
    });

    it('multiple onUpdate() + offUpdate() + cancelPoll()', (done) => {
      AWS.mock('S3', 'getObject', (params, callback) => {
        expect(params).to.eql({
          Bucket: 'mock-bucket',
          Key: 'mock-key',
          IfModifiedSince: new Date('2003-01-01'),
        });

        callback(null, {
          Body: '{"something": "orange"}',
          LastModified: new Date('2003-01-01'),
        });
      });

      const poller = new S3Poller({
        key: 'mock-key',
        bucket: 'mock-bucket',
        initialValue: { something: 'old' },
        lastModified: new Date('2003-01-01'),
      });

      let count = 0;

      const offTestListener = () => {
        expect(count).to.be.at.most(2);
      };

      const constantListener = () => {
        count += 1;

        if (count === 2) {
          poller.offUpdate(offTestListener);
        }

        if (count === 4) {
          poller.cancelPoll();
          setTimeout(() => done(), 30);
        }

        expect(count).to.be.at.most(4);
      };

      poller.onUpdate(offTestListener, constantListener).poll(10);
    });
  });
});
