'use strict';

module.exports = function(lib) {
    try {
        return require('../../lib-cov/' + lib);
    }
    catch (err) {
        return require('../../lib/' + lib);
    }
};
