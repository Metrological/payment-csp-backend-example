var express = require('express'),
    config = require('./config'),
    cluster = require('cluster');


var startServer = function(){
    config.init(function(err) {
        if (err) {
            console.error('init', err);
            return;
        }

        if(cluster.isMaster){
            var workers = config.getSettings().workers;
            console.log('starting ' + workers + ' workers.');
            for(var i = 0; i < workers; i++){
                cluster.fork();
            }
        }else{
            var app = express();
            config.initExpress(app);
            require('./api').loadRoutes(app);
        }
    });
};

startServer();













