var config = require('./config');

config.init(function(err) {
    if (err) {
        console.error('init', err);
        return;
    }

    require('./api').invoiceSubscriptions(function(err) {
        process.exit(err ? 1 : 0)
    });
});













