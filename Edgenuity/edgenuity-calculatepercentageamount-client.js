function log(m, d) {if (nlapiGetUser() == 3) console.log(m, d);}

/* Valid forms to apply this development too
	NOTE: Ensure the column-field is present 
	on the transaction (even if there is no 
	label on the column-field)
	*/
	var valid_forms = [
		128, // Edgenuity Quote (Detailed for RFP)
		131, // Edgenuity Quote (Detailed)-All
		126, // Edgenuity Quote (Sales Support)
		132, // Edgenuity Quote 1 (Grand Total Only)
		129, // Edgenuity Quote 2 (Line & Grand Totals)
		146, // Edgenuity quote 3 (No Grand Total)
		183, // Edgenuity Quote 4 (RFP Bid Team)
		124, // Edgenuity Quote contract date(Summary)
		125, // Edgenuity Quote Contract dates (Detailed)
		222, // Edgenuity Quote No Qty/No Per Unit
		133, // Edgenuity Quote Proforma Invoice
		231, // Enhanced Quote Form
		97, // Standard Quote
		130, // E2020 Proforma Invoice
		216, // E2020 Proforma Invoice – PCI
		108, // E2020 Sales Order
		217, // E2020 Sales Order – PCI
		230, // Enhanced Sales Order Form
		68, // Standard Sales Order
		89 // Standard Sales Order - Invoice
	];
	log('Valid Form to apply Percentage Based Calcs?',
		{'customform':nlapiGetFieldValue('customform'),
		'validform': valid_forms.indexOf(parseInt(nlapiGetFieldValue('customform'), 10)) != -1,
		'fieldsexposed': nlapiGetLineItemField('item', 'class') !== null && nlapiGetLineItemField('item', 'custcol_businesstypeamount') !== null && nlapiGetLineItemField('item', 'custcol_businessamountpercent') !== null
	});
	var validform = valid_forms.indexOf(parseInt(nlapiGetFieldValue('customform'), 10)) != -1 && nlapiGetLineItemField('item', 'class') !== null && nlapiGetLineItemField('item', 'custcol_businesstypeamount') !== null && nlapiGetLineItemField('item', 'custcol_businessamountpercent') !== null;

function _calc_percentage_amount(classes, percentage, line) {
	var amount = 0;
	for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
		var current_item = nlapiGetLineItemText('item', 'item', i);
		var current_class = (nlapiGetLineItemValue('item', 'class', i) || '').toString();
		var current_amount = parseFloat(nlapiGetLineItemValue('item', 'amount', i) || 0);
		if (classes.indexOf(current_class) !== -1) {
			if (line != i || (!line && parseFloat(nlapiGetCurrentLineItemIndex('item'), 10) != i)) {
				if (!nlapiGetLineItemValue('item', 'custcol_businessamountpercent', i)) {
					amount += current_amount;
				}
			}
		}
	}
	log('_calc_percentage_amount', {'classes':classes, 'percentage':percentage, 'line':line, 'amount':amount});

	var quantity;
	if (line) {
		nlapiSelectLineItem('item', line);
		quantity = parseFloat(nlapiGetCurrentLineItemValue('item', 'quantity'));
		nlapiSetCurrentLineItemValue('item', 'rate', (amount * percentage)/quantity);
		nlapiCommitLineItem('item');
		if (amount === 0) {

			var class_names = JSON.parse(nlapiGetContext().getSessionObject('custpage_calc_classes') || '{}');
			var alert_message = nlapiGetLineItemText('item', 'item', line)+' must be used in conjunction with items that reference these Business Types:\n\n';

			for (var c = 0, count_c = classes.length ; c < count_c ; c++) {
				alert_message += class_names[classes[c]] + '\n';
			}

			alert_message += '\nPlease add the appropriate item(s), then click the "Update Percentage Based Items" button to see the price.';
			alert(alert_message);
			return false;
		}
	} else {
		quantity = parseFloat(nlapiGetCurrentLineItemValue('item', 'quantity'));
		nlapiSetCurrentLineItemValue('item', 'rate', (amount * percentage)/quantity);
	}
}

// Post Sourcing
function _set_business_type_list(type, name) {
	log('_set_business_type_list', {'type':type, 'name':name, 'validform':validform});
	if (type == 'item' && name == 'item' && validform) {
		var item = nlapiGetCurrentLineItemValue('item', 'item');
		if (item) {
			var business_types = nlapiLookupField('item', item, 'custitem_businesstypeamount');
			log('business_types', business_types);
			if (business_types) {
				business_types = business_types.split(',');
				nlapiSetCurrentLineItemValue('item', 'custcol_businesstypeamount', JSON.stringify(business_types));
			} else {
				nlapiSetCurrentLineItemValue('item', 'custcol_businesstypeamount', '');
			}
		}
	}
}

// Validate Line
function _set_percentage_amount() {
	log('_set_percentage_amount', {'validform':validform});
	if (!validform) return true;
	if (nlapiGetCurrentLineItemValue('item', 'custcol_businesstypeamount')) {
		var classes = JSON.parse(nlapiGetCurrentLineItemValue('item', 'custcol_businesstypeamount'));
		var percentage = parseInt(nlapiGetCurrentLineItemValue('item', 'custcol_businessamountpercent') || 0, 10)/100;
		_calc_percentage_amount(classes, percentage, null);
	}
	return true;
}

// Save Record
function _validate_percentages() {
	log('_validate_percentages', {'validform':validform});
	if (!validform) return true;
	var response = true, audit = {};
	for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
		var classes = nlapiGetLineItemValue('item', 'custcol_businesstypeamount', i);
		if (!classes) continue;
		classes = JSON.parse(classes);
		var percentage =  parseInt(nlapiGetLineItemValue('item', 'custcol_businessamountpercent', i) || 0, 10)/100;
		response = _calc_percentage_amount(classes, percentage, i);
		audit[i] = {
			'line': i,
			'classes': classes,
			'percentage': percentage,
			'valid': response
		};
		if (response === false) break;
	}
	log('_validate_percentages', audit);
	if (response === false) return false;
	return true;
}