var crypto = require('crypto');

/**
 * Generates a sha256 signature for the incoming parameters
 * @param params
 * @param key
 * @returns {*}
 */
var generateSignature = function(params, key){
    var orderedParams = orderParams(params);
    var generatedString = JSON.stringify(orderedParams);
    console.log(generatedString);
    var hmac = crypto.createHmac('sha256', key);
    hmac.setEncoding('base64');
    hmac.write(generatedString);
    hmac.end();
    return hmac.read();
};

/**
 * Creates a signature based on the params and matches that with the signature
 * @param sendSignature
 * @param params
 * @param key
 * @returns {boolean}
 */
var verifySignature = function(sendSignature, params, key){

    var generatedSignature = generateSignature(params, key);
    if(generatedSignature === sendSignature)
        return true;

    return false;
};

module.exports = {
    generateSignature: generateSignature,
    verifySignature: verifySignature
};

/**
 * Orders the parameters from a-z
 * @param params
 * @returns {{}}
 */
function orderParams(params){
    var keys = Object.keys(params),
        i, len = keys.length;

    keys.sort();
    var newObj = {};
    for (i = 0; i < len; i++)
        newObj[keys[i]] = params[keys[i]];

    return newObj;
}
