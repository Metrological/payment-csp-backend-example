var API = {
	baseURL: 'http://127.0.0.1:3789/',
	getAssets: function(cb){
		new Request({
			url: API.baseURL+'list-assets?household='+profile.household,
			onSuccess: function(json){
				cb(json);
			},
			onFailure: function(){
				console.log("Could not get assets");
			}
		}).send();
	},
	getAssetStatus: function(assetId, cb){
		new Request({
			url: API.baseURL+'get-asset-status?household='+profile.household+'&assetId='+assetId,
			onSuccess: function(json){
				cb(json);
			},
			onFailure: function(){
				console.log("Could not get asset status");
			}
		}).send();
	},
	getAssetSignature: function(assetId, cb){
		new Request({
			url: API.baseURL+'get-asset-signature?household='+profile.household+'&assetId='+assetId,
			onSuccess: function(json){
				cb(json);
			},
			onFailure: function(){
				console.log("Could not generate signature");
			}
		}).send();
	},
	setAsset: function(purchase, cb){
		new Request({
			url: API.baseURL+'save-asset',
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST',
			data: purchase,
			onSuccess: function(json){
				cb(json);
			},
			onFailure: function(){
				console.log("Could not save payment");
			}
		}).send();
	},
	unsubscribeAsset: function(assetId, cb){
		new Request({
			url: API.baseURL+'unsubscribe-asset',
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST',
			data: {household: profile.household, assetId: assetId},
			onSuccess: function(json){
				cb(json);
			},
			onFailure: function(){
				console.log("Could not unsubscribe asset");
			}
		}).send();
	},
};