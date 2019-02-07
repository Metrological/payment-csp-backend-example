/**
 * Metrlogical Payment SDK backend example.
 *
 * Notice that this is example code only. It is meant to explain how the payment API is meant to be used from a
 * Content Service Provider backend perspective. However, nothing will be stored or logged. We advice to use a
 * relational database in production.
 */

var config = require('../config');
var signatureHelper = require('./signatureHelper');
var async = require('async');
var request = require('request');

var loadRoutes = function(app){
    app.get('/get-asset-status', handleAssetStatus);
    app.get('/get-asset-signature', handleAssetSignature);
    app.post('/save-asset', handleSaveAsset);
    app.post('/unsubscribe-asset', handleUnsubscribeAsset);
    app.get('/list-assets', handleListAssets);

    app.all('*',function(req,res){
        res.status(404).end();
    });
};

module.exports = {
    loadRoutes: loadRoutes,
    renewSubscription: renewSubscription
};

function getAssetKey(assetId, householdHash) {
    return config.getSettings().redisHouseholdAssetsPrefix + householdHash + ":" + assetId;
}

var TTL = 24 * 3600;

var CURRENCY = 'EUR';

var ASSETS = {
    "the-shawshank-redemption": {"title": "The Shawshank Redemption", "price": 299, "currency": CURRENCY, "ttl": TTL, "stream": "http://video.metrological.com/sunset.mp4"},
    "the-godfather": {"title": "The Godfather", "price": 199, "currency": CURRENCY, "ttl": TTL, "stream": "http://video.metrological.com/aquarium.mp4"},
    "the-dark-knight": {"title": "The Dark Knight", "price": 199, "currency": CURRENCY, "ttl": TTL, "stream": "http://video.metrological.com/sea.mp4"},
    "greenland-live-stream": {"title": "Live stream subscription (automatically renewed per minute)", "price": 1, "subscription": true, "currency": CURRENCY, "ttl": 60, "stream": "http://cdn.metrological.com/hls/greenland720.m3u8"}
};

/**
 * Responds with the list of assets.
 */
function handleListAssets(request, response) {
    if (!request.query.household) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    var tasks = Object.keys(ASSETS).map(function(assetId) {
        return function(cb) {
            getAssetStatus(request.query.household, assetId, cb)
        }
    });

    async.parallel(tasks, function(err, assets) {
        if (err) {
            return response.status(500).json({error: 'failure'});
        }
        response.status(200).json(assets);
    });
}

function getAssetStatus(household, assetId, cb) {
    var asset = ASSETS[assetId];

    var key = getAssetKey(household, assetId);
    var redisClient = config.getRedisClient();
    redisClient.ttl(key, function(err, ttl) {
        if (err) {
            return response.status(500).json({error: 'failure'});
        }

        // App should use the ttl to setTimeout and close movie while watching.
        var obj = {assetId: assetId, access: (ttl > 0), ttl: ttl, asset: asset};

        if (asset.subscription) {
            // Check if still subscribed.
            redisClient.zscore(config.getSettings().redisRecurringSubscriptions, key, function(err, res) {
                if (err) {
                    return cb(err)
                }
                obj.subscriptionActive = (!!res);
                cb(null, obj);
            })
        } else {
            cb(null, obj);
        }
    });

}

/**
 * Responds with the 'payment' status for the specific asset.
 */
function handleAssetStatus(request, response) {
    response.header('Access-Control-Allow-Origin', '*');

    if (!request.query.household) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    if (!request.query.assetId || !ASSETS.hasOwnProperty(request.query.assetId)) {
        response.status(404).json({error: 'asset does not exist'});
        return;
    }

    getAssetStatus(request.query.household, request.query.assetId, function(err, res) {
        if (err) {
            return response.status(500).json({error: 'failure'});
        }

        response.status(200).json(res);
    });
}

function handleAssetSignature(request, response) {
    response.header('Access-Control-Allow-Origin', '*');

    if (!request.query.household) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    if (!request.query.assetId || !ASSETS.hasOwnProperty(request.query.assetId)) {
        response.status(404).json({error: 'asset does not exist'});
        return;
    }

    var currency = CURRENCY;

    if (request.query.currency) {
        currency = request.query.currency;
    }

    var asset = ASSETS[request.query.assetId];
    var purchaseParams = {
        adult: false, //Indicates if the asset contains adult content
        currency: currency, // i.e. EUR, QAR, USD
        price: asset.price, // Price of the asset including VAT per country
        id: request.query.assetId, //Id of the asset that should be both trackable by operator and own backend
        description: asset.title, // Asset Title shown in the dialog
        timestamp: (new Date()).getTime(),  // Helps validating the payment
        household: request.query.household, // Indicates who bought the asset
        subscription: asset.subscription || false // Indicates whether or not the asset is an automatically renewable subscription,
    };

    purchaseParams.signature = signatureHelper.generateSignature(purchaseParams, config.getSettings().applicationBillingKey);

    response.status(200).json(purchaseParams);
}

function handleSaveAsset(request, response){
    response.header('Access-Control-Allow-Origin', '*');

    var transaction = request.body;
    // CSP: check signature.
    var signatureToCheck = transaction.signature;
    delete transaction.signature;
    var signature = signatureHelper.generateSignature(transaction, config.getSettings().applicationBillingKey);
    if (signature !== signatureToCheck) {
        // To prevent a man-in-the-middle attack.
        response.status(404).json({error: 'signature mismatch'});
        return;
    }

    var key = getAssetKey(transaction.household, transaction.id);

    var asset = ASSETS[transaction.id];
    var ttl = asset.ttl;

    if (asset.subscription) {
        // Add additional TTL to allow the scheduler to renew subscription automatically.
        //Scheduler should be able to run before this extra time or the subscription will be lost.
        ttl += config.getSettings().subscriptionAdditionalCheckTtl;
    }

    var redisClient = config.getRedisClient();

    // Notice that using expiration of objects is not production-proof. We advice to use a relational database.
    redisClient.setex(key, ttl, JSON.stringify({transactionId: transaction.transactionId, currency: transaction.currency, household: transaction.household, assetId: transaction.id}), function(err) {
        if (err) {
            response.status(500).json({error: 'failure'});
            return;
        }

        var result = {success: true, asset: asset, ttl: ttl};

        if (asset.subscription) {
            // Unix timestamp after which to renew the subscription.
            var unixTimestamp = Math.floor(Date.now() / 1000) + asset.ttl;

            // Add to redis: the time when it is to expire, along with the transaction id.
            redisClient.zadd(config.getSettings().redisRecurringSubscriptions, unixTimestamp, key, function(err) {
                if (err) {
                    response.status(500).json({error: 'failure'});
                } else {
                    response.status(200).json(result);
                }
            });
        } else {
            response.status(200).json(result);
        }

    });
}

function handleUnsubscribeAsset(request, response){
    response.header('Access-Control-Allow-Origin', '*');

    if (!request.body.household) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    if (!request.body.assetId || !ASSETS.hasOwnProperty(request.body.assetId)) {
        response.status(404).json({error: 'asset does not exist'});
        return;
    }

    var asset = ASSETS[request.body.assetId];

    var key = getAssetKey(request.body.household, request.body.assetId);

    var redisClient = config.getRedisClient();
    redisClient.zrem(config.getSettings().redisRecurringSubscriptions, key, function(err, res) {
        if (err) {
            response.status(500).json({error: 'failure'});
        } else {
            response.status(200).json();
        }
    })
}

function renewSubscription(key, cb) {
    console.log("Renewing subsription: " + key)

    var redisClient = config.getRedisClient();
    redisClient.get(key, function(err, res) {
        if (err) {
            console.error("Subscription renew error (retry again in 10s): ", key, err);
            return cb();
        }

        var obj;
        try {
            obj = JSON.parse(res);
        } catch(e) {
            console.error("Subscription JSON parse error", key, res, e);
            return cb();
        }

        var asset = ASSETS[obj.assetId];
        if (!asset) {
            console.error("Asset no longer supported:", key, res);
        } else {

            var purchaseParams = {
                adult: false,
                currency: obj.currency || asset.currency,
                price: asset.price,
                id: obj.assetId,
                description: "Subscription: " + asset.title,
                timestamp: (new Date()).getTime(),
                household: obj.household,
                subscriptionId: obj.transactionId // The original transaction starting the subscription.
            };

            purchaseParams.signature = signatureHelper.generateSignature(purchaseParams, config.getSettings().applicationBillingKey);

            var settings = config.getSettings();
            var paymentRequest = {
                purchase: purchaseParams,
                type: 'subscription'
            };

            console.log('Renew subscription: ', JSON.stringify(purchaseParams));

            request.post({url: settings.paymentHost, body: paymentRequest, json: true}, function (err, res, body) {
                /*
                 Possible error codes:
                 4000 Missing Parameters One or more parameters where missing from the request.
                 4001 Currency Unknown An unknown currency was used.
                 4002 Household Non-existent The household ID cannot be found in the system.
                 4003 Operator Non-existent The operator cannot be found in the system.
                 4004 Invalid Signature The signature used is not valid.
                 4005 App Already Owned The user already owns this app.
                 4006 Timestamp expired, user did not complete the payment dialog in time.
                 4007 Bad or revoked subscription id.
                 4010 Price Not Accepted The price was not accepted.
                 4011 Credit Limit Reached The user has no more credit to complete the transaction.
                 5000 Unexpected Error Something has gone wrong at Metrological.
                 5001 Unexpected Error Something has gone wrong at the operator.
                 */
                if (err || body.code || !body.transactionId) {
                    // Show error dialog.
                    console.error(err || body);
                    return cb(err || body);
                }

                // Show success dialog.
                console.log('Payment server response', body);

                updateSubscription(asset, key, function(err) {
                    if (err) {
                        console.error('Save asset error', err);
                        return cb();
                    }

                    console.log("Subscription successfully renewed!");

                    cb();
                });
            });
        }
    });
}

function updateSubscription(asset, key, cb) {
    var ttl = asset.ttl + config.getSettings().subscriptionAdditionalCheckTtl;

    var redisClient = config.getRedisClient();
    redisClient.expire(key, ttl, function(err) {
        if (err) {
            return cb(err);
        }

        var result = {success: true, asset: asset, ttl: ttl};

        // Unix timestamp after which to renew the subscription.
        var unixTimestamp = Math.floor(Date.now() / 1000) + asset.ttl;

        // Add to redis: the time when it is to expire, along with the transaction id.
        redisClient.zadd(config.getSettings().redisRecurringSubscriptions, unixTimestamp, key, function(err) {
            cb(err, result);
        });
    });

}