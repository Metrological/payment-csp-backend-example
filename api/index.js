var config = require('../config');
var async = require('async');
var redis = require('metrological-redis');

var loadRoutes = function(app){
    app.get('/get-signature', handleGetAssets);
    app.get('/get-assets', handleGetSignature);
    app.post('/save', handleSave);

    app.all('*',function(req,res){
        res.status(404).end();
    });
};

module.exports = {
    loadRoutes: loadRoutes
};


function handleGetAssets(request, response){
    response.status(200).json({status: 'ok'});
}

function handleGetSignature(request, response){
    response.status(200).json({status: 'ok'});
}

function handleSave(request, response){
    response.status(200).json({status: 'ok'});
}
