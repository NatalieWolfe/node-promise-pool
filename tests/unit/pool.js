

var should = require('should');

var PromisePool = require('../..').PromisePool;

describe('PromisePool', function(){
    var pool = null;

    beforeEach(function(){
        pool = new PromisePool({
            name: 'test-pool',
            max: 100,
            min: 10,
            log: false,
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
    });
});
