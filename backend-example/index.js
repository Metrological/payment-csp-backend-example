var express = require('express'),
    config = require('./config');


var startServer = function(){
    config.init(function(err) {
        if (err) {
            console.error('init', err);
            return;
        }
        var app = express();
        config.initExpress(app);
        require('./api').loadRoutes(app);
    });
};

startServer();













