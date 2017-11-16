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
    "the-shawshank-redemption": {"title": "The Shawshank Redemption", "price": 299},
    "the-godfather": {"title": "The Godfather", "price": 199},
    "the-dark-knight": {"title": "The Dark Knight", "price": 199}
};

var ASSETSSOURCES = {
    "the-shawshank-redemption": "http://video.metrological.com/sunset.mp4",
    "the-godfather": "http://video.metrological.com/aquarium.mp4",
    "the-dark-knight": "http://video.metrological.com/sea.mp4"
}

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
            return response.status(500).json({error: 'failure'});
        }

        // App could use the ttl to setTimeout and close movie while watching.
        response.status(200).json({access: (ttl > 0), ttl: Math.max(0, ttl), source: ASSETSSOURCES[request.query.assetId]});
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
        adult: false, //Indicates if the asset contains adult content
        currency: CURRENCY, // i.e. EUR, QAR, USD
        price: asset.price, // Price of the asset including VAT per country
        id: request.query.assetId, //Id of the asset that should be both trackable by operator and own backend
        description: asset.title, // Asset Title shown in the dialog
        timestamp: (new Date()).getTime(),  // Helps validating the payment
        household: request.query.household // Indicates who bought the asset
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
            response.status(500).json({error: 'failure'});
            return;
        }
        response.status(200).json({success: true, ttl: TTL, source: ASSETSSOURCES[transaction.id]});
    });
}

