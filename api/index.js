var config = require('../config');
var async = require('async');
var redis = require('metrological-redis');
var signatureHelper = require('./signatureHelper');

var loadRoutes = function(app){
    app.get('/get-assets', handleGetAssets);
    app.get('/get-signature', handleGetSignature);
    app.post('/save', handleSave);
    app.get('/delete-assets', handleDeleteAssets);

    app.all('*',function(req,res){
        res.status(404).end();
    });
};

module.exports = {
    loadRoutes: loadRoutes
};

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
            response.status(500).json({status: 'failure'});
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
            currency: 'EUR',
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
                purchaseParams.price = 25;
                break;
            case '3':
                purchaseParams.description = 'The third test asset';
                purchaseParams.price = 100;
                break;
            default:
                response.status(404).json({error: 'asset does not exist'});
                return;
        }

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
