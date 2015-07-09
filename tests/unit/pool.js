

var should = require('should');

try {
    var PromisePool = require('../../lib-cov/PromisePool');
}
catch (err) {
    var PromisePool = require('../../lib/PromisePool');
}

describe('PromisePool', function(){
    var pool = null;
    var smallPool = null;

    beforeEach(function(){
        pool = new PromisePool({
            name: 'test-pool',
            max: 100,
            min: 10,
            create: function(){ return {}; },
            destroy: function(obj){}
        });

        smallPool = new PromisePool({
            name: 'small-pool',
            max: 1,
            min: 0,
            create: function(){ return {}; },
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
            var pool2 = new PromisePool({
                max: 1,
                create: function(){ return {}; },
                destroy: function(){}
            });

            var conn = null;
            var conn2 = null;
            var prom = null;
            return pool2.acquire(function(_conn){
                conn = _conn;

                prom = pool2.acquire(function(_conn2){
                    conn2 = _conn2;
                    conn.should.equal(conn2);
                    return Promise.resolve();
                });

                return new Promise(function(res){
                    setTimeout(res, 10);
                }).then(function(){
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
            }).catch(function(err){
                err.should.eql('Oh NO!');
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
    });

    describe('#drain', function(){
        it('should destroy all resources');
        it('should supply all waiting clients first');
        it('should wait for all resources to be returned');
    });

    describe('#destroyAllNow', function(){
        it('should destroy all available resources');
    });

    describe('#pooled', function(){
        it('should wrap the function with an acquisition');
        it('should call the wrapped function in the wrapper\'s context');
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
        it('should report the number of clients waiting for resources');
    });

    describe('#max', function(){
        it('should return the maximum number of resources the pool will create', function(){
            pool.max.should.eql(100);
            smallPool.max.should.eql(1);
        });
    });

    describe('#min', function(){
        it('should return the minimum number of resources the pool will keep', function(){
            pool.min.should.eql(10);
            smallPool.min.should.eql(0);
        });
    });
});
