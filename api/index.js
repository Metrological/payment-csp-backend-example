var config = require('../config');
var async = require('async');
var redis = require('metrological-redis');
var signatureHelper = require('./signatureHelper');
var request = require('request');

var loadRoutes = function(app){
    // (Recurring) subscriptions.
    app.get('/get-subscription-status', handleSubscriptionStatus);
    app.get('/get-subscription-signature', handleSubscriptionSignature);
    app.post('/save-subscription', handleSaveSubscription);

    // Assets.
    app.get('/get-assets', handleGetAssets);
    app.get('/get-signature', handleGetSignature);
    app.post('/save', handleSave);

    // Test.
    app.get('/delete-assets', handleDeleteAssets);

    app.all('*',function(req,res){
        res.status(404).end();
    });
};

module.exports = {
    loadRoutes: loadRoutes,
    invoiceSubscriptions: invoiceSubscriptions
};

// Check (at least) once per day. Preferably this can be done via a crontab task.
function invoiceSubscriptions(cb) {
    redis.getWriteClient().hvals(config.getSettings().redisRecurringSubscriptions, function(err, subscriptions) {
        if (err) {
            console.error("can't invoice subscriptions", err);
            return;
        }

        var tasks = [];
        for (var i = 0, n = subscriptions.length; i < n; i++) {
            var subscription = JSON.parse(subscriptions[i]);
            (function(subscription) {
                tasks.push(function(cb) {
                    renewSubscription(subscription, function(err) {
                        if (err) {
                            console.error('error in subscription renewal', err, subscription);
                        }
                        cb();
                    });
                });
            })(subscription);
        }

        console.log('subscriptions found: ', subscriptions.length);
        async.parallelLimit(tasks, 5, function(err) {
            if (err) {
                console.error('error', err);
            } else {
                console.log('all subscriptions handled.')
            }
            cb(err);
        });
    });
}

function getPrice(operator, country, eurocents) {
    if (country == 'qa') {
        return {currency: 'QAR', price: eurocents * 3};
    } else {
        return {currency: 'EUR', price: eurocents};
    }
}

function renewSubscription(subscription, cb) {
    var key = getSubscriptionKey(subscription.household);
    redis.getWriteClient().ttl(key, function(err, res) {
        var ttl = res || 0;

        if (ttl < 2 * 24 * 3600) {
            // We need to upgrade the subscription.
            console.log('needs upgrade', subscription);

            // It's best to first increase TTL and then post request.
            // Because it would be really bad if the recurring payment for some household would be done multiple times!
            // We can reset the TTL later if the payment goes wrong or the subscription is invalid.

            var resetTtl = function() {
                redis.getWriteClient().expire(key, ttl);
            };

            // Calculate new TTL.
            var d = new Date();
            d.setTime(d.getTime() + ttl * 1000);
            d.setMonth(d.getMonth() + 1);
            var newTtl = Math.floor((d.getTime() - Date.now()) / 1000);

            var key = getSubscriptionKey(subscription.household);

            var setTtl = null;
            if (ttl < 20) {
                // The key was (possibly) removed from the database so let's re-enter it.
                setTtl = function(cb) {
                    redis.getWriteClient().setex(key, newTtl, JSON.stringify(subscription), cb);
                };
            } else {
                setTtl = function(cb) {
                    redis.getWriteClient().expire(key, newTtl, cb);
                };
            }

            setTtl(function(err) {
                if (err) {
                    response.status(400).json({status: 'failure'});
                }

                var priceObj = getPrice(subscription.operator, subscription.country, 499);

                // Send payment to billing server.
                var purchaseRequest = {
                    id: 'recurring_payment_' + (new Date()).toISOString() + '_' + subscription.transactionId,
                    description: 'Recurring payment for subscription',
                    currency: priceObj.currency,
                    price: priceObj.price,
                    household: subscription.household,
                    adult: false,
                    timestamp: Date.now(),
                    subscriptionId: subscription.transactionId,
                    ttl: newTtl
                };
                purchaseRequest.signature = signatureHelper.generateSignature(purchaseRequest, config.getSettings().applicationBillingKey);
                var recurringPurchaseRequest = {
                    purchase: purchaseRequest,
                    type: 'subscription'
                };

                request.post({url: config.getSettings().billingHost, body: recurringPurchaseRequest, json: true}, function (err, res, body) {
                    /*
                     In case of error, the response is: {errors: [{code: 5000, message: 'Unexpected error'}]}
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
                    if (err) {
                        resetTtl();

                        // Serious: internal error. Stop all.
                        return cb(err);
                    }

                    if (res.statusCode == 200) {
                        // Success!
                        console.log('payment response', body);
                        cb();
                    } else if (res.statusCode == 400) {
                        if (body.code === 4007) {
                            // Subscription revoked or original transaction gone: cancel subscription.
                            console.warn('Forcefully cancelled subscription', body, subscription);
                            redis.getWriteClient().hdel(config.getSettings().redisRecurringSubscriptions, subscription.transactionId, function(err) {
                                if (err) {
                                    console.error('Problem deleting recurring subscription', err, subscription);
                                }
                                resetTtl();
                                cb();
                            });
                        } else {
                            // This is serious: there is a bug in your code. Cancel all and investigate the issue.
                            console.error('Error in payment', body, subscription);
                            cb(new Error('Error in payment'));
                        }
                    } else {
                        // Serious: internal error. Stop all.
                        resetTtl();
                        return cb(body);
                    }
                });
            });
        } else {
            // Subscription still valid.
            cb();
        }
    });
}

function getSubscriptionKey(householdHash) {
    return config.getSettings().redisHouseholdAssetsPrefix + householdHash + ":subscription";
}

function handleSubscriptionStatus(request, response) {
    response.header('Access-Control-Allow-Origin', '*');

    var householdHash = request.query.household;
    if (!householdHash) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    var key = getSubscriptionKey(householdHash);
    redis.getReadClient().ttl(key, function(err, ttl) {
        if (err) {
            return response.status(500).json({status: 'failure'});
        }

        response.status(200).json({status: 'ok', ttl: Math.max(0, ttl)});
    });
}

function handleSubscriptionSignature(request, response) {
    response.header('Access-Control-Allow-Origin', '*');

    var householdHash = request.query.household;
    if (!householdHash) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    var ttl = 0;
    var price = 0;
    var description;
    var isRecurring = false;
    switch (request.query.period) {
        case '24h':
            ttl = 24 * 3600;
            price = 199;
            description = '24h subscription';
            break;
        case 'month':
            var d = new Date();
            d.setMonth(d.getMonth() + 1);
            ttl = (d.getTime() - Date.now()) / 1000;
            price = 499;
            description = 'month subscription';
            isRecurring = true;
            break;
        default:
            response.status(404).json({error: 'period not specified'});
            return;
    }

    var key = getSubscriptionKey(householdHash);
    redis.getReadClient().get(key, function(err, res) {
        if (err) {
            response.status(500).json({error: 'failure'});
            return;
        }

        if (res) {
            response.status(200).json({error: 'exists'});
            return;
        }

        var priceObj = getPrice(request.query.operator || '', request.query.country || '', price);

        var purchaseParams = {
            adult: false,
            currency: priceObj.currency,
            price: priceObj.price,
            id: 'subscription_' + request.query.period,
            description: description,
            timestamp: (new Date()).getTime(),
            household: householdHash,
            ttl: ttl,
            subscription: isRecurring // Whether or not recurring payment requests may be done.
        };

        purchaseParams.signature = signatureHelper.generateSignature(purchaseParams, config.getSettings().applicationBillingKey);

        response.status(200).json(purchaseParams);
    });
}

function handleSaveSubscription(request, response){
    response.header('Access-Control-Allow-Origin', '*');

    var transaction = request.body;

    if (!transaction.ttl) {
        response.status(404).json({error: 'not a subscription transaction'});
        return;
    }

    // CSP: check signature.
    var signatureToCheck = transaction.signature;
    delete transaction.signature;
    var signature = signatureHelper.generateSignature(transaction, config.getSettings().applicationBillingKey);
    if (signature !== signatureToCheck) {
        // To prevent a man-in-the-middle attack.
        response.status(404).json({error: 'signature mismatch'});
        return;
    }

    var key = getSubscriptionKey(transaction.household);
    redis.getWriteClient().setex(key, transaction.ttl, transaction.transactionId, function(err) {
        if (err) {
            response.status(400).json({status: 'failure'});
        }

        if (transaction.subscription) {
            // Add to subscriptions.
            redis.getWriteClient().hset(config.getSettings().redisRecurringSubscriptions, transaction.transactionId, JSON.stringify(transaction), function(err) {
                if (err) {
                    console.error('Could not schedule subscription for automatic recurring payments..', transaction);
                }
            });
        }

        response.status(200).json({status: 'ok', ttl: transaction.ttl});
    });
}

function handleGetAssets(request, response){
    response.header('Access-Control-Allow-Origin', '*');

    var householdHash = request.query.household;
    if (!householdHash) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    var key = config.getSettings().redisHouseholdAssetsPrefix + householdHash;
    redis.getReadClient().smembers(key, function(err, res) {
        if (err) {
            return response.status(500).json({status: 'failure'});
        }

        response.status(200).json({status: 'ok', assets: res});
    });
}

function handleDeleteAssets(request, response){
    response.header('Access-Control-Allow-Origin', '*');

    var householdHash = request.query.household;
    if (!householdHash) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    var key = config.getSettings().redisHouseholdAssetsPrefix + householdHash;
    redis.getReadClient().del(key, function(err, res) {
        if (err) {
            response.status(500).json({status: 'failure'});
        }

        response.status(200).json({status: 'ok', assets: []});
    });
}

function handleGetSignature(request, response){
    response.header('Access-Control-Allow-Origin', '*');

    var householdHash = request.query.household;
    if (!householdHash) {
        response.status(404).json({error: 'household does not exist'});
        return;
    }

    var key = config.getSettings().redisHouseholdAssetsPrefix + householdHash;
    redis.getReadClient().sismember(key, request.query.id, function(err, res) {
        if (err) {
            response.status(500).json({error: 'failure'});
            return;
        }

        if (res) {
            response.status(200).json({error: 'exists'});
            return;
        }

        var purchaseParams = {
            adult: false,
            timestamp: (new Date()).getTime()
        };

        purchaseParams.id = request.query.id;

        switch(request.query.id) {
            case '1':
                purchaseParams.description = 'The first test asset';
                purchaseParams.price = 0;
                break;
            case '2':
                purchaseParams.description = 'The second test asset';
                purchaseParams.price = 199;
                break;
            case '3':
                purchaseParams.description = 'The third test asset';
                purchaseParams.price = 2500;
                break;
            case '4':
                purchaseParams.description = 'The third test asset';
                purchaseParams.price = 10000;
                break;
            default:
                response.status(404).json({error: 'asset does not exist'});
                return;
        }

        var priceObj = getPrice(request.query.operator || '', request.query.country || '', purchaseParams.price);
        purchaseParams.currency = priceObj.currency;
        purchaseParams.price = priceObj.price;

        purchaseParams.household = householdHash;
        purchaseParams.signature = signatureHelper.generateSignature(purchaseParams, config.getSettings().applicationBillingKey);

        response.status(200).json(purchaseParams);
    });

}

function handleSave(request, response){
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

    var key = config.getSettings().redisHouseholdAssetsPrefix + transaction.household;
    redis.getWriteClient().sadd(key, transaction.id, function(err) {
        if (err) {
            response.status(400).json({status: 'failure'});
        }

        response.status(200).json({status: 'ok'});
    });
}
