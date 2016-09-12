'use strict';

var util = require('util');

var LEVELS = [
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'fatal'
];

/**
 * Does nothing.
 *
 * @private
 *
 * @return {undefined}
 */
function _noop() {}

/**
 * Formats logger messages into a single string.
 *
 * @private
 *
 * @param {object} [extra] - Extra logger data.
 * @param {string} message - String message to log.
 * @param {*} [formatArgs] - Formatting values for the message.
 *
 * @return {string} The formatted logger message.
 */
function _format(extra, message, formatArgs) {
    if (typeof extra === 'string') {
        return util.format.apply(util, arguments);
    }
    else {
        var len = arguments.length - 1;
        var args = new Array(len);
        for (var i = 0; i < len; ++i) {
            args[i] = arguments[i + 1];
        }
        return util.format.apply(util, args) + ' (' + JSON.stringify(extra, null, 2) + ')';
    }
}

/**
 * Creates a logger object that will format log messages before calling the `log` function.
 *
 * @private
 *
 * @param {string}      name    - The name of the pool this logger is for.
 * @param {function}    log     - The logging function.
 *
 * @return {object} An object with logging methods.
 */
function fromFunction(name, log) {
    var msgPrefix = 'pool ' + name + ' - ';
    return LEVELS.reduce(function(logger, level) {
        logger[level] = function() {
            log(msgPrefix + _format.apply(null, arguments), level);
        };
        return logger;
    }, {});
}

/**
 * Creates a logger object that logs to the console.
 *
 * @private
 *
 * @param {string} name - The name of the pool.
 *
 * @return {object} An object with logging methods.
 */
function makeConsole(name) {
    return fromFunction(name, function(message, level) {
        /* eslint-disable no-console */
        console.log(level.toUpperCase(), message);
        /* eslint-enable no-console */
    });
}

exports.LEVELS = LEVELS;
exports.makeConsole = makeConsole;
exports.fromFunction = fromFunction;
exports.noop = LEVELS.reduce(function(logger, level) {
    logger[level] = _noop;
    return logger;
}, {});
