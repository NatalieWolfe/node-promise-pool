
var PromisePool = exports.PromisePool = require('./lib/PromisePool');

exports.create = function createPool(opts){
    return new PromisePool(opts);
};
