// Include your views
include('Javascript/API.js');
include('Javascript/Views/MainView.js');
include('Javascript/Views/SubscriptionsView.js');

// Set base glow and focus theme
Theme.set({
	BaseGlow: {
		styles: {
			color: 'white',
			backgroundColor: 'grey'
		}
	},
	BaseFocus: {
		styles: {
			backgroundColor: '#5f429c'
		}
	}
});

// Init application with view config
MAF.application.init({
	views: [
		{ id: 'MainView', viewClass: MainView },
		{ id: 'SubscriptionsView', viewClass: SubscriptionsView }
		
	],
	defaultViewId: 'MainView'
});
