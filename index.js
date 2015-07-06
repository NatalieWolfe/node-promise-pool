
var Pool = exports.Pool = require('./lib/PromisePool');

exports.create = function(opts){
    return new Pool(opts);
};
