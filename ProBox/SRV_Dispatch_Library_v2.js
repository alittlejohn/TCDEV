/* Generic Logging Function */
	var logs = [], consoleLog = false; try { consoleLog = console ? true : false; } catch (e) { consoleLog = false; }
	function log(t, d, l) {
		logs.push({
			t: t,
			d: d,
			l: l
		});
		if (consoleLog) {
			console.log(l || 'DEBUG', t, d);
		} else {
			nlapiLogExecution(
				l || 'DEBUG',
				typeof t == 'object' ? JSON.stringify(t) : t,
				typeof d == 'object' ? JSON.stringify(d) : d
			);
		}
	}

var api_key = 'Fmjtd%7Cluurn10bnu%2C2n%3Do5-9wyg10';

function build_map_and_sublist(type, form) {
	var table = ''+
		'<div id="map_holder" style="width:1000px; height:300px;"></div>'+
		'<br>'+
		'<div class="table_container TrueCloud">'+
			'<br>'+
			'<table id="resources" class="display" width="100%">'+
				'<thead>'+
					'<tr>'+
						'<th>Internal ID</th>'+ //0
						'<th>Customer</th>'+ //1
						'<th>Distance</th>'+ //2
						'<th>Asset</th>'+ //3
						'<th>Address 1</th>'+ //4
						'<th>Address 2</th>'+ //5
						'<th>City</th>'+ //6
						'<th>State</th>'+ //7
						'<th>Zip</th>'+ //8
						'<th>Latitude</th>'+ //9
						'<th>Longitude</th>'+ //10
						'<th>Select Asset</th>'+ //11
					'</tr>'+
				'</thead>'+
				'<tbody>'+
				'</tbody>'+
			'</table>'+
		'</div>';
	form.addField('custpage_resources', 'inlinehtml', null, null, 'custpage_resourcelookup').setDefaultValue(table);
	return;
}

function append_scripts(type, form) {
	if (!form) return;
	var html = '';
	html += '<script>';
		html += 'jQuery(document).ready(function(){';
			html += 'jQuery("head").append("<script type=\'text/javascript\' src=\'https://open.mapquestapi.com/sdk/js/v7.2.s/mqa.toolkit.js?key='+api_key+'\' />");';
			html += 'jQuery("head").append("<script type=\'text/javascript\' src=\'https://ajax.aspnetcdn.com/ajax/jquery.dataTables/1.9.4/jquery.dataTables.js\' />");';
			html += 'jQuery("head").append("<link rel=\'stylesheet\' type=\'text/css\' href=\'https://system.na1.netsuite.com/core/media/media.nl?id=1244&c=3824885&h=77a191348ff05b4dd0f3&_xt=.css\'>");';
			html += 'jQuery("head").append("<link rel=\'stylesheet\' type=\'text/css\' href=\'https://system.na1.netsuite.com/core/media/media.nl?id=1245&c=3824885&h=e4ffc0bb24c4ad892c07&_xt=.css\'>");';
		html += '});';
	html += '</script>';
	form.addField('custpage_appendscripts','inlinehtml', null, null, null).setDefaultValue(html);
}

function init_table() {
	// http://datatables.net/index
	jQuery(document).ready(function (){
		jQuery('#resources').DataTable({
			"bJQueryUI" : true,
			"sPaginationType" : "full_numbers",
			"bFilter" : false,
			"bPaginate" : false,
			"bInfo" : false,
			"bProcessing" : true,
			"aoColumnDefs" : [
				{"bVisible" : false, "aTargets" : [0, 9, 10]}
			]
		});
	});
}

function insert_filters() {
	var html = ''+
		'<form id="search_filters" class="pure-form">'+
			'<input type="text" id="filter_range" placeholder="Range (Default: 50)">&nbsp;'+
			'<a class="pure-button" href="#" onclick="get_assets()">Search for Assets</a>'+
		'</form>';
	jQuery('.table_container').prepend(html);
}

function get_latitude_longitude(return_type, addr1, addr2, c, s, z, debug) {
	var address1 = addr1 || nlapiGetFieldValue('custrecord_dispatch_addr1') || '';
	var address2 = addr2 || nlapiGetFieldValue('custrecord_dispatch_addr2') || '';
	var city = c || nlapiGetFieldValue('custrecord_dispatch_city') || '';
	var state = s || nlapiGetFieldValue('custrecord_dispatch_state') || '';
	var zip = z || nlapiGetFieldValue('custrecord_dispatch_zip') || '';

	if (!address1 || !city || !state || !zip) return;

	// 12-25-2014
		// var fulladdress = escape(address1 + ', ' + address2 + ', ' + city + ', ' + state + '  ' + zip);
		// //Setup the script with the appropriate Mapquest Key 'Fmjtd%7Cluub2062l1%2C7w%3Do5-9ubsgw' (w/o the single quotes)
		//	var headers = {
		//		"Content-Type" : "application/json;charset=UTF-8"
		//	};
		//	var response = nlapiRequestURL('http://www.mapquestapi.com/geocoding/v1/address?key=Fmjtd%7Cluub2062l1%2C7w%3Do5-9ubsgw&location='+fulladdress, null, headers, null, null);
		//	var results = JSON.parse(response.getBody());
	var fulladdress = {"location":{"street": address1,"city":city,"state":state,"postalCode":zip}};
	log('address', fulladdress);
	var url = 'http://open.mapquestapi.com/geocoding/v1/address?key='+api_key+'&inFormat=json&json='+escape(JSON.stringify(fulladdress));
	log('url', url);
	var headers = {'Content-Type':'application/json'};
	var response = nlapiRequestURL(url, null, headers);
	var results;
	try {
		results = JSON.parse(response.getBody() || {});
	} catch (e){
		//console.log('e: ' + e);
		nlapiLogExecution('ERROR', 'Error attempting to parse MapQuest Response-body', e instanceof nlobjError ? e.getDetails() : e.toString());
		results = {};
	}
	log('results', results);
	if (results.results[0].locations.length === 0) {
		log('Invalid Address Input');
		return;
	}
	var lat_lon =  {
		'latitude': results.results[0].locations[0].latLng.lat,
		'longitude': results.results[0].locations[0].latLng.lng
	};
	log('latitude longitude', lat_lon);
		//if (debug) console.log(address1, results.results[0].locations[0].latLng.lat, results.results[0].locations[0].latLng.lng);
		if (!return_type) nlapiSetFieldValue('custrecord_dispatch_latitude', lat_lon.latitude);
		if (!return_type) nlapiSetFieldValue('custrecord_dispatch_longitude', lat_lon.longitude);
		if (return_type == 'latitude') return lat_lon.latitude;
		if (return_type == 'longitude') return lat_lon.longitude;
}

function calculate_distance(lat1, lon1, lat2, lon2) {
	if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
	var R = 3959;
	var dLat = degrees_to_radius(lat2-lat1);
	var dLon = degrees_to_radius(lon2-lon1);
	var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(degrees_to_radius(lat1)) * Math.cos(degrees_to_radius(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	var d = R * c;
	return parseFloat(d.toFixed(2));
}

function degrees_to_radius(deg) {

	return parseFloat(deg * (Math.PI/180));
}

function get_assets() {

	/* Validate that a restricted search can be performed */
		var radius = parseFloat(jQuery('#filter_range').val() || 50);
		var latitude = nlapiGetFieldValue('custrecord_dispatch_latitude');
		var longitude = nlapiGetFieldValue('custrecord_dispatch_longitude');
		if (!latitude || !longitude) {
			alert('Must have a Latitude and Longitude specified.\n\nPlease correct and attempt to "Apply Filters" again.');
			return;
		}

	/* Clear table, create empty array to hold results */
		jQuery('#resources').DataTable().fnClearTable();
		var assets = [];

	/* Perform Search */
		var filter = [], column = [];
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
		filter.push(new nlobjSearchFilter('custrecord_rentalasset_status', null, 'anyof', [4])); // Off-Rent But Not Picked Up
		filter.push(new nlobjSearchFilter('custrecord_rentalitem_item', null, 'anyof', [nlapiGetFieldValue('custrecord_dispatch_model')]));
		filter.push(new nlobjSearchFilter('custrecord_rentalasset_addr1', null, 'isnotempty', null));
		filter.push(new nlobjSearchFilter('custrecord_rentalasset_contract', null, 'noneof', '@NONE@'));
		column.push(new nlobjSearchColumn('internalid', null, null));
		column.push(new nlobjSearchColumn('custrecord_rentalasset_customer', null, null));
		column.push(new nlobjSearchColumn('name', null, null));
		column.push(new nlobjSearchColumn('custrecord_rentalasset_addr1', null, null));
		column.push(new nlobjSearchColumn('custrecord_rentalasset_addr2', null, null));
		column.push(new nlobjSearchColumn('custrecord_rentalasset_city', null, null));
		column.push(new nlobjSearchColumn('custrecord_rentalasset_state', null, null));
		column.push(new nlobjSearchColumn('custrecord_rentalasset_zip', null, null));
		var results = nlapiSearchRecord('customrecord_rentalasset', null, filter, column);

	/* If the Search returned values, store in the empty array */
		if (results) {
			for (var i = 0, count = results.length ; i < count ; i++) {
				var addr1 = results[i].getValue('custrecord_rentalasset_addr1', null, null);
				var addr2 = results[i].getValue('custrecord_rentalasset_addr2', null, null);
				var city = results[i].getValue('custrecord_rentalasset_city', null, null);
				var state = results[i].getValue('custrecord_rentalasset_state', null, null);
				var zip = results[i].getValue('custrecord_rentalasset_zip', null, null);
				var asset_lat = get_latitude_longitude('latitude', addr1, addr2, city, state, zip, true);
				var asset_lon = get_latitude_longitude('longitude', addr1, addr2, city, state, zip, true);
				var asset = [
					results[i].getValue('internalid', null, null), //0
					results[i].getText('custrecord_rentalasset_customer', null, null), //1
					calculate_distance(asset_lat, asset_lon, latitude, longitude), //2
					results[i].getValue('name', null, null), //3
					results[i].getValue('custrecord_rentalasset_addr1', null, null), //4
					results[i].getValue('custrecord_rentalasset_addr2', null, null), //5
					results[i].getValue('custrecord_rentalasset_city', null, null), //6
					results[i].getValue('custrecord_rentalasset_state', null, null), //7
					results[i].getValue('custrecord_rentalasset_zip', null, null), //8
					asset_lat, //9
					asset_lon, //10
					'<a href="#" onclick="select_asset('+i+')">Select Asset</a>' //11
				];
				if (asset[2] <= radius) assets.push(asset);
			}
		}

	/* Set the Search-results */
		if (assets.length === 0) {
			alert('No Assets found pending pickup in the defined radius.');
		} else {
			jQuery('#resources').DataTable().fnAddData(assets);
			build_map();
		}
}

function select_asset(index) {
	var table = jQuery('#resources').DataTable();
	var data = table.fnGetData();
	data = data[index];
	var internalid = data[0];
	var addr1 = data[4];
	var addr2 = data[5];
	var city = data[6];
	var state = data[7];
	var zip = data[8];
	if (internalid) {
		nlapiSetFieldValue('custrecord_dispatch_deliverytype', 2);
		nlapiSetFieldValue('custrecord_dispatch_remoteasset', internalid);
		nlapiSetFieldValue('custrecord_rentalassetcurrentaddress1', addr1);
		nlapiSetFieldValue('custrecord_rentalassetcurrentaddress2', addr2);
		nlapiSetFieldValue('custrecord_rentalassetcurrentcity', city);
		nlapiSetFieldValue('custrecord_rentalassetcurrentstate', state);
		nlapiSetFieldValue('custrecord_rentalassetcurrentzipcode', zip);
		nlapiSetFieldValue('custrecord_dispatch_proboxnumber', internalid);
		nlapiDisableField('custpage_rentalasset', true);
		nlapiDisableField('custrecord_dispatch_deliverytype', true);
	}
}

function build_map() {

	/* Get values to assist in plotting */
		var latitude = parseFloat(nlapiGetFieldValue('custrecord_dispatch_latitude'));
		var longitude = parseFloat(nlapiGetFieldValue('custrecord_dispatch_longitude'));
		if (isNaN(latitude) || isNaN(longitude)) return;
		var searchRadius = parseFloat(nlapiGetFieldValue('custpage_radius') || 50);

	/* Reset Map-div */

		jQuery('#map_holder').html('<div id="map" style="width:1000px; height:300px;"></div>');

	/* Create Map-element */
		window.map = new MQA.TileMap({
			elt : document.getElementById('map'), /*ID of element on the page where you want the map added*/
			zoom : 9,	//initial zoom level of map
			latLng : {lat:33.411299, lng:-112.003994}, /*center of map in latitude/longitude*/
			mtype : 'map' /*map type (map)*/
		});
		var info = new MQA.Poi({
			lat:33.411299,
			lng:-112.003994
		});
		info.setInfoContentHTML('<b>ProBox Headquarters</b>');
		var service_icon = new MQA.Icon('https://www.mapquestapi.com/staticmap/geticon?uri=poi-blue_2.png',26,27);
		info.setIcon(service_icon);
		map.addShape(info);

	/* Create the Service Address plot */
		var info = new MQA.Poi({
			lat:latitude,
			lng:longitude
		});
		info.setInfoContentHTML('<b>'+nlapiGetFieldText('custrecord_dispatch_company') || 'Rental Address'+'</b>');
		var service_icon = new MQA.Icon('https://www.mapquestapi.com/staticmap/geticon?uri=poi-red_2.png',26,27);
		info.setIcon(service_icon);
		map.addShape(info);

	/* Plot Vendors if they exist */
		var data = jQuery('#resources').DataTable().fnGetData() || [], customer, name, latitude, longitude, asset_icon;
		if (data.length > 0) {
			for (var i = 0, count = data.length ; i < count ; i++) {
				if (!data[i][15]) {
					customer = data[i][1];
					name = data[i][3];
					latitude = data[i][9];
					longitude = data[i][10];
					asset = new MQA.Poi({
						lat: latitude,
						lng: longitude
					});
					asset.setInfoContentHTML('<div width="250px"><b>'+name+'</b><br><br>'+'Customer: '+customer+'<br><br><a href="#" onclick="select_asset('+i+')">Select Asset</a></div>');
					asset_icon = new MQA.Icon('https://www.mapquestapi.com/staticmap/geticon?uri=poi-blue_1.png',20,29);
					asset.setIcon(asset_icon);
					map.addShape(asset);
				}
			}
		}

	//add the circle overlay
	MQA.withModule('shapes', function() {
		var circle = new MQA.CircleOverlay();
		circle.radiusunit = 'MI';
		circle.radius = parseFloat(jQuery('#filter_range').val() || 50);
		circle.shapePoints = [33.411299,-112.003994];
		circle.color = '#B00303';
		circle.colorAlpha = 0.3;
		circle.borderWidth=4;
		circle.fillColor='#EFFF79';
		circle.fillColorAlpha = 0.2;
		map.addShape(circle);
	});

	//add the zoom overlay
	MQA.withModule('largezoom', function() {
		map.addControl(
			new MQA.LargeZoom(),
			new MQA.MapCornerPlacement(MQA.MapCorner.TOP_LEFT, new MQA.Size(5,5))
		);
	});
}

function create_pickup(rental_asset, delivery) {
	log('create_pickup', [rental_asset, delivery]);

	var pickup = nlapiCreateRecord('customrecord_dispatch');

	/* Find the current Rental Asset's previous Dispatch */
		var r_record = nlapiLoadRecord('customrecord_rentalasset', rental_asset);
		var o_dispatch = nlapiLookupField('salesorder', r_record.getFieldValue('custrecord_rentalasset_contract'), 'custbody_dispatchdelivery');
	
	/* Set data from the Dispatch Record */
		o_dispatch = nlapiLoadRecord('customrecord_dispatch', o_dispatch);
		var fields = o_dispatch.getAllFields();
		for (var i = 0, count = fields.length ; i < count ; i++) {
			if (fields[i].indexOf('custrecord_') != -1) {
				pickup.setFieldValue(fields[i], o_dispatch.getFieldValue(fields[i]));
			}
		}

	/* Overwrite values on the Pickup Record */
		var dispatch_data = {
			'customform' : 22,
			'custrecord_dispatch_dispatchtype' : 2,
			'custrecord_dispatch_status' : 5,
			'custrecord_dispatch_driver' : ''
		};
		for (var m_fields in dispatch_data) {
			pickup.setFieldValue(m_fields, dispatch_data[m_fields]);
		}

	pickup = nlapiSubmitRecord(pickup, false, true);

	//custrecord_dispatch_pickupdispatch field removed
	nlapiSubmitField('customrecord_dispatch', delivery, 'custrecord_dispatch_pickupdispatch', pickup);

	/* Update Sales Order w/ new Dispatch record reference */
		nlapiSubmitField('salesorder', o_dispatch.getFieldValue('custrecord_dispatch_contract'), 'custbody_dispatchpickup', pickup);

	/* Update Rental Asset to reflect being available as well as the newest record created against it */
			var u_fields = ['custrecord_rentalasset_lastdispatch', 'custrecord_rentalasset_status', 'custrecord_rentalasset_addr1', 'custrecord_rentalasset_addr2', 'custrecord_rentalasset_city', 'custrecord_rentalasset_state', 'custrecord_rentalasset_zip'];
			var u_values = [pickup, 3, '', '', '', '', ''];
			nlapiSubmitField('customrecord_rentalasset', o_dispatch.getFieldValue('custrecord_dispatch_proboxnumber'), u_fields, u_values);
}

function disable_field(name, disable) {
	// disable_field('custrecord_dispatch_proboxnumber', true);
	if (name == 'custrecord_dispatch_proboxnumber' && disable !== undefined) {
		var dispatch_type = nlapiGetFieldValue('custrecord_dispatch_dispatchtype'), current_asset = nlapiGetFieldValue('custrecord_dispatch_proboxnumber');
		if (dispatch_type == 1 || current_asset) {
			nlapiDisableField(name, true);
		}
	}
}