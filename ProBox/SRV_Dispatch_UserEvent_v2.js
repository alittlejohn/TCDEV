function beforeLoad(type, form, request) {
	/* RECORD DISPATCH STATE AT LOAD OF RECORD */
	var context = nlapiGetContext();
	var BF_DispatchStatus = nlapiGetFieldValue('custrecord_dispatch_status');
	context.setSessionObject('dispatch_status', BF_DispatchStatus);
	/* Add Javascript libraries to the page */
	append_scripts(type, form);
	var custom_form = nlapiGetFieldValue('customform');
	/* Populate values from Sales Order */
	if (request) {
		var sales_order = request.getParameter('so');
		if (sales_order) {
			sales_order = nlapiLoadRecord('salesorder', sales_order);

			/* Define fields to grab and how to store them */
			var fields = {
				'entity': 'custrecord_dispatch_company',
				'custbody_contact': 'custrecord_dispatch_sitecontact',
				'custbody_site_contact_phone': 'custrecord_dispatch_contactphone',
				'custbody_callfirst': 'custrecord_dispatch_callfirst',
				'custbody_deliveryzone': 'custrecord_dispatch_deliveryzone',
				'custbody_deliverynotes': 'custrecord_dispatch_deliveryinstructions',
				'custbody_delivery_date': 'custrecord_dispatch_deliverydate',
				//'custbody_promisedtime' : 'custrecord_dispatch_deliverytime',
				'shipaddr1': 'custrecord_dispatch_addr1',
				'shipaddr2': 'custrecord_dispatch_addr2',
				'shipcity': 'custrecord_dispatch_city',
				'shipstate': 'custrecord_dispatch_state',
				'custbody1': 'custrecord_addl_pickup_notes',
				// 'custbody_reserved_item' : 'custrecord_reserved_item', need fixed not rental
				'shipzip': 'custrecord_dispatch_zip'
			};

			/* Store values from Sales Order and default values */
			var data = {
				'custrecord_dispatch_contract': sales_order['id'],
				'custrecord_dispatch_dispatchtype': custom_form != 22 ? 1 : 2,
				'custrecord_dispatch_status': custom_form != 22 ? 2 : 5
					// Removing as per requirements email from Brad on 6/20
					//'custrecord_dispatch_proboxnumber' : custom_form != 22 ? '' : sales_order.getFieldValue('custbody_rentalasset')
			};
			if (custom_form == 42) {
				data.custrecord_dispatch_dispatchtype = 3;
			}
			for (var field in fields) {
				data[fields[field]] = sales_order.getFieldValue(field);
			}
			// Get the Rental Item
			for (var i = 1, count = sales_order.getLineItemCount('item'); i <= count; i++) {
				var item = sales_order.getLineItemValue('item', 'item', i);
				var item_type = sales_order.getLineItemValue('item', 'itemtype', i);
				if (item_type == 'NonInvtPart') {
					if (nlapiLookupField('noninventoryitem', item, 'custitem_container') == 'T') data.custrecord_dispatch_model = item;
				}
			}

			/* Set values on Dispatch record */
			log('sales_order data', data);
			for (var d_fields in data) {
				nlapiSetFieldValue(d_fields, data[d_fields]);
			}
			/* Grab fixed asset by referencing rental asset field on contract. Default value */
			var reserved_rental_item = sales_order.getFieldValue('custbody_reserved_item');
			if (reserved_rental_item) {
				var reserved_fixed_item = nlapiLookupField('customrecord_rentalasset', reserved_rental_item, 'custrecord_rentalasset_asset');
				// will only set on create. nlapiSetFieldValue doesn't work in before load under edit context
				nlapiSetFieldValue('custrecord_reserved_item', reserved_fixed_item);
			}
		}
	}

	/* Set Latitude and Longitude */

	get_latitude_longitude();

	/* Create Map & Vendor Sublist to populate with Vendors near the location specified */
	if (custom_form != 22 && custom_form != 42) {
		if (type == 'create' || type == 'edit') {
			var tab = form.addTab('custpage_resourcelookup', 'Asset Lookup');
			form.insertTab(tab, 'custom38');
			build_map_and_sublist(type, form);
		}
	}

	/* Create Button to allow the user to Query for Latitude and Longitude */
	if (type == 'create' || type == 'edit') {
		form.addButton('custpage_getcoordinates', 'Get Coordinates', 'get_latitude_longitude()');
	}

	/* Create dynamic field that would allow users to select ONLY Available Assets */
	if (type == 'create' || type == 'edit') {

		var current_rental_asset = nlapiGetFieldValue('custrecord_dispatch_proboxnumber');
		var reserved_fam_asset = nlapiGetFieldValue('custrecord_reserved_item');
		log('reserved_fam_asset', reserved_fam_asset);
		var dispatch_type = nlapiGetFieldValue('custrecord_dispatch_dispatchtype');
		log('current_rental_asset', current_rental_asset);
		if (!current_rental_asset && dispatch_type != 2) {

			/* Create dynamic field */
			var dynamic_selection = form.addField('custpage_rentalasset', 'select', 'Available Rental Selector', null);
			dynamic_selection.addSelectOption('', '');
			form.insertField(dynamic_selection, 'custrecord_dispatch_proboxnumber');

			/* Search to get list of Available Assets */
			var model = nlapiGetFieldValue('custrecord_dispatch_model');
			var filter = [],
				column = [];
			filter.push(['isinactive', 'is', 'F']);
			filter.push('and', ['custrecord_rentalasset_status', 'is', 3]);
			if (reserved_fam_asset) {
				filter.push('and', [
					['custrecord_rentalasset_asset.custrecord_assetsalestatus', 'anyof', 1], 'or', ['custrecord_rentalasset_asset', 'anyof', reserved_fam_asset]
				]); //rental asset's fam asset is "available" or asset any of reserved asset
			}
			if (model && !reserved_fam_asset) filter.push('and', ['custrecord_rentalitem_item', 'is', model]);

			column.push(new nlobjSearchColumn('name', null, null));
			column.push(new nlobjSearchColumn('custrecord_rentalitem_item', null, null));
			var results = nlapiSearchRecord('customrecord_rentalasset', null, filter, column) || [];
			log('results', results);
			for (var o = 0, count_o = results.length; o < count_o; o++) {
				dynamic_selection.addSelectOption(results[o].getId(), model ? results[o].getValue('name', null, null) : results[o].getText('custrecord_rentalitem_item', null, null) + ' : ' + results[o].getValue('name', null, null));
			}

			/* adds reserved item to the dynamic list and sets it as a default. Only works if this was set on the sales order */
			var reserved_rental_item_value = nlapiLookupField('salesorder', nlapiGetFieldValue('custrecord_dispatch_contract'), 'custbody_reserved_item');
			var reserved_rental_item_text = nlapiLookupField('salesorder', nlapiGetFieldValue('custrecord_dispatch_contract'), 'custbody_reserved_item', true);
			log('reserved_rental_item_value', reserved_rental_item_value);
			if (reserved_rental_item_value) {
				dynamic_selection.addSelectOption(reserved_rental_item_value, reserved_rental_item_text, true);
				nlapiSetFieldValue('custrecord_dispatch_proboxnumber', reserved_rental_item_value);
				log('probox_number', nlapiGetFieldValue('custrecord_dispatch_proboxnumber'));
			}
		}
	}

}

function beforeSubmit(type) {
}

function afterSubmit(type) {

    log('After Submit - Start', {
        type:type,
        recordId:nlapiGetRecordType(),
        user:nlapiGetUser()
    });
	if (type == 'create' || type == 'edit') {
		
		var context = nlapiGetContext();
		var BL_DispatchStatus = context.getSessionObject('dispatch_status');
		var AS_DispatchStatus = nlapiGetFieldValue("custrecord_dispatch_status");

		/* Define generic variables for later use */
		var fields, values;

		var this_dispatch = parseInt(nlapiGetRecordId() || 0, 10);
		var isSale = false;
		var probox_number = nlapiGetFieldValue('custrecord_dispatch_proboxnumber');
		if(nlapiGetFieldValue('customform') == '45'){
			probox_number = nlapiGetFieldValue('custrecord_disp_asset');
			isSale = true;
		} 
		var dispatch_type = nlapiGetFieldValue('custrecord_dispatch_dispatchtype');
		var delivery_type = nlapiGetFieldValue('custrecord_dispatch_deliverytype');
		var sales_order = nlapiGetFieldValue('custrecord_dispatch_contract');
		var status = nlapiGetFieldValue('custrecord_dispatch_status'); //2 - Pending Delivery, 4 - Delivery Completed, 5 - Pending Pick-Up, 6 - Pick-up Complete
		var current_dispatch = probox_number ? parseInt(nlapiLookupField('customrecord_rentalasset', probox_number, 'custrecord_rentalasset_lastdispatch') || 0, 10) : 0;
		var remote_asset = nlapiGetFieldValue('custrecord_dispatch_remoteasset');
		var customer = nlapiGetFieldValue('custrecord_dispatch_company');
		var fixedAsset = nlapiGetFieldValue('custrecord_disp_asset');

		/* Case 7604
			Automated Asset Disposal
			*/
			var disposed = disposeOfAsset();

		/* Update Sales Order w/ new Dispatch record reference */
			if (dispatch_type == 1 && sales_order && !isSale) {
				fields = [], values = [];
				fields.push('custbody_dispatchdelivery');
				values.push(this_dispatch);
				if (probox_number) {
					fields.push('custbody_rentalasset');
					values.push(probox_number);
				}
				nlapiSubmitField('salesorder', nlapiGetFieldValue('custrecord_dispatch_contract'), fields, values);
			}
			if (dispatch_type == 2 && sales_order) {
				nlapiSubmitField('salesorder', nlapiGetFieldValue('custrecord_dispatch_contract'), 'custbody_dispatchpickup', this_dispatch);
			}

		/* Create Transaction(s) 
            Fulfillment and Invoice
            */
			var deliveryDate = nlapiGetFieldValue('custrecord_dispatch_deliverydate');
	    		if (probox_number && dispatch_type == 1 && sales_order && deliveryDate) {

	                var error = {}, fulfillmentId, invoiceId;

	                log('1/2 Create Transaction', {
	                    dispatchId:nlapiGetRecordId(),
	                    proboxNumber:probox_number,
	                    dispatchType:dispatch_type,
	                    salesOrderId:sales_order,
	                    deliveryDate:deliveryDate,
	                });

	    			try {
	    				/* Create Fulfillment */
	        				var fulfillment = nlapiTransformRecord('salesorder', sales_order, 'itemfulfillment');
	        				    fulfillment.setFieldValue('trandate', deliveryDate);
	        				fulfillmentId = nlapiSubmitRecord(fulfillment, true, true);
	    			} catch(e) {
	                    if (e instanceof nlobjError) {
	                        error.type = 'NetSuite', error.details = e.getDetails();
	                    } else {
	                        error.type = 'JavaScript', error.details = e.toString();
	                    }
	                    log('Fulfillment Error', error, 'ERROR');
	    			}

	    			try {
	    				/* Create Invoice */
	        				values = nlapiLookupField('salesorder', sales_order, ['custbody_deferredbilling', 'custbody_deferredbillingapproval']);
	        				if (!values.custbody_deferredbilling || (values.custbody_deferredbilling == nlapiDateToString(new Date()) && values.custbody_deferredbillingapproval == 'T')) {
	        					invoice = nlapiTransformRecord('salesorder', sales_order, 'invoice');
	        					invoice.setFieldValue('customform', disposed ? 115 : 107);
	        					invoice.setFieldValue('trandate', deliveryDate);
	        					if (invoice.getFieldValue('tobeemailed') == 'T') {
	        						if (!invoice.getFieldValue('email')) {
	        							invoice.setFieldValue('tobeemailed', 'F');
	        							invoice.setFieldValue('tobeprinted', 'T');
	        						}
	        					} else {
	        						invoice.setFieldValue('tobeprinted', 'T');
	        					}
	        					invoice = nlapiSubmitRecord(invoice, true, true);
	        					var dayOfTheMonth = new Date(deliveryDate).getDate();
	        					var fields = ['custbody_lastinvoice', 'custbody_lastinvoicedate', 'custbody_original_invoice_date'];
	        					var values = [invoice, deliveryDate, dayOfTheMonth];
	        					nlapiSubmitField('salesorder', sales_order, fields, values);
	        					// update the asset record
	        					updateAsset(invoice, sales_order);
	        				}
	    			} catch (e) {
	                    if (e instanceof nlobjError) {
	                        error.type = 'NetSuite', error.details = e.getDetails();
	                    } else {
	                        error.type = 'JavaScript', error.details = e.toString();
	                    }
	                    log('Invoice Error', error, 'ERROR');
	    			}

	                log('2/2 Create Transaction', {
	                    fulfillmentId:fulfillmentId,
	                    invoiceId:invoiceId
	                });
	    		}

		/* Update Asset record to reflect new Status */
    		// 3 - Available for Rent, 1 - On Rent - Customer's Location, 4 - Off Rent But Not Picked Up, 5 - Needs to be Inspected, 6 - Needs Major Repair, 7 - Needs Minor Repair, 8 - Scheduled for Pickup, 9 - Scheduled for Delivery
    		if (current_dispatch <= this_dispatch) {
    			if (dispatch_type == 1 && probox_number && status == 4) {
    				/* Update Rental Asset to reflect being unavailable, set the address it is at, update the contract */
    				fields = ['custrecord_rentalasset_status', 'custrecord_rentalasset_addr1', 'custrecord_rentalasset_addr2', 'custrecord_rentalasset_city', 'custrecord_rentalasset_state', 'custrecord_rentalasset_zip', 'custrecord_rentalasset_contract','custrecord_rentalasset_lastdispatch'];
    				values = [1, nlapiGetFieldValue('custrecord_dispatch_addr1'), nlapiGetFieldValue('custrecord_dispatch_addr2'), nlapiGetFieldValue('custrecord_dispatch_city'), nlapiGetFieldValue('custrecord_dispatch_state'), nlapiGetFieldValue('custrecord_dispatch_zip'), nlapiGetFieldValue('custrecord_dispatch_contract'),nlapiGetRecordId()];
    				if(!isSale) nlapiSubmitField('customrecord_rentalasset', probox_number, fields, values);

    			}
    			if (dispatch_type == 1 && probox_number && status == 2 && delivery_type != 2) {
    				/* Update Rental Asset to reflect being unavailable, set the address it is at, update the contract */
    				fields = ['custrecord_rentalasset_status', 'custrecord_rentalasset_addr1', 'custrecord_rentalasset_addr2', 'custrecord_rentalasset_city', 'custrecord_rentalasset_state', 'custrecord_rentalasset_zip', 'custrecord_rentalasset_contract','custrecord_rentalasset_lastdispatch'];
    				values = [1, nlapiGetFieldValue('custrecord_dispatch_addr1'), nlapiGetFieldValue('custrecord_dispatch_addr2'), nlapiGetFieldValue('custrecord_dispatch_city'), nlapiGetFieldValue('custrecord_dispatch_state'), nlapiGetFieldValue('custrecord_dispatch_zip'), nlapiGetFieldValue('custrecord_dispatch_contract'),nlapiGetRecordId()];
    				if(!isSale) nlapiSubmitField('customrecord_rentalasset', probox_number, fields, values);
    			}
    			if (dispatch_type == 2 && probox_number && status == 6) {
    				/* Update Rental Asset to clear the address it was at, update the contract, reflect being available */
    				fields = ['custrecord_rentalasset_status', 'custrecord_rentalasset_addr1', 'custrecord_rentalasset_addr2', 'custrecord_rentalasset_city', 'custrecord_rentalasset_state', 'custrecord_rentalasset_zip', 'custrecord_rentalasset_contract','custrecord_rentalasset_lastdispatch'];
    				values = [3, '', '', '', '', '', '',nlapiGetRecordId()];
    				if(!isSale) nlapiSubmitField('customrecord_rentalasset', probox_number, fields, values);
    			}

    			/* Update Asset being used in Remote-Fulfillment */
    			if (remote_asset && status == 2) {

    				/* Update Asset's original contract to note is is scheduled for a Remote-Fulfillment */
    				var remote_contract = nlapiLookupField('customrecord_rentalasset', remote_asset, 'custrecord_rentalasset_contract');
    				if (remote_contract) {
    					nlapiSubmitField('salesorder', remote_contract, 'custbody_dispatchpickup', nlapiGetRecordId());
    				}

    				/* Update Asset to reflect it has been scheduled for a Remote-Fulfillment */
    				if(!isSale) nlapiSubmitField('customrecord_rentalasset', remote_asset, ['custrecord_rentalasset_status', 'custrecord_rentalasset_lastdispatch'], [8, nlapiGetRecordId()]);
    			}
    		}

		/* COMPARE RELOCATION STATUSES AND SEE IF THERE IS A CHANGE */
    		var RELOCATION_COMPLETE = "8",
    			RELOCATION_PENDING = "7";
    		if (AS_DispatchStatus === RELOCATION_COMPLETE && BL_DispatchStatus === RELOCATION_PENDING) {
    			var relocationFee = nlapiGetFieldValue('custrecord_relocation_fee');
    			relocation_processing(probox_number, sales_order, customer, relocationFee);
    		}
	}
    log('After Submit - End', {
        type:type,
        recordId:nlapiGetRecordType(),
        user:nlapiGetUser()
    });
}

/* UPDATE LOCATION, UPDATE INVOICES, AND CHARGE INVOICE UPON RELOCATION */
function relocation_processing(asset, contract, customer, relocationFee) {
	log('Relocation','<----------------------------------------Relocation---------------------------------------->');
	var address1 = nlapiGetFieldValue('custrecord_to_dispatch_addr1');
	var address2 = nlapiGetFieldValue('custrecord_to_dispatch_addr2');
	var city = nlapiGetFieldValue('custrecord_to_dispatch_city');
	var state = nlapiGetFieldValue('custrecord_to_dispatch_state');
	var zip = nlapiGetFieldValue('custrecord_to_dispatch_zip');

	var company = nlapiGetFieldValue('custrecord_dispatch_company');
	var companyText = nlapiGetFieldText('custrecord_dispatch_company');
	companyText = companyText.substring(companyText.indexOf(' ') + 1); //eliminates the internalid number on the front
	var phone = nlapiGetFieldValue('custrecord_dispatch_contactphone');
	var attention = '' || 'test';
	var shippingLabel = address1;

	/* UPDATE ASSET LOCATION */
	if (asset){
		log('Relocation','<----------------------------------------Updating Asset---------------------------------------->');
		var addressFields = [
			'custrecord_rentalasset_addr1',
			'custrecord_rentalasset_addr2',
			'custrecord_rentalasset_city',
			'custrecord_rentalasset_state',
			'custrecord_rentalasset_zip'
		];

		var addressValues = [
			address1,
			address2,
			city,
			state,
			zip
		];

		nlapiSubmitField('customrecord_rentalasset', asset, addressFields, addressValues);
	}

	/* CREATE RELOCATION INVOICE */

	// var relocationInvoice = nlapiTransformRecord('salesorder', contract, 'invoice', transformValues);

	// // remove all transfered line items
	// var invoiceLineCount = opportunityRecord.getLineItemCount('item');
	// for (var i = invoiceLineCount; i >= 1; i--) {
	//	 relocationInvoice.removeLineItem('item', i);
	// }

	// // create relocation line item
	// relocationInvoice.selectNewLineItem('item');

	// var RELOCATION_ITEM = 101;
	// var quantity = 1;
	// var amount = relocationFee;
	// var ONE_TIME_CHARGE = "2";
	// var DISPLAY_NAME = "Relocation Charge - Containers Relocation Charge";

	// var contractText = nlapiGetFieldText('custrecord_dispatch_contract');
	// var proboxNumberText = nlapiGetFieldText('custrecord_dispatch_proboxnumber');
	// var PickupText = nlapiGetFieldValue('custrecord_dispatch_addr2');
	// var RelocationText = address2;
	// var description = "Relocation of Unit" + proboxNumberText + " from " + PickupText + " to " + RelocationText + " for " + contractText;

	// relocationInvoice.setCurrentLineItemValue('item', RELOCATION_ITEM);
	// relocationInvoice.setCurrentLineItemValue('quantity', quantity);
	// relocationInvoice.setCurrentLineItemValue('description', description);
	// relocationInvoice.setCurrentLineItemValue('amount', amount);
	// relocationInvoice.setCurrentLineItemValue('custcol_chargetype', ONE_TIME_CHARGE);
	// relocationInvoice.setCurrentLineItemValue('custcol_item_concat_display_name', "Relocation Charge - Containers Relocation Charge");

	// //set other fields
	// relocationInvoice.setFieldValue('custbody_estimatedcost', relocationFee);
	// relocationInvoice.setFieldValue('custbody_probox_number', asset);

	// nlapiSubmitRecord(relocationInvoice, true, true);

	/* CHANGE ADDRESS ON CONTRACT */
	if (customer){
		log('Relocation','<----------------------------------------Updating Sales Order---------------------------------------->');
		var customerRecord = nlapiLoadRecord('customer', customer);
		var index = customerRecord.findLineItemValue('addressbook', 'label', shippingLabel);
		// if address doesn't exist on customer record then create one automatically and return
		if (index === -1) {
			index = createNewAddress(customerRecord, companyText, address1, address2, city, state, zip);
		}
		var addressId = customerRecord.getLineItemValue('addressbook','addressid',index);
		var contractRecord = nlapiLoadRecord('salesorder', contract);
		try {
			contractRecord.setFieldValue('shipaddresslist',addressId);
			nlapiSubmitRecord(contractRecord, false, true);
		} catch (e){
			log('Could not update address on contract',e);
		}
		// nlapiSubmitField('salesorder', contract, 'shipaddresslist', addressId); //have to load record to skip over mandatory field issues
	}
}

function createNewAddress(customerRecord, companyText, address1, address2, city, state, zip) {
	var COUNTY = 'US';

	customerRecord.selectNewLineItem('addressbook');
	customerRecord.setCurrentLineItemValue('addressbook', 'defaultshipping', 'F');
	customerRecord.setCurrentLineItemValue('addressbook', 'defaultbilling', 'F');
	customerRecord.setCurrentLineItemValue('addressbook', 'label', address1);
	customerRecord.setCurrentLineItemValue('addressbook', 'isresidential', 'F');

	var shippingSubrecord = customerRecord.createCurrentLineItemSubrecord('addressbook', 'addressbookaddress');
	shippingSubrecord.setFieldValue('country', COUNTY || ''); //Country must be set before setting the other address fields
	shippingSubrecord.setFieldValue('attention', '');
	shippingSubrecord.setFieldValue('addressee', companyText || '');
	shippingSubrecord.setFieldValue('addr1', address1 || '');
	shippingSubrecord.setFieldValue('addr2', address2 || '');
	shippingSubrecord.setFieldValue('city', city || '');
	shippingSubrecord.setFieldValue('state', state || '');
	shippingSubrecord.setFieldValue('zip', zip || '');

	shippingSubrecord.commit();
	customerRecord.commitLineItem('addressbook');

	nlapiSubmitRecord(customerRecord);

	return customerRecord.findLineItemValue('addressbook', 'label', address1);
}

function disposeOfAsset() {

    var testUsers = ['546', '3']; // Tasha, TrueCloud
    if (testUsers.indexOf(nlapiGetUser().toString()) === -1) return;

    var deliveryDate = nlapiGetFieldValue('custrecord_dispatch_deliverydate');
    if (!deliveryDate) return;

	var salesOrder = nlapiGetFieldValue('custrecord_dispatch_contract');
	if (!salesOrder) return;

	var saleContract = nlapiLookupField('salesorder', salesOrder, 'custbody_salecontract') == 'T';
	if (!saleContract) return;

	var asset = nlapiGetFieldValue('custrecord_disp_asset'),
        location = nlapiGetFieldValue('custrecord_disp_location'),
        disposalDate = nlapiGetFieldValue('custrecord_disp_disposaldate');
	if (!asset || !location || !disposalDate) return;

    var temp = {
        prmt:4
    };
    temp[asset] = {
        date:new Date(disposalDate).getTime(),
        type:2,
        qty:"1",
        loc:location
    };

	var record = nlapiCreateRecord('customrecord_bg_procinstance');
		record.setFieldValue('custrecord_far_proins_processname', 'Asset Disposal');
		record.setFieldValue('custrecord_far_proins_functionname', 'customscript_fam_mr_disposal');
		record.setFieldValue('custrecord_far_proins_procuser', nlapiGetUser()); 
		record.setFieldValue('custrecord_far_proins_procstatus', 5);
		record.setFieldValue('custrecord_far_proins_procstate', JSON.stringify(temp));   
	var recordId = nlapiSubmitRecord(record);

    var status = nlapiScheduleScript('customscript_fam_bgptrigger_ss', 'customdeploy_fam_bgptrigger_ss');

    var proboxNumber = nlapiGetFieldValue('custrecord_dispatch_proboxnumber');
    if (proboxNumber) nlapiSubmitField('customrecord_rentalasset', proboxNumber, 'custrecord_rentalasset_status', 11); // Sold
  
    log('disposeOfAsset', {
        notes:'Case 7604, Automated Asset Disposal',
        dispatchId:nlapiGetRecordId(),
        deliveryDate:deliveryDate,
        salesOrderId:salesOrder,
        proboxNumber:proboxNumber,
        assetId:asset,
        locationId:location,
        disposalDate:disposalDate,
        user:nlapiGetUser(),
        bgProcessId:recordId,
        bgProcessStatus:status,
        processState:temp
    });

    return true;
}

/**
 * Add Asset Sale/Dispostal information to FAM - Asset
 */
function updateAsset(invoice, salesOrder){
	var asset = nlapiGetFieldValue('custrecord_disp_asset')||'';
	// var customer = nlapiGetFieldValue('custrecord_dispatch_company')||'';
	// var total = nlapiLookupField('salesorder', salesOrder, 'total')||'';
	// var item = nlapiLookupField('customrecord_ncfar_asset', asset, 'custrecord_model_no')||'';
	
	// if(invoice && asset && customer && item){
	if (invoice && salesOrder && asset) {
		log('Update Asset Record', {
			notes:'Case 7604, Automated Asset Disposal',
			// item:item,
			// customer:customer,
			// total:total,
			invoice:invoice,
			salesOrder:salesOrder,
			asset:asset
		});    
		
		// var fields = ['custrecord_assetdisposalitem', 'custrecord_assetsalecustomer', 'custrecord_assetsaleamount', 'custrecord_assetsalesinvoice'];
		// var values = [item, customer, total, invoice];
		var fields = ['custrecord_assetproboxsalesorder', 'custrecord_assetproboxinvoice'];
		var values = [salesOrder, invoice];
		nlapiSubmitField('customrecord_ncfar_asset', asset, fields, values);
	}
}