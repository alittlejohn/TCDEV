var serviceRequest = {
	workSublist:'custpage_servicerequest',
	addressMapping:{
		custrecord_servicerequest_address1:'address1',
		custrecord_servicerequest_address2:'address2',
		custrecord_servicerequest_city:'city',
		custrecord_servicerequest_state:'state',
		custrecord_servicerequest_zip:'zip',
		custrecord_servicerequest_addressid:'id'
	},
	pageInit:function(type) {

		addressLibrary.disable(true, this.addressMapping);
	},
	saveRecord:function(type) {

		if (nlapiGetLineItemCount(this.workSublist) === 0) {
			alert('Please enter Equipment before saving.');
			return false;
		}

		return true
	},
	validateField:function(type, name, line) {

		return true;
	},
	fieldChanged:function(type, name, line) {
		
		if (name == 'custrecord_servicerequest_customer') {
			var customer = nlapiGetFieldValue('custrecord_servicerequest_customer');
			if (customer) {
				var preferredShip = nlapiLookupField('customer', nlapiGetFieldValue('custrecord_servicerequest_customer'), 'shippingitem');
				if (preferredShip) {
					nlapiSetFieldValue('custrecord_servicerequest_shipmethod', preferredShip);
				}

				addressLibrary.appendAddresses(customer);
				addressLibrary.disable(true, this.addressMapping);
				this.getDistance();
			}
		}
		
		if (name == addressLibrary.fieldId) {
			var addressId = nlapiGetFieldValue(addressLibrary.fieldId);
			log('Address-select', {
				addressId:addressId
			});
			if (!addressId || addressId === 'custom')  {
				for (var clearField in this.addressMapping) {
					nlapiSetFieldValue(clearField, '', false, true);
				}
				if (addressId === 'custom') addressLibrary.disable(false, this.addressMapping, ['custrecord_servicerequest_addressid']);
				this.getDistance();
			} else {
				addressLibrary.disable(true, this.addressMapping);
				var customer = nlapiGetFieldValue('custrecord_servicerequest_customer');
				var address = addressLibrary.getAddresses(customer, addressId, true)[0];
				log('Address-data', address);
				for (var setField in this.addressMapping) {
					nlapiSetFieldValue(setField, address[this.addressMapping[setField]], false, true);
				}
				this.getDistance();
			}
		}
		
		if (name == 'custpage_serialnumber') {
			var serialNumber = nlapiGetCurrentLineItemValue('custpage_servicerequest', 'custpage_serialnumber');
			if (serialNumber) {
				serialNumber = removeSpecialCharacters(serialNumber);
				this.lookupEquipment(serialNumber);
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_serialnumber', serialNumber, false);
			} else {
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_exists', 'F');
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_manufacturer', '');
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_description', '');
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_contract', '');
			}
		}

		var addressFields = ['address1', 'city', 'state', 'zip'];
		if (addressFields.indexOf(name.replace('custrecord_servicerequest_', '')) > -1) {
			log('Clear Address ID', name);
			nlapiSetFieldValue('custrecord_servicerequest_addressid', '', false, true);
			this.getDistance();
		}

		if (name == 'custrecord_servicerequest_location') {
			
			this.getDistance();
		}		
	},
	postSourcing:function(type, name) {
	},
	lineInit:function(type) {
		if (type == 'custpage_servicerequest') {
			var internalID = nlapiGetCurrentLineItemValue('custpage_servicerequest', 'custpage_internalid');
			if (internalID) {
				this.disableLines(true);
			} else {
				this.disableLines(false);
			}
		}
	},
	validateLine:function(type) {

		return true;
	},
	validateInsert:function(type) {

		return true;
	},
	validateDelete:function(type) {
		
		var transactionsExist = this.checkForTransactions(type);
		if (transactionsExist) {
			var response = confirm(
				'Transactions are associated to this Service Work, as you sure you want to remove it? '+
				'Press OK to remove the line or Cancel to leave the line as is.\n\n'+
				'Removing the line from this Service Request will not remove it from any existing transactions.'
			);
			if (response) {
				return true;
			} else {
				return false;
			}
		}

		return true;
	},
	recalc:function(type) {
	},
	setInternalCustomer:function() {

		nlapiSetFieldValue('custrecord_servicerequest_customer', nlapiGetContext().getSetting('SCRIPT', 'custscript_request_internalcustomer'));
	},
	lookupAddress:function(value) {

		/* Get the customer and verify that the customer is populated */
			var customer = nlapiGetFieldValue('custrecord_servicerequest_customer');
			if (!customer) {
				alert('Please specify a customer before attempting to lookup an address.');
				nlapiSetFieldValue('custrecord_servicerequest_addlookup', '');
				return;
			}

		/* Run search to find address based on specified value */
			var filters = [
				['internalid', 'is', customer],
				'and',
				[
					['zipcode', 'contains', value],
					'or',
					['city', 'contains', value],
					'or',
					['address', 'contains', value]
				]
			];
			var columns = [];
				columns.push(new nlobjSearchColumn('addressee'));
				columns.push(new nlobjSearchColumn('address1'));
				columns.push(new nlobjSearchColumn('address2'));
				columns.push(new nlobjSearchColumn('city'));
				columns.push(new nlobjSearchColumn('state'));
				columns.push(new nlobjSearchColumn('zipcode'));
				columns.push(new nlobjSearchColumn('addressinternalid'));
			var results = nlapiSearchRecord('customer', null, filters, columns) || null;
			if (results) {
				nlapiSetFieldValue('custrecord_servicerequest_addressee', results[0].getValue('addressee'), false, true);
				nlapiSetFieldValue('custrecord_servicerequest_address1', results[0].getValue('address1'), false, true);
				nlapiSetFieldValue('custrecord_servicerequest_address2', results[0].getValue('address2'), false, true);
				nlapiSetFieldValue('custrecord_servicerequest_city', results[0].getValue('city'), false, true);
				nlapiSetFieldValue('custrecord_servicerequest_state', results[0].getValue('state'), false, true);
				nlapiSetFieldValue('custrecord_servicerequest_zip', results[0].getValue('zipcode'), false, true);
				nlapiSetFieldValue('custrecord_servicerequest_addressid', results[0].getValue('addressinternalid'), false, true);
			} else {
				alert('No address was found with the specified value. Please manually enter in the address (an Address Record will be created for this Customer).');
				nlapiSetFieldValue('custrecord_servicerequest_addlookup', '');
				return true;
			}
	},
	getDistance:function() {
		
		var location = nlapiGetFieldValue('custrecord_servicerequest_location');
		if (!location) return;
		var geoLocations = JSON.parse(nlapiGetContext().getSessionObject('custpage_geolocations'));
		distance.companyLatitude = geoLocations[location].latitude,
			distance.companyLongitude = geoLocations[location].longitude;

		var customerAddress = {
			street:nlapiGetFieldValue('custrecord_servicerequest_address1'),
			city:nlapiGetFieldValue('custrecord_servicerequest_city'),
			state:nlapiGetFieldValue('custrecord_servicerequest_state'),
			zip:nlapiGetFieldValue('custrecord_servicerequest_zip')
		};

		for (var key in customerAddress) {
			if (!customerAddress[key]) {
				nlapiSetFieldValue('custrecord_servicerequest_distance', '');
				return;
			}
		}

		distance.customerAddress = customerAddress;
		distance.callback = serviceRequest.distanceCallback;
		distance.calculate(true);
	},
	distanceCallback:function(miles) {
		
		nlapiSetFieldValue('custrecord_servicerequest_distance', miles || '');
	},
	lookupEquipment:function(value) {

		/* Get the customer and verify that the customer is populated */
			var customer = nlapiGetFieldValue('custrecord_servicerequest_customer');
			if (!customer) {
				alert('Please specify a customer before attempting to add Equipment.');
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_serialnumber', '');
				return;
			}

		/* Run search to find Equipment based on specified value */
			var filters = [];
				filters.push(new nlobjSearchFilter('internalidnumber', 'custrecord_equipment_customer', 'equalto', customer));
				filters.push(new nlobjSearchFilter('name', null, 'is', value));
			var columns = [];
				columns.push(new nlobjSearchColumn('name'));
				columns.push(new nlobjSearchColumn('custrecord_equipment_mfg'));
				columns.push(new nlobjSearchColumn('custrecord_equipment_description'));
				columns.push(new nlobjSearchColumn('custrecord_equipment_scontract'));
			var results = nlapiSearchRecord('customrecord_equipment', null, filters, columns) || null;
			if (results) {
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_exists', 'T');
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_manufacturer', results[0].getValue('custrecord_equipment_mfg'));
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_description', results[0].getValue('custrecord_equipment_description'));
				nlapiSetCurrentLineItemValue('custpage_servicerequest', 'custpage_contract', results[0].getValue('custrecord_equipment_scontract'));
			}
	},
	disableLines:function(disable) {
		var fields = [
			'custpage_serviceitem',
			'custpage_serialnumber',
			'custpage_manufacturer',
			'custpage_description',
			'custpage_symptoms',
			'custpage_status'
		];
		for (var i = 0 ; i < fields.length ; i++) {
			nlapiDisableLineItemField('custpage_servicerequest', fields[i], disable);
		}
	},
	checkForTransactions:function(type) {
		if (type == this.workSublist) {
			var id = nlapiGetCurrentLineItemValue(type, 'custpage_internalid');
			if (id) {
				var transactions = nlapiLookupField('customrecord_servicework', id, ['custrecord_service_work_estimate', 'custrecord_service_work_salesorder']);
				if (transactions.custrecord_service_work_estimate || transactions.custrecord_service_work_salesorder) {
					return true;
				}
			}
		}
		return false;
	}
};