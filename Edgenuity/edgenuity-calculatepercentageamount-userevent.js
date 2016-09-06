/* Generic Logging Function */
	function log(m, d, l) {
		if (typeof d == 'object') d = JSON.stringify(d);
		m = m === undefined ? '[No Message Specified]' : m;
		d = d === undefined ? '' : d;
		switch (l) {
			case 1:
				l = 'DEBUG';
				break;
			case 2:
				l = 'AUDIT';
				break;
			case 3:
				l = 'ERROR';
				break;
			default:
				l = 'DEBUG';
		}
		nlapiLogExecution(l, m, d);
	}

function _get_classes() {
	var data = {};
	var filter = [];
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
	var column = [];
		column.push(new nlobjSearchColumn('name'));
		column.push(new nlobjSearchColumn('internalid'));
	var results = nlapiSearchRecord('classification', null, filter, column) || [];
	for (var i = 0, count = results.length ; i < count ; i++) {
		data[results[i].getId()] = results[i].getValue('name');
	}
	nlapiGetContext().setSessionObject('custpage_calc_classes', JSON.stringify(data));
}

function before_load(type, form, request) {
	if (type == 'create' || type == 'edit' || type == 'copy') {

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
				'validform': valid_forms.indexOf(parseInt(nlapiGetFieldValue('customform'), 10)) != -1
			});

		if (valid_forms.indexOf(parseInt(nlapiGetFieldValue('customform'), 10)) != -1) {
			form.getSubList('item')
				.addButton('custpage_calcpercentages', 'Update Percentage Based Items', '_validate_percentages()');
			if (!nlapiGetContext().getSessionObject('custpage_calc_classes')) _get_classes();
		}
	}
}