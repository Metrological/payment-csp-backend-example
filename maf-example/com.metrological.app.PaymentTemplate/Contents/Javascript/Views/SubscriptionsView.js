var SubscriptionsView = new MAF.Class( {
	ClassName: 'SubscriptionsView',

	Extends: MAF.system.SidebarView,
	initialize: function(){
		this.parent();
	},
	viewBackParams:{
		noReset:true
	},
	createView: function(){
		this.elements.backButton = new MAF.control.BackButton({
			backParams: this.viewBackParams
		}).appendTo(this)
		
		this.elements.title = new MAF.element.Text({
			label:'Current Subscriptions',
			styles:{
				vOffset: this.elements.backButton.outerHeight+10,
				width: this.width-20,
				hOffset: 10,
				height: 50,
				fontSize: 40,
				anchorStyle: 'center'
			}
		}).appendTo(this);
		this.elements.subtitle = new MAF.element.Text({
			label:'Unsubscribing from an asset will not revoke access until its TTL is expired',
			styles:{
				height: 100,
				wrap:true,
				vOffset: this.elements.title.outerHeight+10,
				width: this.width-20,
				hOffset: 10,
				anchorStyle: 'center'
			}
		}).appendTo(this)
	},
	updateView: function(){
		this.checkSubscriptions();
		
		
	},
	checkSubscriptions: function(){
		var view = this;
		Object.keys(this.controls).forEach(function(key){
			view.controls[key].suicide();
			delete view.controls[key];
		});
		API.getAssets(function(json){
			var subscribedAssets = [];
			Object.values(json).forEach( function( asset, i ) {
				if (asset.subscriptionActive)
					subscribedAssets.push(asset)
			});
			
			subscribedAssets.forEach(function(asset, i){
				view.generateAssetButton( asset, i, view.elements.subtitle.outerHeight + 10 + ( i * 100 ))
			})
			
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
					//Unsubscribe asset from content owner backend
					new MAF.dialogs.Alert({
						title: 'Unsubscribe asset',
						message: 'Are you sure you want to unsubscribe from ' + asset.asset.title +'?',
						buttons: [
							{
								label: 'Unsubscribe',
								callback: function () {
									API.unsubscribeAsset(asset.assetId, function(){
										view.checkSubscriptions();
									});
									view.elements.backButton.focus();
								}
							},{
								label: 'Cancel'
							}]
					}).show();
				}
			}
		} ).appendTo( view );
	}
} );