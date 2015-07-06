
var util = require('util');

var makePromise = require('./promise').make;
var PriorityQueue = require('./PriorityQueue');

function PromisePool(opts) {
    this._opts = {
        // Configuration options
        name:               opts.name || 'pool',
        idleTimeoutMillis:  opts.idleTimeoutMillis || 30000,
        reapInterval:       opts.reapIntervalMillis || 1000,
        refreshIdle:        ('refreshIdle' in opts) ? opts.refreshIdle : true,
        returnToHead:       opts.returnToHead || false
        max:                parseInt(opts.max, 10),
        min:                parseInt(opts.min, 10),

        // Client management methods.
        create:     opts.create,
        destroy:    opts.destroy,
        validate:   opts.validate || function(){return true;}
    };

    this._availableObjects = [];
    this._waitingClients = new PriorityQueue(opts.priorityRange || 1);
    this._count = 0;
    this._removeIdleScheduled = false;
    this._removeIdleTimer = null;
    this._draining = false;

    // Prepare a logger function.
    if (opts.log instanceof Function) {
        this._log = opts.log;
    }
    else if (opts.log) {
        this._log = _logger.bind(this);
    }
    else {
        this._log = function(){};
    }

    // Clean up some of the inputs.
    this._validate = opts.validate || function(){ return true; };
    this._opts.max = Math.max(isNaN(this._opts.max) ? 1 : this._opts.max, 1);
    this._opts.min = Math.min(isNaN(this._opts.min) ? 0 : this._opts.min, this._opts.max-1);

    // Finally, ensure a minimum number of connections right out of the gate.
    _ensureMinimum.call(this);
}

// ---------------------------------------------------------------------------------------------- //

/**
 * @type PromisePool.Client
 *
 * Whatever client time the pool is, uh, pooling.
 */

/**
 * @type PromisePool.AcquireCallback
 *
 * Callback expected when acquiring a client. The returned promise will be used to manage the life
 * of the client. Once it is resolved or rejected the acquired client is released back into the
 * pool.
 *
 * @param {PromisePool.Client} client
 *  A newly acquired client from the pool.
 *
 * @return {Promise.<*>} A promise for whatever result the callback wants to send out.
 */

// ---------------------------------------------------------------------------------------------- //

function _logger(str, level) {
    console.log(level.toUpperCase() + " pool " + this._opts.name + " - " + str);
}

function _ensureMinimum() {
    // Nothing to do if draining.
    if (this._draining) {
        return Prmoise.resolve();
    }

    var diff = this._opts.min - this._count;
    var promises = [];
    for (var i = 0; i < diff; ++i) {
        promises.push(this.acquire(function(client){}));
    }

    return Promise.all(promises).then(function(){});
}

function _createResource() {
    this._log(
        util.format(
            'PromisePool._createResource() - creating client - count=%d min=%d max=%d',
            this._count, this._opts.min, this._opts.max
        ),
        'verbose'
    );

    return Promise.resolve(this._opts.create());
}

/**
 * Checks and removes the available (idle) clients that have timed out.
 *
 * @this PromisePool
 */
function _removeIdle() {
    var removals = [];
    var now = Date.now();

    this._removeIdleScheduled = false;

    // Go through the available (idle) items, check if they have timed out
    var availableLength = this._availableObjects.length;
    var minCount = this._count - this._opts.min;
    var refreshIdle = this._opts.refreshIdle;
    for (var i = 0; i < availableLength && (refreshIdle || (minCount > removals.length)); ++i) {
        var timeout = this._availableObjects[i].timeout;
        if (now >= timeout) {
            // Client timed out, so destroy it.
            this._log(
                'removeIdle() destroying obj - now:' + now + ' timeout:' + timeout,
                'verbose'
            );
            removals.push(this.destroy(this._availableObjects[i].obj));
        }
    }

    // Replace the available items with the ones to keep.
    if (this._availableObjects.length > 0) {
        this._log('availableObjects.length=' + this._availableObjects.length, 'verbose');
        _scheduleRemoveIdle.call(this);
    }
    else {
        this._log('removeIdle() all objects removed', 'verbose');
    }

    // Return a promise for when all the destructions have completed.
    return Promise.all(removals);
}

/**
 * Schedule removal of idle items in the pool.
 *
 * Only one removal at a time can be scheduled.
 *
 * @this PromisePool
 */
function _scheduleRemoveIdle(){
    if (!this._removeIdleScheduled) {
        this._removeIdleScheduled = true;
        this._removeIdleTimer = setTimeout(removeIdle.bind(this), this._opts.reapInterval);
    }
}

/**
 * @this PromisePool
 *
 * Try to get a new client to work, and clean up pool unused (idle) items.
 *
 *  - If there are available clients waiting, shift the first one out (LIFO), and call its callback.
 *  - If there are no waiting clients, try to create one if it won't exceed the maximum number of
 *    clients.
 *  - If creating a new client would exceed the maximum, add the client to the wait list.
 */
function _dispense() {
    var waitingCount = this._waitingClients.length;

    this._log(
        'dispense() clients=' + waitingCount + ' available=' + this._availableObjects.length,
        'info'
    );
    if (waitingCount > 0) {
        while (this._availableObjects.length > 0) {
            this._log('dispense() - reusing obj', 'verbose');
            var objWithTimeout = this._availableObjects[0];

            // Make sure the client is still valid before handing it back.
            if (!this._opts.validate(objWithTimeout.obj)) {
                this.destroy(objWithTimeout.obj); // Don't care about waiting for this.
                continue;
            }

            // We have a valid, idle client: ship it!
            this._availableObjects.shift();
            this._waitingClients.dequeue().resolve(objWithTimeout.obj);
        }
        if (this._count < this._opts.max) {
            var self = this;
            _createResource.call(this).then(function(client){
                ++self._count;
                self.waitingClients.dequeue().resolve(client);
            }, function(err){
                self.waitingClients.dequeue().reject(err);
            });
        }
    }
}

/**
 * Creates a filter usable for finding a client in the available clients list.
 *
 * @param {PromisePool.Client} obj
 *  The client to filter the list for.
 *
 * @param {bool} eql
 *  Indicates if the test should be for equality (`===`) or not (`!==`).
 *
 * @return {Function} A function which can be used for array filtering methods.
 */
function _objFilter(obj, eql) {
    return function(objWithTimeout){
        return eql ? obj === objWithTimeout.obj : obj !== objWithTimeout.obj;
    };
}

// ---------------------------------------------------------------------------------------------- //

/**
 * Request a new client. The callback will be called, when a new client will be availabe, passing
 * the client to it.
 *
 * @param {PromisePool.AcquireCallback} callback
 *  Callback function to be called after the acquire is successful. The function will receive the
 *  acquired item as the first parameter.
 *
 * @param {Number} priority
 *  Optional. Integer between 0 and (priorityRange - 1). Specifies the priority of the caller if
 *  there are no available resources. Lower numbers mean higher priority.
 *
 * @returns {Promise.<*>} A promise for the results of the acquire callback.
 */
PromisePool.prototype.acquire = function(callback, priority) {
    if (this._draining) {
        throw new Error("Pool is draining and cannot accept work");
    }

    var self = this;
    var waiter = {};
    waiter.promise = new Promise(function(resolve, reject){
        waiter.resolve  = resolve;
        waiter.reject   = reject;
    }).then(function(client){
        try {
            return Promise.resolve(callback(client))
                .then(
                    function(res){ self.release(client); return res; },
                    function(err){ self.release(client); throw err; }
                });
        }
        catch (err) {
            self.release(client);
            throw err;
        }
    });

    this._waitingClients.enqueue(waiter, priority);
    _dispense.call(this);
    return waiter.promise;
};

/**
 * Return the client to the pool, in case it is no longer required.
 *
 * @param {PromisePool.Client} obj
 *   The acquired object to be put back to the pool.
 */
PromisePool.prototype.release = function(obj) {
    // Check to see if this object has already been released (e.g. back in the pool of
    // availableObjects)
    if (availableObjects.some(_objFilter(obj, true)) {
        this._log('release called twice for the same resource: ' + (new Error().stack), 'error');
        return;
    }

    var objWithTimeout = {
        obj: obj,
        timeout: (Date.now() + idleTimeoutMillis)
    };
    if (returnToHead) {
        availableObjects.unshift(objWithTimeout);
    }
    else {
        availableObjects.push(objWithTimeout);
    }
    this._log('timeout: ' + objWithTimeout.timeout, 'verbose');
    _dispense.call(this);
    _scheduleRemoveIdle.call(this);
};

/**
 * Request the client to be destroyed. The factory's destroy handler
 * will also be called.
 *
 * This should be called within an acquire() block as an alternative to release().
 *
 * @param {PromisePool.Client} obj
 *   The acquired item to be destoyed.
 */
PromisePool.prototype.destroy = function(obj) {
    --this._count;
    this._availableObjects = this._availableObjects.filter(_objFilter(obj, false));

    return Promise.resolve(this._opts.destroy(obj)).then(_ensureMinimum.bind(this));
};

/**
 * Disallow any new requests and let the request backlog dissapate.
 *
 * After all clients have finished, the pool will then destroy all pooled resources.
 *
 * @return {Promise} A promise to let all clients finish and destroy all pooled objects.
 */
PromisePool.prototype.drain = function(){
    this._opts.log('draining', 'info');

    // Disable the ability to put more work on the queue.
    this._draining = true;

    var self = this;
    return new Promise(function(resolve, reject){
        function check(){
            if (self._waitingClients.size() > 0) {
                // Wait until all client requests have been satisfied.
                setTimeout(check, 100);
            }
            else if (self._availableObjects.length != self._count) {
                // Wait until all objects have been released.
                setTimeout(check, 100);
            }
            else {
                // We have no waiting clients, and all objects have been returned to the pool. Now
                // we clean up by destroying everything.
                return self.destroyAllNow();
            }
        };
        check();
    });
};

/**
 * Forcibly destroys all clients regardless of timeout.
 *
 * Intended to be invoked as part of a drain. Does not prevent the creation of new clients as a
 * result of subsequent calls to acquire.
 *
 * Note that if `factory.min > 0` and the pool is not draining, the pool will destroy all idle
 * resources in the pool, but replace them with newly created resources up to the specified
 * `factory.min` value. If this is not desired, set `factory.min` to zero before calling
 * `PromisePool#destroyAllNow()`.
 *
 * @return {Promise} A promise to have all objects in the pool destroyed.
 */
PromisePool.prototype.destroyAllNow = function() {
    this._opts.log('force destroying all objects', 'info');

    // Stop the idle object removal checker, we're about to remove all of them now.
    this._removeIdleScheduled = false;
    clearTimeout(this._removeIdleTimer);

    // Repeatedly call destroy until no more objects are available.
    var destroyPromises = [];
    while (self._availableObjects.length > 0) {
        destroyPromises.push(self.destroy(self._availableObjects[0]));
    }
    Promise.all(destroyPromises).then(function(){ resolve(); }, reject);
};

/**
 * Decorates a function to use a acquired client from the object pool when called.
 *
 * @param {PromisePool.AcquireCallback} decorated
 *  The decorated function, accepting a client as the first argument and returning a promise.
 *
 * @param {Number} priority
 *  Optional. Integer between 0 and (priorityRange - 1). Specifies the priority of the caller if
 *  there are no available resources. Lower numbers mean higher priority.
 *
 * @return {Function} A function wrapping `decorated` by first acquiring a client.
 */
PromisePool.prototype.pooled = function(decorated, priority){
    var self = this;
    var slice = Array.prototype.slice;
    return function(){
        var args = slice.call(arguments);
        return self.acquire(function(client){
            args.shift(client);
            return decorated.apply(null, args);
        }, priority);
    };
};

Object.defineProperty(PromisePool.prototype, 'length', {
    get: function(){ return this._count; },
    enumerable: true
});

Object.defineProperty(PromisePool.prototype, 'name', {
    get: function(){ return this._opts.name; },
    enumerable: true
});

Object.defineProperty(PromisePool.prototype, 'availableLength', {
    get: function(){ return this._availableObjects.length; },
    enumerable: true
});

Object.defineProperty(PromisePool.prototype, 'waitingClientLength', {
    get: function(){ return this._waitingClients.length; },
    enumerable: true
});

Object.defineProperty(PromisePool.prototype, 'max', {
    get: function(){ return this._opts.max; },
    enumerable: true
});

Object.defineProperty(PromisePool.prototype, 'min', {
    get: function(){ return this._opts.min; },
    enumerable: true
});

module.exports = PromisePool;
