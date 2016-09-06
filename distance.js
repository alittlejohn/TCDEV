var distance = {
	mapQuestKey:'Fmjtd%7Cluurn10bnu%2C2n%3Do5-9wyg10',
	companyLatitude:27.937728, // Tampa Location
	companyLongitude:-82.259524, // Tampa Location
	customerAddress:{
		street:null,
		city:null,
		state:null,
		zip:null
	},
	enabled:false,
	calculate:function(manual) {
		this.enabled();

		if (!this.enabled && !manual) {
			console.error('User does not have HTML Geolocation enabled, need to use manual address input');
			return;
		}

		if (manual) {
			this.processManualAddress();
		} else {
			this.processDynamicAddress();
		}
	},
	enabled:function() {
		
		if (!this.enabled && navigator.geolocation) this.enabled = true;
	},
	processManualAddress:function() {

		/* Validate manual address-elements are populated */
			var missingElements = [], nonMandatoryElements = ['address2'];
			for (var key in this.customerAddress) {
				if (!this.customerAddress[key] && nonMandatoryElements.indexOf(key) === -1) missingElements.push(key);
			}
			if (missingElements.length > 0) {
				console.error('Missing mandatory elements', missingElements);
				return;
			}

		/* Get Latitude/Longitude */
			var url = 'https://www.mapquestapi.com/geocoding/v1/address?key='+this.mapQuestKey+'&inFormat=json&json='+escape(JSON.stringify({location:this.customerAddress}));
			var request = jQuery.ajax({
				method:'GET',
				url:url
			});
			request.done(function(data) {
				if (data.results.length > 0) {
					if (data.results[0].locations.length > 0) {
						distance._returnDistance(
							data.results[0].locations[0].latLng.lat,
							data.results[0].locations[0].latLng.lng,
							'MapQuest'
						);
					} else {
						console.error('Invalid Response from MapQuest', data.info.messages, data);
					}
				} else {
					console.error('Invalid Response from MapQuest', data.info.messages, data);
				}
			});
			request.fail(function(jqXHR, status) {
				console.log('request.fail', jqXHR, status);
			});
	},
	processDynamicAddress:function() {
		navigator.geolocation.getCurrentPosition(function(position) {
			distance._returnDistance(
				position.coords.latitude,
				position.coords.longitude,
				'HTML5'
			);
		});
	},
	_returnDistance:function(latitude, longitude, source) {

		var R = 3959;
		var dLat = this._degreeToRadius(latitude - this.companyLatitude);
		var dLon = this._degreeToRadius(longitude - this.companyLongitude);
		var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(this._degreeToRadius(this.companyLatitude)) * Math.cos(this._degreeToRadius(latitude)) * Math.sin(dLon/2) * Math.sin(dLon/2);
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		var d = parseFloat((R * c).toFixed(2));

		console.log('Distance', {
			source:source,
			distance:d,
			companyLatitude:this.companyLatitude,
			companyLongitude:this.companyLongitude,
			latitude:latitude,
			longitude:longitude
		});
		return d;
	},
	_degreeToRadius:function(input) {

		return parseFloat(input * (Math.PI/180));
	}
};

distance.customerAddress = {
	street:'98 S Aspen CT',
	city:'Chandler',
	state:'AZ',
	zip:85226
};
distance.calculate(true);

distance.customerAddress = {
	street:'1611 S.R. 60 East',
	city:'Valrico',
	state:'FL',
	zip:33594
};
distance.calculate(true);

distance.calculate();
