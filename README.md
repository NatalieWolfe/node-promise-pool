# Promise Pool [![Build Status][1]][2] [![Coverage Status][3]][4]
Promise-based connection pooling library inspired by generic-pool.

## Installation
```sh
$ npm install generic-promise-pool
```

## Documentation
The full generated [JSDoc](http://usejsdoc.org/) documentation is hosted on GitHub here:
https://NatalieWolfe.github.io/node-promise-pool/docs/. You can also find the documentation as a
single markdown file at `docs.md`. All of the [options used for configuring](#pool-factory-options)
a pool are at the end of this README.

## Examples

### Creating a Pool
This example creates a pool that uses a hypothetical promise-based MySQL library.
```js
var mysql = require('promise-mysql');
var pool = require('generic-promise-pool');

var mysqlPool = pool.create({
    name    : 'mysql',  // An optional name for the pool.
    max     : 10,       // Optional limit for how many connections to allow.
    min     : 2,        // Optional minimum connections to keep in the pool.
    create  : function(){
        var conn = mysql.createConnection(mysqlConnOptions);
        return conn.connect();
    },
    destroy : function(conn){
        return conn.end();
    }
});
```

For a full list of options that the `PromisePool` accepts, see the documentation on GitHub:
https://NatalieWolfe.github.io/node-promise-pool/docs/PromisePool.Factory.html

### Using the Pool
In this example we get a connection from the pool and use it to make a query.
```js
mysqlPool.acquire(function(conn){
    // The connection remains acquired until the promise returned by this
    // function is resolved or rejected.
    return conn.query('SELECT * FROM books WHERE author = "Neal Stephenson"');
}).then(function(res){
    // The connection has been released back to the pool before we get here,
    // and the results from the acquire callback is propagated out.
    res.forEach(function(row){ console.dir(row); });
}, function(err){
    console.error(err);
});
```

### Draining the Pool
When you want to shut down your application, it can be quite annoying to wait for idle connections
to close naturally. To get past this, drain the pool before shutting down.
```js
mysqlPool.drain()
    .then(function(){
        console.log('The pool has drained, and all connections destroyed.');
    });
```

## Pool Factory Options
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | Name of the pool. Used only for logging. |
| create | <code>[create](#PromisePool.Factory.create)</code> | Should create the item to be acquired, and return either a promise or the new client. |
| destroy | <code>[destroy](#PromisePool.Factory.destroy)</code> | Should gently close any resources that the item is using. Called to destroy resources. |
| validate | <code>[validate](#PromisePool.Factory.validate)</code> | Optional. Should return true if the resource is still valid and false if it should be removed  from the pool. Called before a resource is acquired from the pool. |
| onRelease | <code>[onRelease](#PromisePool.Factory.onRelease)</code> | Optional. May return a promise to indicate when a client is ready to be added back to the pool  after being released. |
| max | <code>number</code> | Optional. Maximum number of items that can exist at the same time. Any further acquire requests  will be pushed to the waiting list. Defaults to `1`. |
| min | <code>number</code> | Optional. Minimum number of items in pool (including in-use). When the pool is created, or a  resource destroyed, this minimum will be checked. If the pool resource count is below the  minimum a new resource will be created and added to the pool. Defaults to `0`. |
| idleTimeoutMillis | <code>number</code> | Optional. Maximum period for resources to be idle (e.g. not acquired) before they are destroyed.  Defaults to `30000` (30 seconds). |
| reapIntervalMillis | <code>number</code> | Optional. How frequently the pool will check for idle resources that need to be destroyed.  Defaults to `1000` (1 second). |
| drainCheckIntervalMillis | <code>number</code> | Optional. How frequently the pool will check the status of waiting clients and unreturned  resources before destroying all the resources. Defaults to `100` (1/10th a second). |
| log | <code>bool</code> &#124; <code>[log](#PromisePool.Factory.log)</code> | Optional. Whether the pool should log activity. If a function is provided, it will be called to  log messages. If `true` is provided, messages are logged to `console.log`. Defaults to `false`. |
| priorityRange | <code>number</code> | Optional. The range from 1 to be treated as a valid priority. Default is `1`. |
| refreshIdle | <code>bool</code> | Optional. Indicates if idle resources should be destroyed when left idle for `idleTimeoutMillis`  milliseconds. Defaults to true. |
| returnToHead | <code>bool</code> | Optional. Returns released object to the head of the available objects list. Default is false. |

<a name="PromisePool.Factory.create"></a>
### Factory.create ⇒ <code>Promise.&lt;PromisePool.Client&gt;</code>
**Kind**: static typedef of <code>[Factory](#PromisePool.Factory)</code>  
**Returns**: <code>Promise.&lt;PromisePool.Client&gt;</code> - A promise for a new client.  
<a name="PromisePool.Factory.destroy"></a>
### Factory.destroy ⇒ <code>Promise</code>
**Kind**: static typedef of <code>[Factory](#PromisePool.Factory)</code>  
**Returns**: <code>Promise</code> - If destruction is asynchronous, a promise should be returned that will resolve
 after the client is destroyed.  

| Param | Type | Description |
| --- | --- | --- |
| client | <code>PromisePool.Client</code> | A resource that had been created earlier. |

<a name="PromisePool.Factory.validate"></a>
### Factory.validate ⇒ <code>bool</code>
**Kind**: static typedef of <code>[Factory](#PromisePool.Factory)</code>  
**Returns**: <code>bool</code> - True if the resource is still valid, otherwise false should be returned.  

| Param | Type | Description |
| --- | --- | --- |
| client | <code>PromisePool.Client</code> | A resource that had been created earlier. |

<a name="PromisePool.Factory.onRelease"></a>
### Factory.onRelease ⇒ <code>Promise.&lt;\*&gt;</code>
**Kind**: static typedef of <code>[Factory](#PromisePool.Factory)</code>  
**Returns**: <code>Promise.&lt;\*&gt;</code> - May return a promise, in which case the client wont join the pool until
 the promise resolves. If it is rejected, then the client will be destroyed instead.  

| Param | Type | Description |
| --- | --- | --- |
| client | <code>PromisePool.Client</code> | A resource that has been released back to the pool. |

<a name="PromisePool.Factory.log"></a>
### Factory.log : <code>function</code>
**Kind**: static typedef of <code>[Factory](#PromisePool.Factory)</code>  

| Param | Type | Description |
| --- | --- | --- |
| msg | <code>string</code> | The message to be logged. |
| level | <code>string</code> | The importance of this log message. Possible values are: `verbose`, `info`, and `error`. |


[1]: https://travis-ci.org/NatalieWolfe/node-promise-pool.svg?branch=master
[2]: https://travis-ci.org/NatalieWolfe/node-promise-pool
[3]: https://coveralls.io/repos/NatalieWolfe/node-promise-pool/badge.svg
[4]: https://coveralls.io/r/NatalieWolfe/node-promise-pool
