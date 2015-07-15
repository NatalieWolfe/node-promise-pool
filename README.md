# Promise Pool [![Build Status][1]][2] [![Coverage Status][3]][4]
Promise-based connection pooling library built on generic-pool.

## Installation
```sh
$ npm install generic-promise-pool
```

## Examples

### Creating a Pool
This example creates a pool that uses a hypothetical promise-based MySQL library.
```js
var mysql = require('promise-mysql');
var pool = require('generic-promise-pool');

var mysqlPool = pool.create({
    name    : 'mysql',  // An optional name for the pool.
    max     : 10,       // Optional limit for how many connections to allow.
    min     : 2,        // Optional minimum number of connections to keep in the pool.
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
http://NatalieWolfe.github.io/node-promise-pool/docs/PromisePool.Factory.html

### Using the Pool
In this example we get a connection from the pool and use it to make a query.
```js
mysqlPool.acquire(function(conn){
    // The connection remains acquired until the promise returned by this function is resolved or
    // rejected.
    return conn.query('SELECT * FROM `books` WHERE `author` = "Neal Stephenson"');
}).then(function(res){
    // The connection has been released back to the pool before we get here, and the results from
    // the acquire callback is propagated out.
    res.forEach(console.log.bind(console));
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

[1]: https://travis-ci.org/NatalieWolfe/node-promise-pool.svg?branch=master
[2]: https://travis-ci.org/NatalieWolfe/node-promise-pool
[3]: https://coveralls.io/repos/NatalieWolfe/node-promise-pool/badge.svg
[4]: https://coveralls.io/r/NatalieWolfe/node-promise-pool
