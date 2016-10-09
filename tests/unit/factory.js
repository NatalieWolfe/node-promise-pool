'use strict';

require('should');

try {
    var PromisePool = require('../../lib-cov/PromisePool');
}
catch (err) {
    var PromisePool = require('../../lib/PromisePool');
}

describe('PromisePool.Factory', function() {
    var pool = null;

    beforeEach(function() {
        var id = 0;
        pool = new PromisePool({
            name: 'test-pool',
            max: 10,
            min: 0,
            create: function() { return {id: ++id}; },
            destroy: function(obj) {}
        });
    });

    describe('#create', function() {
        it('should not error with late-rejected promises', function(done) {
            var defer = {};
            pool._opts.create = function() {
                return new Promise(function(resolve, reject) {
                    defer.resolve = resolve;
                    defer.reject = reject;
                    resolve({});
                });
            };

            pool.acquire(function() {
                setTimeout(function() {
                    defer.reject(new Error('rejection!'));
                    setTimeout(done, 5);
                }, 5);
                return Promise.resolve();
            });
        });
    });

    describe('#onRelease', function() {
        it('should be called after releasing an object', function() {
            var obj = null;
            var onReleaseCalled = false;
            pool._opts.onRelease = function(_obj) {
                onReleaseCalled = true;
                _obj.should.equal(obj);
            };
            return pool.acquire(function(_obj) {
                obj = _obj;
                return Promise.resolve();
            }).then(function() {
                onReleaseCalled.should.be.true();
            });
        });
    });
});
