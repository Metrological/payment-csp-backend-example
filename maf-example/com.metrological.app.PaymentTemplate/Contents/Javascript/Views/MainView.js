var MainView = new MAF.Class( {
	ClassName: 'MainView',

	Extends: MAF.system.SidebarView,
	initialize: function(){
		this.parent();
		MAF.mediaplayer.init();
	},
	createView: function(){
		this.elements.subscriptionTitle = new MAF.element.Text({
			label:'Subscription Assets',
			styles:{
				width: this.width,
				height: 50,
				fontSize: 40,
				anchorStyle: 'center'
			}
		}).appendTo(this);
		
		this.elements.singleTitle = new MAF.element.Text({
			label:'Single Assets',
			styles:{
				width: this.width,
				height: 50,
				fontSize: 40,
				anchorStyle: 'center'
			}
		}).appendTo(this);
		
		var subscriptionsButton = new MAF.control.TextButton({
			label: 'Current Subscriptions',
			styles: {
				vAlign: 'bottom'
			},
			events: {
				onSelect: function(){
					MAF.application.loadView('SubscriptionsView');
				}
			}
		}).appendTo(this)
	},
	updateView: function(){
		var view = this;
		if (!this.backParams || !this.backParams.noReset)
			API.getAssets(function(json){
				// Create a list of buttons based on an array and
				// set guid for keeping focus state on previous view
				var singleAssets = [];
				var subscriptionAssets = [];
				json.forEach( function( asset, i ) {
					if (asset.asset.subscription)
						subscriptionAssets.push(asset);
					else
						singleAssets.push(asset);
				});

				if( subscriptionAssets.length ) {
					subscriptionAssets.forEach( function( asset, i ) {
						// Generate a unqiue name for the view.controls and the guid
						view.generateAssetButton(asset, i, view.elements.subscriptionTitle.outerHeight + 10 + ( i * 100 ))
					}, view );
					view.elements.singleTitle.vOffset = view.elements.subscriptionTitle.outerHeight + 10 + ( subscriptionAssets.length * 100 )
				} else {
					view.elements.subscriptionTitle.visible = false;
				}

				singleAssets.forEach( function( asset, i ) {
					// Generate a unqiue name for the view.controls and the guid
					view.generateAssetButton(asset, i, view.elements.singleTitle.outerHeight + 10 + ( i * 100 ))
				}, view );
				view.controls[Object.keys(view.controls)[0]].focus();
			});
	},
	generateAssetButton: function(asset, i, posY){
		var id = 'myButton' + asset.assetId;
		var view = this;
		view.controls[ id ] = new MAF.control.TextButton( {
			guid: id,
			label: asset.asset.title,
			assetId: asset.assetId,
			styles: {
				height: 80,
				width: 450,
				vOffset: posY,
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
												console.log('setAssetRes', setAssetRes);
												if (setAssetRes.success){
													profile.confirmPurchase(response, function (err) {
														if (err) {
															console.log(err);
														} else {
															console.log('Video purchase succesful');
															//Play video
															MAF.mediaplayer.playlist.set(new MAF.media.Playlist().addEntryByURL(setAssetRes.asset.stream));
															MAF.mediaplayer.playlist.start();
														}
													});
												}
											});
										}
									}
								}).show();
							});
						} else {
							//Play the video
							MAF.mediaplayer.playlist.set(new MAF.media.Playlist().addEntryByURL(status.asset.stream));
							MAF.mediaplayer.playlist.start();
						}
					});
				}
			}
		} ).appendTo( view );
	}
} );