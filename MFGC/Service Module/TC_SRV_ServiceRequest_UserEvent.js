var serviceRequest = {
	sublist:'custpage_servicerequest',
	context:nlapiGetContext().getExecutionContext(),
	placeholder:'TBD',
	beforeLoad:function(type, form, request) {

		this.parameters = request ? getParameters(request) : {};
		log('parameters', this.parameters);

		this.approveChangeOrders();

		this.getConfiguration();

		this.buildUI(type, form, request);

		if (type == 'create' && this.parameters['EQP']) this.populateEquipment(this.parameters['EQP']); 
	},
	beforeSubmit:function(type) {

		this.storeInformation();
	},
	afterSubmit:function(type) {

		if ((type == 'create' || type == 'edit') && this.context == 'userinterface') {
			this.upsertServiceWork();

			/* UPSERT Address */
				var customerId = nlapiGetFieldValue('custrecord_servicerequest_customer');
				var address = {
					country:'US',
					id:nlapiGetFieldValue('custrecord_servicerequest_addressid') || '',
					address1:nlapiGetFieldValue('custrecord_servicerequest_address1') || '',
					address2:nlapiGetFieldValue('custrecord_servicerequest_address2') || '',
					city:nlapiGetFieldValue('custrecord_servicerequest_city') || '',
					state:nlapiGetFieldValue('custrecord_servicerequest_state') || '',
					zip:nlapiGetFieldValue('custrecord_servicerequest_zip') || '',
					addressee:nlapiGetFieldText('custrecord_servicerequest_customer') || '',
					attention:nlapiGetFieldText('custrecord_servicerequest_contact') || '',
					addrphone:nlapiGetFieldValue('custrecord_servicerequest_contactphone') || ''
				};
				if (!address.id) {
					if (address.address1 && address.zip) {
						var addressId = addressLibrary.addAddress(customerId, address);
						nlapiSubmitField(nlapiGetRecordType(), nlapiGetRecordId(), 'custrecord_servicerequest_addressid', addressId);
					}
				}
		}
	},
	buildUI:function(type, form, request) {

		var field;

		if (type == 'create' && this.internalCustomer) {
			form.addButton(
				'custpage_internalcustomer',
				'Internal Request',
				'serviceRequest.setInternalCustomer()'
			);
		}

		if (type == 'view') {

			var pendingReceipt = this._equipmentPendingReceipt();
			var pendingTransaction = this._equipmentPendingTransaction(nlapiGetRecordId());
			var pendingParts = this._partsPendingTransaction(nlapiGetRecordId());
			log('Button Logic', {
				pendingReceipt:pendingReceipt,
				pendingTransaction:pendingTransaction,
				pendingParts:pendingParts
			});
			if (pendingReceipt) {
				form.addButton(
					'custpage_receive',
					'Receive Equipment',
					'window.open(\'' + nlapiResolveURL('SUITELET', 'customscript_service_servicereceipt_sui', 'customdeploy_service_servicereceipt_sui') + '&request=' + nlapiGetRecordId() + '\', \'_self\')'
				);
			}
			if (pendingTransaction || pendingParts.data.length > 0) {
				if (pendingTransaction || pendingParts.estimate) {
					form.addButton(
						'custpage_estimate',
						'Create Estimate',
						"window.open('/app/accounting/transactions/estimate.nl?"+this.estimateForm+"&sr="+nlapiGetRecordId()+"', '_self')"
					);
				}
				if (pendingTransaction || pendingParts.salesOrder) {
					form.addButton(
						'custpage_salesorder',
						'Create Sales Order',
						"window.open('/app/accounting/transactions/salesord.nl?"+this.salesOrderForm+"&sr="+nlapiGetRecordId()+"', '_self')"
					);
				}
			}
			if (pendingParts.bulkApprove) {
				form.addButton(
					'custpage_bulkapprove',
					'Bulk Approve Change Orders',
					'window.open(\'/app/common/custom/custrecordentry.nl?rectype=' + this.serviceRequestId + '&id=' + nlapiGetRecordId() + '&bulkApprove=T\', \'_self\')'
				);
			}
		}

		if (type != 'view') {
			addressLibrary.build(type, form, request, 'custrecord_servicerequest_address1', nlapiGetFieldValue('custrecord_servicerequest_customer'));
			var currentAddressId = nlapiGetFieldValue('custrecord_servicerequest_addressid');
			if (currentAddressId) nlapiSetFieldValue(addressLibrary.fieldId, currentAddressId);
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
			if (type == 'edit' || type == 'view') {
				field = sublist.addField('custpage_status', 'text', 'Status');
					field.setDisplayType('disabled');
			}
		if (type != 'create') sublist.setLineItemValues(this._populateSublist(type));
	},
	approveChangeOrders:function() {
		if (this.parameters.bulkApprove == 'T') {
			var approvedTasks = [];
			var pending = this._partsPendingTransaction().data;
			log('approveChangeOrders', pending);
			for (var i = 0, count = pending.length ; i < count ; i++) {
				if (pending[i].assigned == nlapiGetUser() && (pending[i].status == 0 || pending[i].status == 1)) {
					nlapiSubmitField('task', pending[i].taskId, ['status', 'custevent_changeorderstatus'], ['COMPLETE', '2']);
					approvedTasks.push(pending[i].taskId);
				}
			}
			log('Bulk Approved Change Orders', {
				user:nlapiGetUser(),
				approvedTasks:approvedTasks
			});
			nlapiSetRedirectURL('RECORD', nlapiGetRecordType(), nlapiGetRecordId());
		}
	},
	getConfiguration:function() {
		if (!nlapiGetContext().getSessionObject('custpage_geolocations')) nlapiGetContext().setSessionObject('custpage_geolocations', this._getLocations());
		this.serviceRequestId = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceRequestRecordId') || getCustomRecordId('customrecord_servicerequest', nlapiGetRecordType()+'_serviceRequestRecordId') || null;
		this.serviceWorkTab = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceWorkTab') || getTabs(form, 0, nlapiGetRecordType()+'_serviceWorkTab') || null;
		this.serviceWorkRecordId = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceWorkRecordId') || getCustomRecordId('customrecord_servicework', nlapiGetRecordType()+'_serviceWorkRecordId') || null;
		this.salesOrderForm = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_salesformid') ? 'cf=' + nlapiGetContext().getSetting('SCRIPT', 'custscript_request_salesformid') : null;
		this.estimateForm = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_estimateformid') ? 'cf=' + nlapiGetContext().getSetting('SCRIPT', 'custscript_request_estimateformid') : null;
		if (!this.serviceWorkTab) throw nlapiCreateError('001 Unable to locate Service Work Tab', '001 Please contact TrueCloud support.', true);
		if (!this.serviceWorkRecordId) throw nlapiCreateError('002 Unable to locate Service Work Record ID', '002 Please contact TrueCloud support.', true);
		// if (!this.salesOrderForm) throw nlapiCreateError('004 Unable to locate the Sales Order Form', '004 Please configure the Company Preferences for the Service module', true);
		// if (!this.estimateForm) throw nlapiCreateError('005 Unable to locate the Estimate Form', '005 Please configure the Company Preferences for the Service module', true);
		this.serviceItemFilter = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_serviceitemfilter') || null;
		this.internalCustomer = nlapiGetContext().getSetting('SCRIPT', 'custscript_request_internalcustomer');
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

		var start = new Date().getTime();

		var data = nlapiGetContext().getSessionObject('serviceWorkData');
		if (!data) return;
		data = JSON.parse(data);
			nlapiGetContext().setSessionObject('serviceWorkData', '');

		/* Get Equipment Internal IDs or
			create new Equipment records */
			data = this._upsertEquipment(data);

		/* UPSERT Service Work Records */
			var upsertInfo = {ids:[], created:[], updated:[]};
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
				// Disabling Name as ID should be the only required element
				// record.setFieldValue('name', data[i].serial.replace(/[^a-zA-Z0-9]/g, '') + ' ' + nlapiGetRecordId());
				record = nlapiSubmitRecord(record, true, true);
				upsertInfo.ids.push(record);
				if (action == 'create') {
					upsertInfo.created.push(record);
				} else if (action == 'edit') {
					upsertInfo.updated.push(record);
				}
			}

		/* Inactivate Service Work records
			These are records that were removed in the UI */
			upsertInfo.inactivated = this._inactivateServiceWork(upsertInfo.ids);

		log('UPSERT Service Work', {
			elapsedSeconds:((new Date().getTime()-start)/1000).toFixed(2),
			created:upsertInfo.created,
			updated:upsertInfo.updated,
			inactivated:upsertInfo.inactivated
		});
	},
	_getLocations:function() {

		var data = {};

		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('custrecord_latitude', null, 'isnotempty', null));
			filter.push(new nlobjSearchFilter('custrecord_longitude', null, 'isnotempty', null));
		var column = [];
			column.push(new nlobjSearchColumn('custrecord_latitude'));
			column.push(new nlobjSearchColumn('custrecord_longitude'));
		var results = nlapiSearchRecord('location', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data[results[i].getId()] = {
				latitude:parseFloat(results[i].getValue('custrecord_latitude')),
				longitude:parseFloat(results[i].getValue('custrecord_longitude'))
			};
		}

		return JSON.stringify(data);
	},
	_equipmentPendingReceipt:function() {
		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('custrecord_service_work_request', null, 'anyof', [nlapiGetRecordId()]));
			filter.push(new nlobjSearchFilter('custrecord_service_work_status', null, 'anyof', [29]));
		var column = [];
			column.push(new nlobjSearchColumn('custrecord_service_work_equipment'));
		var results = nlapiSearchRecord('customrecord_servicework', null, filter, column) || [];
		return results.length > 0;
	},
	_equipmentPendingTransaction:function(serviceRequest) {
		var filters = [];
			filters.push(new nlobjSearchFilter('internalid', 'custrecord_service_work_request', 'is', serviceRequest));
			filters.push(new nlobjSearchFilter('custrecord_service_work_estimate', null, 'anyof', ['@NONE@']));
			filters.push(new nlobjSearchFilter('custrecord_service_work_salesorder', null, 'anyof', ['@NONE@']));
			filters.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
		var columns = [];
			columns.push(new nlobjSearchColumn('internalid'));
		var results = nlapiSearchRecord('customrecord_servicework', null, filters, columns) || [];
		return results.length > 0;
	},
	_partsPendingTransaction:function(serviceRequest) {
		var serviceTech = nlapiGetFieldValue('custrecord_servicerequest_supportrep');
		var pendingParts = {
			estimate:false,
			salesOrder:false,
			bulkApprove:false,
			data:[]
		};
		var filters = [
			[
				["custrecord_serviceparts_changeorder","is","F"], "OR",
				[
					["custrecord_serviceparts_changeorder","is","T"], "AND",
					["custrecord_serviceparts_changetask.custevent_changeorderstatus","anyof", '@NONE@', 1, 2] // Unapproved, Approved
				]
			], "AND",
			["custrecord_serviceparts_salesorder","anyof","@NONE@"], "AND",
			["custrecord_serviceparts_estimate","anyof","@NONE@"], "AND",
			["custrecord_serviceparts_request","anyof",serviceRequest]
		];
		var columns = [];
			columns.push(new nlobjSearchColumn('custrecord_serviceparts_part'));
			columns.push(new nlobjSearchColumn('custrecord_serviceparts_quantity'));
			columns.push(new nlobjSearchColumn('custrecord_serviceparts_changetask'));
			columns.push(new nlobjSearchColumn('custevent_changeorderstatus', 'custrecord_serviceparts_changetask'));
			columns.push(new nlobjSearchColumn('assigned', 'custrecord_serviceparts_changetask'));
		var results = nlapiSearchRecord('customrecord_serviceparts', null, filters, columns) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			var temp = {
				id:results[i].getId(),
				item:results[i].getValue('custrecord_serviceparts_part'),
				quantity:results[i].getValue('custrecord_serviceparts_quantity'),
				taskId:results[i].getValue('custrecord_serviceparts_changetask'),
				status:results[i].getValue('custevent_changeorderstatus', 'custrecord_serviceparts_changetask'),
				assigned:results[i].getValue('assigned', 'custrecord_serviceparts_changetask')
			};
			if (!temp.status || temp.status == 1 || temp.status == 2) pendingParts.estimate = true;
			if (temp.status == 2) pendingParts.salesOrder = true;
			if (temp.assigned == nlapiGetUser() && temp.assigned != serviceTech && (!temp.status || temp.status ==1)) pendingParts.bulkApprove = true;
			pendingParts.data.push(temp);
		}
		return pendingParts;
	},
	_populateSublist:function(type) {
		var data = [];
		var filter = [];
			filter.push(new nlobjSearchFilter('custrecord_service_work_request', null, 'is', nlapiGetRecordId()));
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
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
		return data;
	},
	_upsertEquipment:function(data) {
		var equipment = [], equipmentLookup = [], start = new Date().getTime();

		/* Add new Service Work lines' equipment to an array
			for a search-lookup */
			for (var e = 0, counte = data.length ; e < counte ; e++) {
				equipment.push(data[e].serial);
			}

		/* Perform a lookup of the unknown equipment
			and add it to an array */
			var filter = [
				['custrecord_equipment_customer', 'is', nlapiGetFieldValue('custrecord_servicerequest_customer')],
				'AND',
				[]
			];
			for (var f = 0, countf = equipment.length ; f < countf ; f++) {
				if (equipment[f] == this.placeholder) continue;
				if (filter[2].length > 0) filter[2].push('OR');
				filter[2].push(['name', 'is', equipment[f]]);
			}
			log('_upsertEquipment filter', filter);
			var results = nlapiSearchRecord('customrecord_equipment', null, filter, [new nlobjSearchColumn('name'), new nlobjSearchColumn('isinactive')]) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				equipmentLookup.push({
					name:results[i].getValue('name'),
					id:results[i].getId(),
					inactive:results[i].getValue('isinactive') == 'T'
				});
			}

		/* Add the Equipment Internal ID of each 
			Service Work line to the original data
			*/
			var upsertInfo = {'created':[], 'found':[]};
			for (var ee = 0, countee = data.length ; ee < countee ; ee++) {
				if (!data[ee].internalid) {
					var index = misc.index(equipmentLookup, data[ee].serial, 'name');
					if (index !== null) {
						data[ee].equipment = equipmentLookup[index].id;
						upsertInfo.found.push(equipmentLookup[index].id);
						if (equipmentLookup[index].inactive) nlapiSubmitField('customrecord_equipment', equipmentLookup[index].id, 'isinactive', 'F');
					} else {
						var serialNumber = data[ee]['serial'].replace(/[^a-zA-Z0-9]/g, '');
						var record = nlapiCreateRecord('customrecord_equipment');
							if (serialNumber != this.placeholder) record.setFieldValue('externalid', nlapiGetFieldValue('custrecord_servicerequest_customer')+'-'+serialNumber);
							record.setFieldValue('name', data[ee].serial);
							record.setFieldValue('custrecord_equipment_description', data[ee].description);
							record.setFieldValue('custrecord_equipment_customer', nlapiGetFieldValue('custrecord_servicerequest_customer'));
							record.setFieldValue('custrecord_equipment_mfg', data[ee].manufacturer);
							record.setFieldValue('custrecord_service_work_createdby', nlapiGetRecordId());
						record = nlapiSubmitRecord(record, true, true);
						data[ee].equipment = record;
						upsertInfo.found.push(record);
					}
				}
			}

		log('Upsert Equipment', {
			elapsedSeconds:((new Date().getTime()-start)/1000).toFixed(2),
			created:upsertInfo.created,
			found:upsertInfo.found
		});

		return data;
	},
	_inactivateServiceWork:function(ids) {
		var inactivatedIds = [];
		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('internalid', null, 'noneof', ids));
		var column = [];
			column.push(new nlobjSearchColumn('internalid'));
		var results = nlapiSearchRecord('customrecord_servicework', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			var id = results[i].getId();
			nlapiSubmitField('customrecord_servicework', id, 'isinactive', 'T');
			inactivatedIds.push(id);
		}
		return inactivatedIds;
	}
};