var config = require('../config');
var api = require('../api');
var async = require('async');

function checkSubscriptions() {
    var redisClient = config.getRedisClient();
    var unixTimestamp = Math.floor(Date.now() / 1000);
    redisClient.zrangebyscore(config.getSettings().redisRecurringSubscriptions, unixTimestamp - config.getSettings().subscriptionAdditionalCheckTtl, unixTimestamp, function(err, keys) {
        if (err) {
            return console.error('check-subscriptions error', err)
        }

        if (keys.length) {
            console.log('Need to refresh ' + keys.length + ' subscriptions');

            var tasks = keys.map(function(key) {
                return function(cb) {
                    api.renewSubscription(key, cb);
                }
            });

            if (tasks.length) {
                async.parallelLimit(tasks, 10, function(err) {
                    console.log("Refreshed all subscriptions.")
                });
            }
        }
    })
}

function start() {
    console.log('Starting scheduler')
    var loop = function() {
        checkSubscriptions();
        setTimeout(loop, 10000);
    };
    loop();
}

module.exports = {
    start: start
};