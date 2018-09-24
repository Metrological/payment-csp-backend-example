var express = require('express'),
    config = require('./config'),
    scheduler = require('./scheduler');


config.init(function(err) {
    if (err) {
        console.error('init', err);
        return;
    }
    var app = express();
    config.initExpress(app);
    require('./api').loadRoutes(app);

    // Start scheduler for automatically renewing subscriptions.
    // Notice that when using a cluster, only one scheduler should has to be active.
    scheduler.start();
});

