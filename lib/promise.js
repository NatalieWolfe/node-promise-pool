
var _Promise = null;
var _createPromise = null;

if (global.Promise) {
    _Promise = global.Promise;
    _createPromise = _makeES6Promise;
}
else {
    try {
        _Promise = require('q');
    }
    catch (err) {
        _Promise = null;
    }
}

exports.class = _Promise;
exports.create = _createPromise;
exports.set = function(promiser) {
    var p = promiser(function(res, rej){});
    exports.class = p.__proto__.constructor;
    exports.create = promiser;
};

function _makeES6Promise(task) {
    return new _Promise(task);
}
