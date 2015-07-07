

var should = require('should');

try {
    var PromisePool = require('../../lib-cov/PromisePool');
}
catch (err) {
    var PromisePool = require('../../lib/PromisePool');
}

describe('PromisePool', function(){
    var pool = null;

    beforeEach(function(){
        pool = new PromisePool({
            name: 'test-pool',
            max: 100,
            min: 10,
            create: function(){ return {}; },
            destroy: function(obj){}
        });
    });

    afterEach(function(){
        pool.drain();
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
            return pool2.acquire(function(_conn){
                conn = _conn;

                var prom = pool2.acquire(function(_conn2){
                    conn2 = _conn2;
                    conn.should.equal(conn2);
                    return Promise.resolve();
                });

                return new Promise(function(res){
                    setTimeout(res, 10);
                }).then(function(){
                    should.not.exist(conn2);
                });
            }).then(function(){
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
    });
});
