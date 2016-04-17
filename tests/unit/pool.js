

var should = require('should');

try {
    var PromisePool = require('../../lib-cov/PromisePool');
}
catch (err) {
    var PromisePool = require('../../lib/PromisePool');
}

function promTimeout(delay){
    return new Promise(function(resolve){ return setTimeout(resolve, delay); });
}

describe('PromisePool', function(){
    var pool = null;
    var smallPool = null;

    beforeEach(function(){
        var id = 0
        pool = new PromisePool({
            name: 'test-pool',
            max: 100,
            min: 10,
            create: function(){ return {id: ++id}; },
            destroy: function(obj){}
        });

        smallPool = new PromisePool({
            name: 'small-pool',
            max: 1,
            min: 0,
            drainCheckIntervalMillis: 10,
            create: function(){ return {id: ++id}; },
            destroy: function(obj){}
        });
    });

    afterEach(function(){
        return Promise.all([
            pool.drain(),
            smallPool.drain()
        ]);
    });

    describe('constructor', function(){
        it('should create a pool', function(){
            pool.should.be.an.instanceOf(PromisePool);
        });

        it('should accept a logging function', function(){
            var logCount = 0;
            var pool2 = new PromisePool({
                log: function(msg, level){ ++logCount; },
                create: function(){ return {}; },
                destroy: function(obj){}
            });

            return pool2.acquire(function(conn){
                return Promise.resolve();
            }).then(function(){
                logCount.should.be.greaterThan(0);
            });
        });
    });

    describe('idle connections', function(){
        it('should be reaped when idle for too long', function(){
            var created = 0;
            var destroyed = 0;
            var idlePool = new PromisePool({
                name: 'idle-pool',
                max: 10,
                min: 0,
                idleTimeoutMillis: 10,
                reapIntervalMillis: 5,
                create: function(){ ++created; return {}; },
                destroy: function(){ ++destroyed; }
            });

            var promises = [];
            for (var i = 0; i < 5; ++i) {
                promises.push(idlePool.acquire(function(conn){ return promTimeout(5); }));
            }

            return Promise.all(promises).then(function(){
                return promTimeout(20);
            }).then(function(){
                created.should.eql(5).and.eql(destroyed);
            });
        });
    });

    describe('#acquire', function(){
        it('should get a connection', function(){
            return pool.acquire(function(conn){
                should.exist(conn);

                return Promise.resolve();
            });
        });

        it('should not hand out acquired connections', function(){
            return pool.acquire(function(conn){
                return pool.acquire(function(conn2){
                    conn.should.not.equal(conn2);
                    return Promise.resolve();
                });
            });
        });

        it('should queue requests when out of connections', function(){
            var conn = null;
            var conn2 = null;
            var prom = null;
            return smallPool.acquire(function(_conn){
                conn = _conn;

                prom = smallPool.acquire(function(_conn2){
                    conn2 = _conn2;
                    conn.should.equal(conn2);
                    return Promise.resolve();
                });

                return promTimeout(10).then(function(){
                    should.not.exist(conn2);
                });
            }).then(function(){ return prom; }).then(function(){
                should.exist(conn2);
                conn.should.equal(conn2);
            });
        });

        it('should refuse to acquire while draining', function(){
            var drain = pool.drain();

            should.throws(function(){
                pool.acquire(function(conn){
                    should.not.exist(conn);
                    return Promise.resolve();
                }).catch(function(err){
                    throw err;
                });
            });

            return drain;
        });

        it('should propagate the results of the callback', function(){
            return pool.acquire(function(conn){
                return Promise.resolve('foobar');
            }).then(function(res){
                res.should.eql('foobar');
            });
        });

        it('should propagate errors of the callback', function(){
            return pool.acquire(function(conn){
                return Promise.reject('bizbang');
            }).catch(function(err){
                err.should.eql('bizbang');
            });
        });

        it('should handle errors thrown in callback', function(){
            return pool.acquire(function(conn){
                throw 'Oh NO!';
            }).then(function(){
                true.should.be.false;
            }, function(err){
                err.should.eql('Oh NO!');
            });
        });

        it('should reject when creating a connection fails', function(){
            var pool = new PromisePool({
                create: function(){ return new Promise(function(res, rej){ rej('No good!'); }); },
                destroy: function(){}
            });

            var acquired = false;
            var resolved = false;
            var rejected = true;
            return pool.acquire(function(_conn){
                acquired = true;
                return Promise.resolve();
            }).then(function(){
                resolved = true;
            }, function(err){
                rejected = true;
                err.should.eql('No good!');
            }).then(function(){
                acquired.should.be.false;
                resolved.should.be.false;
                rejected.should.be.true;
            });
        });
    });

    describe('#release', function(){
        it('should gracefully refuse to double double release', function(){
            return pool.acquire(function(conn){
                pool.release(conn);
                return Promise.resolve();
            });
        });

        it('should return resources to the front when returnToHead is true', function(){
            var counter = 0;
            var headPool = new PromisePool({
                max: 5,
                min: 3,
                returnToHead: true,
                create: function(){ return {id: ++counter}; },
                destroy: function(conn){}
            });

            var conn = null;
            return headPool.acquire(function(_conn){
                conn = _conn;
                return Promise.resolve();
            }).then(function(){
                return headPool.acquire(function(conn2){
                    conn.should.equal(conn2);
                    conn.id.should.eql(conn2.id);
                    return Promise.resolve();
                });
            });
        });

        it('should not return destroyed objects to the pool', function(){
            var conn = null;
            return smallPool.acquire(function(_conn){
                conn = _conn;
                return smallPool.destroy(conn);
            }).then(function(){
                return smallPool.acquire(function(conn2){
                    conn.should.not.equal(conn2);
                    return Promise.resolve();
                });
            });
        });

        it('should check the `onRelease` hook if provided', function(){
            var conn = null;
            var releasedConn = null;
            var counter = 0;
            var onReleasePool = new PromisePool({
                max: 1,
                min: 0,
                create: function(){ return {}; },
                destroy: function(_conn){},
                onRelease: function(_conn){ ++counter; releasedConn = _conn; }
            });

            return onReleasePool.acquire(function(_conn){
                conn = _conn;
                return Promise.resolve();
            }).then(function(){
                should.exist(conn);
                conn.should.equal(releasedConn);
                counter.should.eql(1);
            });
        });

        it('should not return a client to the pool if `onRelease` fails', function(){
            var conn = null;
            var destroyedConn = null;
            var counter = 0;
            var onReleasePool = new PromisePool({
                max: 1,
                min: 0,
                create: function(){ return {}; },
                destroy: function(_conn){ destroyedConn = _conn; ++counter; },
                onRelease: function(_conn){ return Promise.reject(new Error('foobar')); }
            });

            return onReleasePool.acquire(function(_conn){
                conn = _conn;
                return Promise.resolve();
            }).then(function(){
                should.exist(conn);
                conn.should.equal(destroyedConn);
                counter.should.eql(1);
            });
        });
    });

    describe('#drain', function(){
        it('should destroy all resources', function(){
            var created = 0;
            var destroyed = 0;
            var pool = new PromisePool({
                max: 10,
                min: 0,
                create: function(){ ++created; return {}; },
                destroy: function(obj){ ++destroyed; }
            });

            return pool.acquire(function(conn){
                return Promise.resolve();
            }).then(function(){
                return pool.drain();
            }).then(function(){
                created.should.eql(destroyed);
            });
        });

        it('should supply all waiting clients first', function(){
            var promises = [];
            var connsAcquired = 0;

            for (var i = 0; i < 10; ++i) {
                promises.push(
                    smallPool.acquire(function(conn){
                        ++connsAcquired;
                        return Promise.resolve();
                    })
                );
            }

            return smallPool.drain()
                .then(function(){
                    connsAcquired.should.eql(promises.length);

                    return Promise.all(promises);
                });
        });

        it('should wait for all resources to be returned', function(){
            var timeoutRun = false;
            var acquirePromise = smallPool.acquire(function(conn){
                return promTimeout(20).then(function(){
                    should.not.exist(conn.__promisePool_destroyed);
                });
            });

            timeoutRun.should.be.false;
            return smallPool.drain()
                .then(function(){
                    timeoutRun.should.be.true;

                    return acquirePromise;
                });
        });
    });

    describe('#destroyAllNow', function(){
        it('should destroy all available resources', function(){
            var created = 0;
            var destroyed = 0;
            var pool = new PromisePool({
                max: 10,
                min: 0,
                create: function(){ ++created; return {}; },
                destroy: function(obj){ ++destroyed; }
            });

            var promises = [];
            for (var i = 0; i < 5; ++i) {
                promises.push(pool.acquire(function(conn){ return promTimeout(5); }));
            }

            return Promise.all(promises).then(function(){
                return pool.acquire(function(conn){ return pool.destroyAllNow(); });
            }).then(function(){
                // The connection that was acquired during the destruction shouldn't have been
                // destroyed, thus the `+1`.
                created.should.eql(5).and.eql(destroyed + 1);
            });
        });
    });

    describe('#pooled', function(){
        it('should wrap the function with an acquisition', function(){
            var conn = null;
            var func = pool.pooled(function(_conn, foo, bar){
                conn = _conn;
                foo.should.eql('foo');
                bar.should.eql('bar');
                return Promise.resolve('foobar');
            });

            func.should.be.a.function;
            should.not.exist(conn);

            return func('foo', 'bar').then(function(foobar){
                foobar.should.eql('foobar');
                should.exist(conn);
            });
        });

        it('should call the wrapped function in the wrapper\'s context', function(){
            var conn = null;
            var obj = {
                thisIsIt: true,
                func: pool.pooled(function(_conn){
                    conn = _conn;
                    should.exist(this);
                    this.thisIsIt.should.be.true;
                    return Promise.resolve();
                })
            };

            return obj.func().then(function(){
                should.exist(conn);
            });
        });
    });

    describe('#length', function(){
        it('should report the number of constructed resources', function(){
            pool.length.should.eql(10);
            smallPool.length.should.eql(0);

            return smallPool.acquire(function(client){
                smallPool.length.should.eql(1);
                return Promise.resolve();
            }).then(function(){
                smallPool.length.should.eql(1);

                return pool.acquire(function(client){
                    pool.length.should.eql(10);
                    return Promise.resolve();
                });
            });
        });
    });

    describe('#name', function(){
        it('should return the name of the pool', function(){
            pool.name.should.eql('test-pool');
            smallPool.name.should.eql('small-pool');
        });
    });

    describe('#availableLength', function(){
        it('should report the number of available resources', function(){
            pool.availableLength.should.eql(10);
            smallPool.availableLength.should.eql(0);

            return smallPool.acquire(function(client){
                smallPool.availableLength.should.eql(0);
                return Promise.resolve();
            }).then(function(){
                smallPool.availableLength.should.eql(1);

                return pool.acquire(function(client){
                    pool.availableLength.should.eql(9);
                    return Promise.resolve();
                });
            }).then(function(){
                pool.availableLength.should.eql(10);
            });
        });
    });

    describe('#waitingClientLength', function(){
        it('should report the number of clients waiting for resources', function(){
            pool.waitingClientLength.should.eql(0);
            smallPool.waitingClientLength.should.eql(0);

            var prom = null;
            return smallPool.acquire(function(client){
                smallPool.waitingClientLength.should.eql(0);

                prom = smallPool.acquire(function(client){
                    smallPool.waitingClientLength.should.eql(0);
                    return Promise.resolve();
                });

                smallPool.waitingClientLength.should.eql(1);
                return Promise.resolve();
            }).then(function(){ return prom; }).then(function(){
                smallPool.waitingClientLength.should.eql(0);
            });
        });
    });

    describe('#max', function(){
        it('should return the maximum number of resources the pool will create', function(){
            pool.max.should.eql(100);
            smallPool.max.should.eql(1);
        });

        it('should change the maximum number of resources when set', function(){
            smallPool.max.should.eql(1);
            smallPool.max = 10;
            smallPool.max.should.eql(10);
            return testPoolMax(smallPool);
        });

        it('should not set the maximum to below the minimum', function(){
            pool.max.should.eql(100);
            pool.max = 1;
            pool.max.should.eql(pool.min);
        });

        it('should refuse to set max to non-numeric values', function(){
            (function(){
                pool.max = 'foobar';
            }).should.throw('Pool `max` must be an integer.');
        });
    });

    describe('#min', function(){
        it('should return the minimum number of resources the pool will keep', function(){
            pool.min.should.eql(10);
            smallPool.min.should.eql(0);
        });

        it('should change the minimum number of resources when set', function(){
            pool.min.should.eql(10);
            pool.min = 20;
            pool.min.should.eql(20);
            return promTimeout(25).then(function(){
                pool.length.should.eql(pool.min);
            })
        });

        it('should not set the minimum to above the maximum', function(){
            pool.min.should.eql(10);
            pool.min = 1000;
            pool.min.should.eql(pool.max);
        });

        it('should refuse to set max to non-numeric values', function(){
            (function(){
                pool.min = 'foobar';
            }).should.throw('Pool `min` must be an integer.');
        });
    });
});

/**
 * Tests the enforcement of the pool's maximum size.
 *
 * @param {PromisePool} pool - The pool to test.
 *
 * @return {Promise} A promise to fully test the pool's enforcement of `max`.
 */
function testPoolMax(pool){
    const RELEASE_DELAY = 25;
    const MAX = pool.max;

    var ids = [];
    var objs = {};
    var acquisitions = [];

    // Acquire the maximum number of resources.
    var start = Date.now();
    for (var i = 0; i < MAX; ++i) {
        acquisitions.push(pool.acquire(function(obj){
            // This acquisition should not be delayed by earlier ones.
            var acquiredTime = Date.now();
            (acquiredTime - start).should.be.lessThan(RELEASE_DELAY);

            // This object should not have been previously acquired.
            objs.should.not.have.property(obj.id);
            objs[obj.id] = true;

            // Delay releasing the object.
            return promTimeout(RELEASE_DELAY);
        }));
    }

    // Our next acquisition should be delayed by the earlier ones.
    var delayedAcquireStart = Date.now();
    acquisitions.push(pool.acquire(function(obj){
        // This acquire should have been delayed.
        var acquiredTime = Date.now();
        (acquiredTime - delayedAcquireStart).should.be.within(RELEASE_DELAY, RELEASE_DELAY * 2);

        // This resource should have been previously acquired.
        objs.should.have.property(obj.id);

        return Promise.resolve();
    }));

    return Promise.all(acquisitions).then(function(){
        // The pool should be at maximum allocation now.
        pool.length.should.eql(MAX);
    });
}
