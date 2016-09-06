var serviceTransaction = {
	pageInit:function() {

		this.setServiceRequestValues();

		this.addServiceParts();
	},
	saveRecord:function(type) {

		return true
	},
	validateField:function(type, name, line) {

		return true;
	},
	fieldChanged:function(type, name, line) {
	},
	postSourcing:function(type, name) {
	},
	lineInit:function(type) {
	},
	validateLine:function(type) {

		return true;
	},
	validateInsert:function(type) {

		return true;
	},
	validateDelete:function(type) {

		return true;
	},
	recalc:function(type) {
	},
	setServiceRequestValues:function() {
		var values = nlapiGetFieldValue('custpage_servicerequestvalues');
		if (values) {

			values = JSON.parse(values);
			log('Service Request Values', values);

			for (var field in values.body) {
				nlapiSetFieldValue(field, values.body[field], true, true);
			}

			for (var i = 0, count = values.lines.length ; i < count ; i++) {
				nlapiSelectNewLineItem('item');
				for (var lineField in values.lines[i]) {
					if (lineField.indexOf('_') !== 0) nlapiSetCurrentLineItemValue('item', lineField, values.lines[i][lineField], true, true);
				}
				if (values.lines[i]._internalCustomer) nlapiSetCurrentLineItemValue('item', 'rate', 0, true, true);
				nlapiCommitLineItem('item');
			}
		}
	},
	servicePartAlert:function() {
		if (!nlapiGetRecordId() && nlapiGetLineItemCount('item') === 0 && nlapiGetFieldValue('custbody_servicerequest')) {
			alert('Press \'Add Service Parts\' to set parts and labor from the Service Request.');
		}
	},
	addServiceParts:function() {
		var parts = nlapiGetFieldValue('custpage_servicepartjson')
		if (!parts) return;
		parts = JSON.parse(parts);

		var response, removedRows = [];
		for (var i = nlapiGetLineItemCount('item') ; i >= 1 ; i--) {
			var servicePart = nlapiGetLineItemValue('item', 'custcol_servicepart', i);
			if (servicePart) {
				var servicePartIndex = misc.index(parts, servicePart, 'id');
				if (servicePartIndex !== null) {
					nlapiRemoveLineItem('item', i);
					removedRows.push(i);
				}
			}
		}

		if (response === false) return true;

		var internalCustomer = false;
		if (nlapiGetFieldValue('entity') == nlapiGetContext().getSetting('SCRIPT', 'custscript_request_internalcustomer')) internalCustomer = true;

		for (var ii = 0, count = parts.length ; ii < count ; ii++) {
			nlapiSelectNewLineItem('item');
				nlapiSetCurrentLineItemValue('item', 'item', parts[ii].item, true, true);
				nlapiSetCurrentLineItemValue('item', 'quantity', parts[ii].quantity, true, true);
				nlapiSetCurrentLineItemValue('item', 'custcol_servicepart', parts[ii].id, true, true);
				if (!nlapiGetCurrentLineItemValue('item', 'amount') || internalCustomer) nlapiSetCurrentLineItemValue('item', 'amount', 0);
			nlapiCommitLineItem('item');
		}
	}
};