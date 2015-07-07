
var should = require('should');

var promisePool = require('../..');

describe('promise-pool', function(){
    describe('.create', function(){
        var pool = null;

        beforeEach(function(){
            pool = promisePool.create({
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

        it('should create a pool', function(){
            pool.should.be.an.instanceOf(promisePool.PromisePool);
        });
    });
});
