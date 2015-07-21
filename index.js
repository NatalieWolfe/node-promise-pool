
/**
 * The items exported by the `generic-promise-pool` package.
 *
 * @namespace exports
 */

/**
 * The resource pooling class.
 *
 * @name exports.PromisePool
 */
var PromisePool = exports.PromisePool = require('./lib/PromisePool');

/**
 * Creates a new resource pool.
 *
 * @name exports.create
 *
 * @param {PromisePool.Factory} opts - Options for the new resource pool.
 *
 * @return {PromisePool} A new promise pool.
 */
exports.create = function createPool(opts){
    return new PromisePool(opts);
};
