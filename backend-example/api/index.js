var config = require('../config');
var redis = require("redis");
var redisClient = redis.createClient({host: "127.0.0.1", port: 6379});
var signatureHelper = require('./signatureHelper');

var loadRoutes = function(app){
    // (Recurring) subscriptions.
    app.get('/get-asset-status', handleAssetStatus);
    app.get('/get-asset-signature', handleAssetSignature);
    app.post('/save-asset', handleSaveAsset);
    app.get('/list-assets', handleListAssets);

    app.all('*',function(req,res){
        res.status(404).end();
    });
};

module.exports = {
    loadRoutes: loadRoutes
};

function getAssetKey(assetId, householdHash) {
    return config.getSettings().redisHouseholdAssetsPrefix + householdHash + ":" + assetId;
}

var TTL = 24 * 3600;

var CURRENCY = 'EUR';

var ASSETS = {
    "the-shawshank-redemption": {"title": "The Shawshank Redemption", "price": 299, url: ""},
    "the-godfather": {"title": "The Godfather", "price": 199, url: ""},
    "the-dark-knight": {"title": "The Dark Knight", "price": 199, url: ""}
};

function handleListAssets(request, response) {
    response.status(200).json(ASSETS);
}

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

    var key = getAssetKey(request.query.household, request.query.assetId);
    redisClient.ttl(key, function(err, ttl) {
        if (err) {
            return response.status(500).json({status: 'failure'});
        }

        // App could use the ttl to setTimeout and close movie while watching.
        response.status(200).json({access: (ttl > 0), ttl: Math.max(0, ttl)});
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

    var asset = ASSETS[request.query.assetId];
    var purchaseParams = {
        adult: false,
        currency: CURRENCY,
        price: asset.price,
        id: request.query.assetId,
        description: asset.title,
        timestamp: (new Date()).getTime(),  // Required.
        household: request.query.household
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
    redisClient.setex(key, TTL, transaction.transactionId, function(err) {
        if (err) {
            response.status(500).json({status: 'failure'});
            return;
        }

        response.status(200).json({success: true, ttl: TTL});
    });
}

