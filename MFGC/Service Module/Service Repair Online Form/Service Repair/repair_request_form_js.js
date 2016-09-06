/* Submit Form */
jQuery('#submitbtn').on('click', function() {
	var valid = true;

	var custEmail = jQuery('#email').val();
	if (custEmail) {
		if (!validateEmail(custEmail)) {
				alert('Please enter a valid email address');
				valid = false;
		} else {
			jQuery('#email').removeClass('red');
		}
	} else {
		jQuery('#email').addClass('red');
		//alert('Please enter your email address');
		valid = false;
	}

	var firstName = jQuery('#fname').val();
	if (!firstName) {
		jQuery('#fname').addClass('red');
		//alert('Please enter your first name');
		valid = false;
	} else {
		jQuery('#fname').removeClass('red');
	}

	var lastName = jQuery('#fname').val();
	if (!lastName) {
		jQuery('#lname').addClass('red');
		//alert('Please enter your last name');
		valid = false;
	} else {
		jQuery('#lname').removeClass('red');
	}

	var address = jQuery('#address1').val();
	if (!address) {
		jQuery('#address').addClass('red');
		//alert('Please enter your address');
		valid = false;
	} else {
		jQuery('#address').removeClass('red');
	}

	var city = jQuery('#city').val();
	if (!city) {
		jQuery('#city').addClass('red');
		//alert('Please enter your city');
		valid = false;
	} else {
		jQuery('#city').removeClass('red');
	}

	var stateVal = jQuery('#state').val();
	if (!stateVal) {
		jQuery('#state').addClass('red');
		//alert('Please select a state');
		valid = false;
	} else {
		jQuery('#state').removeClass('red');
	}	

	var zip = jQuery('#zip').val();
	if (!zip) {
		jQuery('#zip').addClass('red');
		//alert('Please enter your zip code');
		valid = false;
	} else {
		jQuery('#zip').removeClass('red');
	}

	var phone = jQuery('#phone').val();
	if (!phone) {
		jQuery('#phone').addClass('red');
		//alert('Please enter your phone number');
		valid = false;
	} else {
		jQuery('#phone').removeClass('red');
	}	

	if (!valid) {
		valid = false;
		alert('Please enter all required fields');
	}

	// Validate at least one item was entered
	if (valid) {
		if (jQuery('#completeItemList_1').val() == '' || jQuery('#completeItemList_1').val() == '[]') {
			valid = false;
			alert('Please add the equipment you want serviced');
		}
	}

	/* All data has been entered so submit the form */
	if (valid) {
		console.info('Submitting request');
		jQuery('#repair_request_form').submit();
	}
});

/* Load */
jQuery(window).load(function() {
		jQuery('form').get(0).reset(); //clear form data on page load
});

/* Validate email */
function validateEmail(email){
	var emailReg = new RegExp(/^(("[\w-\s]+")|([\w-]+(?:\.[\w-]+)*)|("[\w-\s]+")([\w-]+(?:\.[\w-]+)*))(@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$)|(@\[?((25[0-5]\.|2[0-4][0-9]\.|1[0-9]{2}\.|[0-9]{1,2}\.))((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})\.){2}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})\]?$)/i);
	var valid = emailReg.test(email);

	if(!valid) {
        return false;
    } else {
    	return true;
    }
}

// add line
jQuery(".add-row").on("click", function() {

	var itemnum = jQuery(this).attr("data-num");

    var selected = true;

    if (selected) {
	    jQuery('input[id^="sn"]').each(function() {
	    	if(jQuery(this).val() == "") {
	    		selected = false;
	    		alert('Please enter a serial number');
	    	}
	    });
	}

    if (selected) {
	    jQuery('input[id^="make"]').each(function() {
	    	if(jQuery(this).val() == "") {
	    		selected = false;
	    		alert('Please enter a model/make');
	    	}
	    });
	}

    if (selected) {
	    jQuery('textarea[id^="problem"]').each(function() {
	    	if(jQuery(this).val() == "") {
	    		selected = false;
	    		alert('Please enter a problem description');
	    	}
	    });
	}	

    if (selected) {
		jQuery('#remove-row-' + itemnum).attr("disabled", false);
		cloneRow(itemnum);
		updateItemList(itemnum);
	}

});

jQuery('.remove-row').on("click", function() {
	console.log('remove-row');

	var casenum = jQuery(this).attr("data-num");
	removeRow(casenum);
	updateItemList(casenum);
});

function removeRow(casenum) {
	var item_length = jQuery('div#item').length;
	if (item_length > 1) {
		jQuery(jQuery('div#item')[item_length-1]).remove();
	}
	if (item_length == 1) {
		jQuery('#sn_1').val('');
		jQuery('#make_1').val('');
		jQuery('#problem_1').val('');
	}
}

function cloneRow(num) {
	var item_length = jQuery('div#item').length;
	jQuery(jQuery('div#item')[item_length-1]).clone().find("input, textarea").each(function() {
		var objThisObj = jQuery(this);
		var objThisName = jQuery(this).attr('name');
	}).addClass('margin-top20').val('').end().insertBefore('.item-buttons');
}
function updateItemList(num) {
	var items = [];
	jQuery('div#item').each(function() {
		var fields = jQuery(this).find('input, textarea');
		var sn = fields[1].value;
		var make = fields[2].value;
		var problem = fields[3].value;
		if (!sn || !make || !problem) {
			// skip
		} else {
			items.push({
				'sn':sn,
				'make':make,
				'problem':problem
			});
		}
	});
	console.log(items);
	jQuery('#completeItemList_1').val(JSON.stringify(items));
}
function getDistanceToRepairFacility() {

    var locations = [];
    var distances = [];

	var url = "https://system.na1.netsuite.com/app/site/hosting/scriptlet.nl?script=163&deploy=2&compid=1157106&h=7c505c928103c9e46364";
	jQuery.getJSON(url, {
		'action': 'get_repair_locations'
		}, function(locations) {

		// var facilities = ['750 N US Hwy 17/92, Longwood, FL 32750', '5864 Phillips Highway, Jacksonville, FL 32216', '1611 S.R. 60 East, Valrico, FL 33594'];

    	var directionsService = new google.maps.DirectionsService();

    	var origin = jQuery('#address1').val() + ' ' + jQuery('#city').val() + ' ' + jQuery('#state :selected').text() + ' ' + jQuery('#zip').val();

		var idx = 0;
    	for (var i=0; i<locations.length; i++) {

		    var dirRequest = {
	    		origin : origin,
	    		destination : locations[i].address.replace(/[\n\r]/g,' '),
	    		travelMode : google.maps.DirectionsTravelMode.DRIVING,
	    		unitSystem : google.maps.UnitSystem.IMPERIAL
	    	}

			directionsService.route(dirRequest, function(response, status) {
	  			if ( status == google.maps.DirectionsStatus.OK ) {
	    			//alert( response.routes[0].legs[0].distance.text ); // the distance in metres
	    			console.info('route', response.routes[0].legs[0].distance);
	    			var distance = response.routes[0].legs[0].distance.text;
	    			distance = distance.substring(0, distance.indexOf('mi')-1);
	    			distances[idx] = parseFloat(distance.replace(/,/g, ''), 10).toFixed(2);
	    			idx++;

	    			// Check if all of the data has arrived
	    			if (distances.length == locations.length) {
						for (var k=0; k<locations.length; k++) {
							locations[k].distance = distances[k];
						}
						findClosestRepairCenter(locations);
	    			}
	  			}
	  			else {
			    	alert('error calculating distance');
			    	distances[idx] = 'error';
			    	idx++;
			    }
			});
		}
	});
}

function findClosestRepairCenter(locations) {
	console.info('locations', locations);

	locations.sort(function(a,b) {
		return parseFloat(a.distance) - parseFloat(b.distance);
	});

	if (locations[0].distance > 30.0) {
		alert('Request Pickup/Delivery and On-Site Repair are not available because there are no repair locations within 30 miles of your address');
		jQuery('#request :first-child').prop('selected', 'selected');
		jQuery('#repair-facility').hide();
	} else {
		jQuery('#facilities').children().remove();
		for (var k=0; k<locations.length; k++) {
			jQuery('#facilities').append('<option value="'+locations[k].id+'">'+locations[k].name + ' - ' + locations[k].distance + ' mi' +'</option>');
		}
		jQuery('#repair-facility').show();
		jQuery('#facilities :first-child').prop('selected', 'selected');
	}
}

jQuery('#email').on('change', function() {
    data = [];
    jQuery('#request :first-child').prop('selected', 'selected');
    jQuery('#repair-facility').hide();

	var url = "https://system.na1.netsuite.com/app/site/hosting/scriptlet.nl?script=163&deploy=2&compid=1157106&h=7c505c928103c9e46364";
	jQuery.getJSON(url, {
		'email' : jQuery(this).val(),
		'action': 'get_customer'
	}, function(data) {

		jQuery('#customer').find('input').not('#email').each(function(){
			jQuery(this).val('').prop('disabled', false).removeClass('red');
		})
		jQuery('#state').val(0).prop('disabled', false).removeClass('red');
		jQuery('#email').removeClass('red');

		if (data.length > 0) {
			jQuery('#email').val(data[0].email);
			jQuery('#fname').val(data[0].firstname).prop('disabled', 'disabled');
			jQuery('#lname').val(data[0].lastname).prop('disabled', 'disabled');
			jQuery('#address1').val(data[0].addrs1).prop('disabled', 'disabled');
			jQuery('#address2').val(data[0].addrs2).prop('disabled', 'disabled');
			jQuery('#city').val(data[0].city).prop('disabled', 'disabled');
			jQuery('#state').val(data[0].state).prop('disabled', 'disabled');
			jQuery('#zip').val(data[0].zip).prop('disabled', 'disabled');
			jQuery('#phone').val(data[0].phone).prop('disabled', 'disabled');
			jQuery('#companyname').val(data[0].companyname).prop('disabled', 'disabled');
		}
		else {
           
		}
	});
});

jQuery('#request').on('change', function() {

	var req = jQuery('#request').val();

	// If customer requested pick-up or on-site repair, determine if address is within 30 miles
	if (req == "2" || req == "3") {

		if (jQuery('#address1') == '' || jQuery('#city') == '' || jQuery('#state :selected').text() == '' || jQuery('#zip').val() == '') {
			alert('Please enter a complete customer address to determine the nearest repair facility');
			jQuery('#request').val(1);
		} else {
			getDistanceToRepairFacility();
		}
	}

});

jQuery('#facilities').on('change', function() {
	var req = jQuery('#facilities :selected').text();

	var request = parseFloat(req.substring(req.indexOf(' - ')+3, req.length-3));

	if (request > 30.0) {
		alert('Request Pickup/Delivery and On-Site Repair are not available because this location is not within 30 miles of your address');
		jQuery('#request').val(1);
	}

});