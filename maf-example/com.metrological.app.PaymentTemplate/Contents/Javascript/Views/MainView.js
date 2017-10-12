var MainView = new MAF.Class( {
	ClassName: 'MainView',

	Extends: MAF.system.SidebarView,
	initialize: function(){
		this.parent();
		MAF.mediaplayer.init();
	},
	updateView: function(){
		var view = this;
		API.getAssets(function(json){
			// Create a list of buttons based on an array and
			// set guid for keeping focus state on previous view
			Object.values(json).forEach( function( asset, i ) {
				// Generate a unqiue name for the view.controls and the guid
				var id = 'myButton' + i;
				view.controls[ id ] = new MAF.control.TextButton( {
					guid: id,
					label: asset.title,
					assetId: Object.keys(json)[i],
					styles: {
						height: 80,
						width: 450,
						vOffset: 150 + ( i * 100 ),
						hOffset: ( view.width - 450 ) / 2,
						borderRadius: 10
					},
					textStyles: {
						fontSize: 35,
						anchorStyle: 'center'
					},
					events: {
						onSelect: function() {
							var button = this;
							//Get current status asset from content owner backend
							API.getAssetStatus(button.config.assetId, function(status){
								if (status.access === false){
									//Generate asset information on content owner backend
									API.getAssetSignature(button.config.assetId, function(signature){
										//Request user for payment verification
										new MAF.dialogs.VerifyPin({
											autoAdjust: true,
											type: 'purchase',
											data: signature,
											callback: function(response) {
												if (response.success){
													// Do a request to content owner backend to confirm
													API.setAsset(response.result, function(setAssetRes){
														if (setAssetRes.success){
															//Play video
															MAF.mediaplayer.playlist.set(new MAF.media.Playlist().addEntryByURL(setAssetRes.source));
															MAF.mediaplayer.playlist.start();
														}
													});
												}
											}
										}).show();
									});
								} else {
									//Play the video
									MAF.mediaplayer.playlist.set(new MAF.media.Playlist().addEntryByURL(status.source));
									MAF.mediaplayer.playlist.start();
								}
							});
						}
					}
				} ).appendTo( view );
			}, this );
			view.controls['myButton0'].focus();
		});
	}
} );

var API = {
	getAssets: function(cb){
		new Request({
			url:'http://127.0.0.1:3789/list-assets',
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
			url:'http://127.0.0.1:3789/get-asset-status?household='+profile.household+'&assetId='+assetId,
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
			url:'http://127.0.0.1:3789/get-asset-signature?household='+profile.household+'&assetId='+assetId,
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
			url:'http://127.0.0.1:3789/save-asset',
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
	}
};