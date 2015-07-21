
var util = require('util');

var PriorityQueue = require('./PriorityQueue');

/**
 * Constructs a new pool with the provided factory options.
 *
 * @constructor
 * @classdesc
 * A resource pooling class with a promise-based API.
 *
 * @param {PromisePool.Factory} opts
 *  The connection factory which specifies the functionality for the pool.
 */
function PromisePool(opts) {
    this._opts = {
        // Configuration options
        name:               opts.name || 'pool',
        idleTimeoutMillis:  opts.idleTimeoutMillis || 30000,
        reapInterval:       opts.reapIntervalMillis || 1000,
        drainCheckInterval: opts.drainCheckIntervalMillis || 100,
        refreshIdle:        ('refreshIdle' in opts) ? opts.refreshIdle : true,
        returnToHead:       opts.returnToHead || false,
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
 * @callback PromisePool.AcquireCallback
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

/**
 * @callback PromisePool.Factory.create
 *
 * Function used to create new resources. It is expected to return either a new `PromisePool.Client`
 * or a promise for one.
 *
 * @return {Promise.<PromisePool.Client>} A promise for a new client.
 */

/**
 * @callback PromisePool.Factory.destroy
 *
 * Function used to destroy resources. The returned promise should resolve when the resource has
 * been fully destroyed.
 *
 * @param {PromisePool.Client} client - A resource that had been created earlier.
 *
 * @return {?Promise} If destruction is asynchronous, a promise should be returned that will resolve
 *  after the client is destroyed.
 */

/**
 * @callback PromisePool.Factory.validate
 *
 * A function that checks the validity of a resource before it is handed to waiting clients.
 *
 * @param {PromisePool.Client} client - A resource that had been created earlier.
 *
 * @return {bool} True if the resource is still valid, otherwise false should be returned.
 */

/**
 * @callback PromisePool.Factory.log
 *
 * A function taking a log message and a log level.
 *
 * @param {string} msg
 *  The message to be logged.
 *
 * @param {string} level
 *  The importance of this log message. Possible values are: `verbose`, `info`, and `error`.
 */

/**
 * @namespace PromisePool.Factory
 *
 * @property {string} name
 *  Name of the pool. Used only for logging.
 *
 * @property {PromisePool.Factory.create} create
 *  Should create the item to be acquired, and return either a promise or the new client.
 *
 * @property {PromisePool.Factory.destroy} destroy
 *  Should gently close any resources that the item is using. Called to destroy resources.
 *
 * @property {PromisePool.Factory.validate} validate
 *  Optional. Should return true if the resource is still valid and false if it should be removed
 *  from the pool. Called before a resource is acquired from the pool.
 *
 * @property {number} max
 *  Optional. Maximum number of items that can exist at the same time. Any further acquire requests
 *  will be pushed to the waiting list. Defaults to `1`.
 *
 * @property {number} min
 *  Optional. Minimum number of items in pool (including in-use). When the pool is created, or a
 *  resource destroyed, this minimum will be checked. If the pool resource count is below the
 *  minimum a new resource will be created and added to the pool. Defaults to `0`.
 *
 * @property {number} idleTimeoutMillis
 *  Optional. Maximum period for resources to be idle (e.g. not acquired) before they are destroyed.
 *  Defaults to `30000` (30 seconds).
 *
 * @property {number} reapIntervalMillis
 *  Optional. How frequently the pool will check for idle resources that need to be destroyed.
 *  Defaults to `1000` (1 second).
 *
 * @property {number} drainCheckIntervalMillis
 *  Optional. How frequently the pool will check the status of waiting clients and unreturned
 *  resources before destroying all the resources. Defaults to `100` (1/10th a second).
 *
 * @property {bool|PromisePool.Factory.log} log
 *  Optional. Whether the pool should log activity. If a function is provided, it will be called to
 *  log messages. If `true` is provided, messages are logged to `console.log`. Defaults to `false`.
 *
 * @property {number} priorityRange
 *  Optional. The range from 1 to be treated as a valid priority. Default is `1`.
 *
 * @property {bool} refreshIdle
 *  Optional. Indicates if idle resources should be destroyed when left idle for `idleTimeoutMillis`
 *  milliseconds. Defaults to true.
 *
 * @property {bool} returnToHead
 *  Optional. Returns released object to the head of the available objects list. Default is false.
 */

// ---------------------------------------------------------------------------------------------- //

/**
 * Default logging method, just logs to `console.log`.
 *
 * @private
 * @memberof PromisePool
 *
 * @param {string}
 */
function _logger(str, level) {
    console.log(level.toUpperCase() + " pool " + this._opts.name + " - " + str);
}

/**
 * Constructs more resources to bring the current count up to the minimum specified in the factory.
 *
 * @private
 * @memberof PromisePool
 *
 * @return {Promise} A promise to create all the resources needed.
 */
function _ensureMinimum() {
    // Nothing to do if draining.
    if (this._draining) {
        return Promise.resolve();
    }

    var diff = this._opts.min - this._count;
    var promises = [];
    for (var i = 0; i < diff; ++i) {
        promises.push(this.acquire(function(client){ return Promise.resolve(); }));
    }

    return Promise.all(promises).then(function(){});
}

/**
 * Constructs a new resource.
 *
 * @private
 * @memberof PromisePool
 */
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
 * @private
 * @memberof PromisePool
 */
function _removeIdle() {
    var removals = [];
    var now = Date.now();

    this._removeIdleScheduled = false;

    // Go through the available (idle) items, check if they have timed out
    var minCount = this._count - this._opts.min;
    var refreshIdle = this._opts.refreshIdle;
    for (
        var i = 0;
        i < this._availableObjects.length && (refreshIdle || (minCount > removals.length));
        ++i
    ) {
        var timeout = this._availableObjects[i].timeout;
        if (now >= timeout) {
            // Client timed out, so destroy it.
            this._log(
                'removeIdle() destroying obj - now:' + now + ' timeout:' + timeout,
                'verbose'
            );
            removals.push(this.destroy(this._availableObjects[i].obj));
            --i;
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
 * @private
 * @memberof PromisePool
 */
function _scheduleRemoveIdle(){
    if (!this._removeIdleScheduled) {
        this._removeIdleScheduled = true;
        this._removeIdleTimer = setTimeout(_removeIdle.bind(this), this._opts.reapInterval);
    }
}

/**
 * Try to get a new client to work, and clean up pool unused (idle) items.
 *
 * @private
 * @memberof PromisePool
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
            return; // Only dispense one.
        }
        if (this._count < this._opts.max) {
            var self = this;
            ++this._count;
            _createResource.call(this).then(function(client){
                self._waitingClients.dequeue().resolve(client);
            }, function(err){
                --self._count;
                self._waitingClients.dequeue().reject(err);
            });
        }
    }
}

/**
 * Creates a filter usable for finding a client in the available clients list.
 *
 * @private
 * @memberof PromisePool
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
        return (eql ? (obj === objWithTimeout.obj) : (obj !== objWithTimeout.obj));
    };
}

// ---------------------------------------------------------------------------------------------- //

/**
 * Request a new client. The callback will be called with a client when one becomes available.
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
        return new Promise(function(resolve, reject){
            try {
                return callback(client)
                    .then(
                        function(res){ self.release(client); resolve(res); },
                        function(err){ self.release(client); reject(err); }
                    );
            }
            catch (err) {
                self.release(client);
                reject(err);
            }
        });
    });

    this._waitingClients.enqueue(waiter, priority);
    process.nextTick(_dispense.bind(this));
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
    if (this._availableObjects.some(_objFilter(obj, true))) {
        this._log('release called twice for the same resource: ' + (new Error().stack), 'error');
        return;
    }

    if (obj.__promisePool_destroyed) {
        this._log('Released resource is destroyed, not returning to pool.', 'info');
    }
    else {
        var objWithTimeout = {
            obj: obj,
            timeout: (Date.now() + this._opts.idleTimeoutMillis)
        };
        if (this._opts.returnToHead) {
            this._availableObjects.unshift(objWithTimeout);
        }
        else {
            this._availableObjects.push(objWithTimeout);
        }

        this._log('timeout: ' + objWithTimeout.timeout, 'verbose');
    }

    process.nextTick(_dispense.bind(this));
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
    this._log('Destroying object, count=' + this._count, 'verbose');
    --this._count;
    this._availableObjects = this._availableObjects.filter(_objFilter(obj, false));

    var self = this;
    return Promise.resolve(this._opts.destroy(obj))
        .then(function(){
            obj.__promisePool_destroyed = true;
            return _ensureMinimum.call(self);
        });
};

/**
 * Disallow any new requests and let the request backlog dissapate.
 *
 * After all clients have finished, the pool will then destroy all pooled resources.
 *
 * @return {Promise} A promise to let all clients finish and destroy all pooled objects.
 */
PromisePool.prototype.drain = function(){
    this._log('draining', 'info');

    // Disable the ability to put more work on the queue.
    this._draining = true;

    var self = this;
    return new Promise(function(resolve, reject){
        function check(){
            if (self._waitingClients.length > 0) {
                // Wait until all client requests have been satisfied.
                self._log(
                    'Delaying drain, ' + self._waitingClients.length + ' clients in queue.',
                    'verbose'
                );
                setTimeout(check, self._opts.drainCheckInterval);
            }
            else if (self._availableObjects.length < self._count) {
                // Wait until all objects have been released.
                var missingCount = self._count - self._availableObjects.length;
                self._log(
                    'Delaying drain, ' + missingCount + ' items need to be released.',
                    'verbose'
                );
                setTimeout(check, self._opts.drainCheckInterval);
            }
            else {
                // We have no waiting clients, and all objects have been returned to the pool. Now
                // we clean up by destroying everything.
                self.destroyAllNow().then(resolve, reject);
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
    this._log('force destroying all objects', 'info');

    // Stop the idle object removal checker, we're about to remove all of them now.
    this._removeIdleScheduled = false;
    clearTimeout(this._removeIdleTimer);

    // Repeatedly call destroy until no more objects are available.
    var destroyPromises = [];
    while (this._availableObjects.length > 0) {
        destroyPromises.push(this.destroy(this._availableObjects[0].obj));
    }

    return Promise.all(destroyPromises).then(function(){});
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
        var wrappedSelf = this;
        return self.acquire(function(client){
            args.unshift(client);
            return decorated.apply(wrappedSelf, args);
        }, priority);
    };
};

/**
 * The total number of resources in the pool.
 *
 * @readonly
 * @member {number} PromisePool.prototype.length
 */
Object.defineProperty(PromisePool.prototype, 'length', {
    get: function(){ return this._count; },
    enumerable: true
});

/**
 * The name of the pool, as provided in the factory.
 *
 * @readonly
 * @member {string} PromisePool.prototype.name
 */
Object.defineProperty(PromisePool.prototype, 'name', {
    get: function(){ return this._opts.name; },
    enumerable: true
});

/**
 * The number of available (e.g. idle) resources in the pool.
 *
 * @readonly
 * @member {number} PromisePool.prototype.availableLength
 */
Object.defineProperty(PromisePool.prototype, 'availableLength', {
    get: function(){ return this._availableObjects.length; },
    enumerable: true
});

/**
 * The number of clients currently waiting for a resource to become available/be created.
 *
 * @readonly
 * @member {number} PromisePool.prototype.waitingClientLength
 */
Object.defineProperty(PromisePool.prototype, 'waitingClientLength', {
    get: function(){ return this._waitingClients.length; },
    enumerable: true
});

/**
 * The maximum number of resources this pool will create.
 *
 * @readonly
 * @member {number} PromisePool.prototype.max
 */
Object.defineProperty(PromisePool.prototype, 'max', {
    get: function(){ return this._opts.max; },
    enumerable: true
});

/**
 * The minimum number of resources the pool will keep at any given time.
 *
 * @readonly
 * @member {number} PromisePool.prototype.min
 */
Object.defineProperty(PromisePool.prototype, 'min', {
    get: function(){ return this._opts.min; },
    enumerable: true
});

module.exports = PromisePool;
