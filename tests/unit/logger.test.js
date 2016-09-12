'use strict';

var should = require('should');
var sinon = require('sinon');
require('should-sinon');

var testRequire = require('../lib/require');
var logger = testRequire('logger');

describe('logger', function() {
    describe('.noop', function() {
        it('should have all the required logging methods', function() {
            _checkLoggingMethods(logger.noop);
        });

        it('should do nothing');
    });

    describe('.makeConsole', function() {
        it('should return an object with the required logging methods', function() {
            _checkLoggingMethods(logger.makeConsole('foo'));
        });

        describe('return value', function() {
            /* eslint-disable no-console */
            var originalLog = console.log;
            var log = null;

            beforeEach(function() {
                console.log = sinon.spy();
                log = logger.makeConsole('foo');
            });

            afterEach(function() {
                console.log = originalLog;
            });

            it('should log to console.log', function() {
                log.info('message');
                console.log.should.be.calledWith('INFO', 'pool foo - message');
            });
            /* eslint-enable no-console */
        });
    });

    describe('.fromFunction', function() {
        it('should return an object with the required logging methods', function() {
            _checkLoggingMethods(logger.fromFunction(function() {}));
        });

        describe('return value', function() {
            var logSpy;
            var log = null;

            beforeEach(function() {
                logSpy = sinon.spy();
                log = logger.fromFunction('foo', logSpy);
            });

            it('should log to the provided function', function() {
                log.info('message');
                logSpy.should.be.calledWith('pool foo - message', 'info');
            });
        });
    });
});

function _checkLoggingMethods(log) {
    should.exist(log);
    logger.LEVELS.forEach(function(level) {
        log.should.have.property(level).which.is.a.Function();
    });
}
