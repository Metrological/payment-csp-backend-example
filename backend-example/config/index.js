var allSettings = require('./settings');
var _ = require('lodash');
var settings = {}, env;
var bodyParser = require('body-parser');
var redis = require("redis");

var init = function(cb){
    env = process.env.NODE_ENV || 'dev';

    var baseSettings = allSettings['all'];

    if(allSettings[env])
        var envSettings = allSettings[env];
    else{
        var envSettings = allSettings.dev;
        env = 'dev';
    }

    settings = _.merge(baseSettings, envSettings);

    cb();
};


var initExpress = function(app){
    app.use(bodyParser.json());
    app.disable('x-powered-by');

    var port = settings.port;
    app.listen(port,function () {
        console.info('Listening on ' + port);
    }).on('error', function (e) {
        console.error(e);
    });

    process.on('uncaughtException', function (exception) {
        var os = require('os');
        var interfaces = os.networkInterfaces();
        var addresses = [];
        for (var k in interfaces) {
            for (var k2 in interfaces[k]) {
                var address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    addresses.push(address.address);
                }
            }
        }

        console.error('uncaughtException', addresses, exception);
        throw exception;
    });
};


var getSettings = function(){
    return settings;
};

var getEnv = function(){
    return env;
};

var redisClient;
var getRedisClient = function() {
    var settings = getSettings();
    if (!redisClient) {
        redisClient = redis.createClient({host: settings.redis.host, port: settings.redis.port});
    }
    return redisClient;
};

module.exports = {
    getSettings: getSettings,
    init: init,
    initExpress: initExpress,
    getEnv: getEnv,
    getRedisClient: getRedisClient
};
