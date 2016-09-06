var serviceRequest = {
	sublist:'custpage_servicerequest',
	beforeLoad:function(type, form, request) {

		this.parameters = request ? getParameters(request) : {};

		this.getConfiguration();

		this.buildUI(type, form);

		if (type == 'create' && this.parameters['EQP']) this.populateEquipment(this.parameters['EQP']); 
	},
	beforeSubmit:function(type) {

		this.storeInformation();
	},
	afterSubmit:function(type) {

		if (type == 'create' || type == 'edit') this.upsertServiceWork();
	},
	getConfiguration:function() {
		this.serviceWorkTab = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceWorkTab') || getTabs(form, 0, nlapiGetRecordType()+'_serviceWorkTab') || null;
		this.serviceWorkRecordId = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceWorkRecordId') || getCustomRecordId('customrecord_servicework', nlapiGetRecordType()+'_serviceWorkRecordId') || null;
		this.serviceReceiptRecordId = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceReceiptRecordId') || getCustomRecordId('customrecord_servicereceipt', nlapiGetRecordType()+'_serviceReceiptRecordId') || null;
		this.salesOrderForm = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_salesformid') ? 'cf=' + nlapiGetContext().getSetting('SCRIPT', 'custscript_request_salesformid') : null;
		this.estimateForm = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_estimateformid') ? 'cf=' + nlapiGetContext().getSetting('SCRIPT', 'custscript_request_estimateformid') : null;
		if (!this.serviceWorkTab) throw nlapiCreateError('001 Unable to locate Service Work Tab', '001 Please contact TrueCloud support.', true);
		if (!this.serviceWorkRecordId) throw nlapiCreateError('002 Unable to locate Service Work Record ID', '002 Please contact TrueCloud support.', true);
		if (!this.serviceReceiptRecordId) throw nlapiCreateError('003 Unable to locate Service Receipt Record ID', '003 Please contact TrueCloud support.', true);
		if (!this.salesOrderForm) throw nlapiCreateError('004 Unable to locate the Sales Order Form', '004 Please configure the Company Preferences for the Service module', true);
		if (!this.estimateForm) throw nlapiCreateError('005 Unable to locate the Estimate Form', '005 Please configure the Company Preferences for the Service module', true);
		this.serviceItemFilter = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_serviceitemfilter') || null;
	},
	buildUI:function(type, form) {

		var field;

		if (type == 'view') {
			form.addButton('custpage_receive', 'Receive Equipment', 'alert(\'add window.open\')');
			form.addButton('custpage_salesorder', 'Create Sales Order', "window.open('/app/accounting/transactions/estimate.nl?"+this.estimateForm+"&sr="+nlapiGetRecordId()+"', '_self')");
			form.addButton('custpage_estimate', 'Create Estimate', "window.open('/app/accounting/transactions/salesord.nl?"+this.salesOrderForm+"&sr="+nlapiGetRecordId()+"', '_self')");
		}

		if (type != 'view') {
			field = form.addField('custpage_addresslookup', 'text', 'Address Lookup');
				form.insertField(field, 'custrecord_servicerequest_address1');
		}

		var sublist = form.addSubList(this.sublist, 'inlineeditor', 'Equipment', this.serviceWorkTab);
			if (type == 'view') {
				field = sublist.addField('custpage_view', 'url', 'View');
					field.setLinkText('View');
				field = sublist.addField('custpage_edit', 'url', 'Edit');
					field.setLinkText('Edit');
			}
			field = sublist.addField('custpage_serviceitem', 'select', 'Service Repair Item', 'item');
				if (type != 'view') field.setDisplayType('entry');
				field.setMandatory(true);
				if (this.serviceItemFilter) field.getSelectOptions(this.serviceItemFilter, 'startswith');
			field = sublist.addField('custpage_serialnumber', 'text', 'Serial Number');
				if (type != 'view') field.setDisplayType('entry');
				field.setMandatory(true);
				sublist.setUniqueField('custpage_serialnumber');
			field = sublist.addField('custpage_manufacturer', 'select', 'Manufacturer / Vendor', 'vendor');
				if (type != 'view') field.setDisplayType('entry');
			field = sublist.addField('custpage_description', 'text', 'Description');
				if (type != 'view') field.setDisplayType('entry');
				field.setMandatory(true);
			field = sublist.addField('custpage_symptoms', 'textarea', 'Symptoms');
				if (type != 'view') field.setDisplayType('entry');
				field.setMandatory(true);
			field = sublist.addField('custpage_contract', 'select', 'Contract', 'job');
				if (type != 'view') field.setDisplayType('disabled');
			field = sublist.addField('custpage_internalid', 'text', 'Internal ID');
				field.setDisplayType('hidden');
			if (type == 'edit') {
				field = sublist.addField('custpage_status', 'text', 'Status');
					field.setDisplayType('disabled');
			}
		if (type != 'create') sublist.setLineItemValues(this._populateSublist(type));
	},
	_populateSublist:function(type) {
		var data = [];
		var filter = [];
			filter.push(new nlobjSearchFilter('custrecord_service_work_request', null, 'is', nlapiGetRecordId()));
		var column = [];
			column.push(new nlobjSearchColumn('custrecord_service_work_repair'));
			column.push(new nlobjSearchColumn('name', 'custrecord_service_work_equipment', null));
			column.push(new nlobjSearchColumn('custrecord_equipment_mfg', 'custrecord_service_work_equipment', null));
			column.push(new nlobjSearchColumn('custrecord_service_work_eqpdescription'));
			column.push(new nlobjSearchColumn('custrecord_service_work_symptoms'));
			column.push(new nlobjSearchColumn('custrecord_equipment_scontract', 'custrecord_service_work_equipment', null));
			column.push(new nlobjSearchColumn('internalid'));
			column.push(new nlobjSearchColumn('custrecord_service_work_status'));
			column.push(new nlobjSearchColumn('entityid', 'custrecord_service_work_contract', null));
		var results = nlapiSearchRecord('customrecord_servicework', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				custpage_view:type == 'view' ? '/app/common/custom/custrecordentry.nl?rectype='+this.serviceWorkRecordId+'&id='+results[i].getId() : null,
				custpage_edit:type == 'view' ? '/app/common/custom/custrecordentry.nl?rectype='+this.serviceWorkRecordId+'&id='+results[i].getId()+'&e=T' : null,
				custpage_serviceitem:results[i].getValue('custrecord_service_work_repair', null),
				custpage_serialnumber:results[i].getValue('name', 'custrecord_service_work_equipment', null),
				custpage_manufacturer:results[i].getValue('custrecord_equipment_mfg', 'custrecord_service_work_equipment', null),
				custpage_description:results[i].getValue('custrecord_service_work_eqpdescription', null, null),
				custpage_symptoms:results[i].getValue('custrecord_service_work_symptoms', null, null),
				custpage_contract:results[i].getValue('custrecord_equipment_scontract', 'custrecord_service_work_equipment', null),
				custpage_internalid:results[i].getId(),
				custpage_status:results[i].getText('custrecord_service_work_status', null, null)
			});
		}
		log('Populate Sublist', {
			request:nlapiGetRecordId(),
			'data.length':data.length,
			example:data.length > 0 ? data[0] : undefined
		});
		return data;
	},
	populateEquipment:function(equipment) {
		var values = nlapiLookupField('customrecord_equipment', equipment, ['name', 'custrecord_equipment_mfg', 'custrecord_equipment_description', 'custrecord_equipment_customer', 'custrecord_equipment_scontract']);
		nlapiSetFieldValue('custrecord_servicerequest_customer', values.custrecord_equipment_customer || '');
		nlapiSetLineItemValue('custpage_servicerequest', 'custpage_serialnumber', 1, values.name || '');
		nlapiSetLineItemValue('custpage_servicerequest', 'custpage_manufacturer', 1, values.custrecord_equipment_mfg || '');
		nlapiSetLineItemValue('custpage_servicerequest', 'custpage_description', 1, values.custrecord_equipment_description || '');
		nlapiSetLineItemValue('custpage_servicerequest', 'custpage_internalid', 1, equipment || '');
		nlapiSetLineItemValue('custpage_servicerequest', 'custpage_contract', 1, values.custrecord_equipment_scontract || '');
	},
	storeInformation:function() {
		var data = [];
		for (var i = 1 ; i <= nlapiGetLineItemCount(this.sublist) ; i++) {
			data.push({
				item:nlapiGetLineItemValue(this.sublist, 'custpage_serviceitem', i),
				serial:nlapiGetLineItemValue(this.sublist, 'custpage_serialnumber', i).replace(/["']/g,"").replace(/(\r\n|\n|\r)/gm,"").trim(),
				description:nlapiGetLineItemValue(this.sublist, 'custpage_description', i).replace(/["']/g,"").replace(/(\r\n|\n|\r)/gm,"").trim(),
				symptoms:nlapiGetLineItemValue(this.sublist, 'custpage_symptoms', i).replace(/["']/g,"").replace(/(\r\n|\n|\r)/gm,"").trim(),
				manufacturer:nlapiGetLineItemValue(this.sublist, 'custpage_manufacturer', i),
				internalid:nlapiGetLineItemValue(this.sublist, 'custpage_internalid', i),
			});
		}
		nlapiGetContext().setSessionObject('serviceWorkData', JSON.stringify(data));
	},
	upsertServiceWork:function() {

		var data = JSON.parse(nlapiGetContext().getSessionObject('serviceWorkData'));
			nlapiGetContext().setSessionObject('serviceWorkData', '');

		/* Get Equipment Internal IDs or
			create new Equipment records */
			data = this._upsertEquipment(data);

		for (var i = 0, count = data.length ; i < count ; i++) {
			var record, action;
			if (data[i].internalid) {
				action = 'edit';
				record = nlapiLoadRecord('customrecord_servicework', data[i].internalid);
			} else {
				action = 'create';
				record = nlapiCreateRecord('customrecord_servicework');
				record.setFieldValue('custrecord_service_work_request', nlapiGetRecordId());
				record.setFieldValue('custrecord_service_work_customer', nlapiGetFieldValue('custrecord_servicerequest_customer'));
				record.setFieldValue('custrecord_service_work_equipment', data[i].equipment);
				if (nlapiGetFieldValue('custrecord_servicerequest_onsite') != 'T') {
					record.setFieldValue('custrecord_service_work_status', 29);
				} else {
					record.setFieldValue('custrecord_service_work_status', 31);
				}
			}
			record.setFieldValue('custrecord_service_work_repair', data[i].item);
			record.setFieldValue('custrecord_service_work_symptoms', data[i].symptoms);
			record.setFieldValue('name', data[i].serial.replace(/[^a-zA-Z0-9]/g, '') + ' ' + nlapiGetRecordId());
			record = nlapiSubmitRecord(record, true, true);
			log('Upsert Service Work', {
				action:action,
				id:record
			});
		}
	},
	_upsertEquipment:function(data) {
		var equipment = [], equipmentLookup = [];

		/* Add new Service Work lines' equipment to an array
			for a search-lookup */
			for (var e = 0, counte = data.length ; e < counte ; e++) {
				equipment.push(data[e].serial);
			}

		/* Perform a lookup of the unknown equipment
			and add it to an array */
			var filter = [
				['isinactive', 'is', 'F'],
				'AND',
				['custrecord_equipment_customer', 'is', nlapiGetFieldValue('custrecord_servicerequest_customer')],
				'AND',
				[]
			];
			for (var f = 0, countf = equipment.length ; f < countf ; f++) {
				filter[4].push(['name', 'is', equipment[f]]);
				if (f+1 < countf) filter[4].push('OR');
			}
			var results = nlapiSearchRecord('customrecord_equipment', null, filter, [new nlobjSearchColumn('name')]) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				equipmentLookup.push({
					name:results[i].getValue('name'),
					id:results[i].getId()
				});
			}

		/* Add the Equipment Internal ID of each 
			Service Work line to the original data
			*/
			for (var ee = 0, countee = data.length ; ee < countee ; ee++) {
				if (!data[ee].internalid) {
					var index = misc.index(equipmentLookup, data[ee].serial, 'name');
					if (index !== null) {
						data[ee].equipment = equipmentLookup[index].id;
						log('Found Equipment', {
							customer:nlapiGetFieldValue('custrecord_servicerequest_customer'),
							name:data[ee].serial,
							id:data[ee].equipment
						});
					} else {
						var serialNumber = data[ee]['serial'].replace(/[^a-zA-Z0-9]/g, '');
						var record = nlapiCreateRecord('customrecord_equipment');
							record.setFieldValue('externalid', nlapiGetFieldValue('custrecord_servicerequest_customer')+'-'+serialNumber);
							record.setFieldValue('name', data[ee].serial);
							record.setFieldValue('custrecord_equipment_description', data[ee].description);
							record.setFieldValue('custrecord_equipment_customer', nlapiGetFieldValue('custrecord_servicerequest_customer'));
							record.setFieldValue('custrecord_equipment_mfg', data[ee].manufacturer);
							record.setFieldValue('custrecord_service_work_createdby', nlapiGetRecordId());
						record = nlapiSubmitRecord(record, true, true);
						data[ee].equipment = record;
						log('Created Euqipment', {
							customer:nlapiGetFieldValue('custrecord_servicerequest_customer'),
							name:data[ee].serial,
							id:record
						});
					}
				}
			}

		return data;
	}
};