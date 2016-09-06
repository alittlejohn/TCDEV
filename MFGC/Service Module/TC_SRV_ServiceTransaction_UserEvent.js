var serviceTransaction = {
	taskDueDateBusinessDayAddition:1,
	diagnosticFee:nlapiGetContext().getSetting('SCRIPT', 'custscript_srvtransaction_diagnosticfee'),
	serviceRequest:null,
	beforeLoad:function(type, form, request) {

		this.setValues(type, form, request);

		this.rejectTransaction('beforeLoad', type, form, request);

		this.serviceParts(form);
	},
	beforeSubmit:function(type) {

		this.rejectTransaction('beforeSubmit', type);
	},
	afterSubmit:function(type) {

		if (type != 'xedit' && type != 'delete') {
		
			this.updateServiceWork();

			this.updateServiceParts();

			if (type === 'create') this.salesRepTask();
		}

		this.rejectTransaction('afterSubmit', type);
	},
	setValues:function(type, form, request) {
		if (type == 'create' && request) {
			var requestId = request.getParameter('sr');
			if (!requestId) return;
			this.serviceRequest = requestId;

			var values = this._getValues(requestId);
			if (!values) return;

			var field = form.addField('custpage_servicerequestvalues', 'longtext', 'Service Request Values')
				field.setDefaultValue(JSON.stringify(values));
				field.setDisplayType('hidden');

			/* Disabling in lieu of setting via client script
				which should ensure all pricing/dependent fields
				are set appropriately */
				// for (var field in values.body) {
				// 	nlapiSetFieldValue(field, values.body[field]);
				// }

				// for (var i = 0, count = values.lines.length ; i < count ; i++) {
				// 	for (var lineField in values.lines[i]) {
				// 		nlapiSetLineItemValue('item', lineField, i+1, values.lines[i][lineField]);
				// 	}
				// }
		}
	},
	_getValues:function(requestId) {

		var data = {
			lines:[]
		};

		/* Get Body-fields */
			var values = nlapiLookupField(
				'customrecord_servicerequest',
				requestId,
				[
					'custrecord_servicerequest_customer',
					'custrecord_servicerequest_contact',
					'custrecord_servicerequest_ponumber',
					'custrecord_servicerequest_addressid',
					'custrecord_servicerequest_shipmethod',
					'custrecord_servicerequest_contactemail'
				]
			);
			data.body = {
				entity:values.custrecord_servicerequest_customer,
				contact:values.custrecord_servicerequest_contact,
				otherrefnum:values.custrecord_servicerequest_ponumber,
				custbody_servicerequest:requestId,
				shipaddresslist:values.custrecord_servicerequest_addressid,
				shipmethod:values.custrecord_servicerequest_shipmethod,
				email:values.custrecord_servicerequest_contactemail
			};

		var internalCustomer = false;
		if (data.body.entity == nlapiGetContext().getSetting('SCRIPT', 'custscript_request_internalcustomer')) internalCustomer = true;

		/* Get Line-fields */
			var filters = [];
				filters.push(new nlobjSearchFilter('internalid', 'custrecord_service_work_request', 'is', requestId));
				filters.push(new nlobjSearchFilter('custrecord_service_work_estimate', null, 'anyof', ['@NONE@']));
				filters.push(new nlobjSearchFilter('custrecord_service_work_salesorder', null, 'anyof', ['@NONE@']));
				filters.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			
			var columns = [];

				/* Line-level fields */
					columns.push(new nlobjSearchColumn('custrecord_service_work_repair'));
					columns.push(new nlobjSearchColumn('internalid'));

			var results = nlapiSearchRecord('customrecord_servicework', null, filters, columns) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.lines.push({
					item:results[i].getValue('custrecord_service_work_repair'),
					quantity:1,
					custcol_servicework:results[i].getId(),
					_internalCustomer:internalCustomer
				});
			}
	
		return data;
	},
	updateServiceWork:function() {
		var serviceWorkRecords = [];
		for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
			var serviceWork = nlapiGetLineItemValue('item', 'custcol_servicework', i);
			if (serviceWork) serviceWorkRecords.push(serviceWork);
		}
		if (serviceWorkRecords.length === 0) return;

		var updatesToProcess = this._checkTransactionValues(serviceWorkRecords);
		for (var ii = 0, countii = updatesToProcess.length ; ii < countii ; ii++) {
			nlapiSubmitField(
				'customrecord_servicework',
				updatesToProcess[ii].id,
				updatesToProcess[ii].fields,
				updatesToProcess[ii].values
			);
		}
	},
	_checkTransactionValues:function(ids) {
		var updates = [];
		var filters = [];
			filters.push(new nlobjSearchFilter('internalid', null, 'anyof', ids));
			filters.push(new nlobjSearchFilter(nlapiGetRecordType() == 'estimate' ? 'custrecord_service_work_estimate' : 'custrecord_service_work_salesorder', null, 'anyof', ['@NONE@']));
		var columns = [];
			columns.push(new nlobjSearchColumn('internalid'));
			columns.push(new nlobjSearchColumn('custrecord_service_work_status'));
		var results = nlapiSearchRecord('customrecord_servicework', null, filters, columns) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			var temp = {
				id:results[i].getId(),
				fields:[
					nlapiGetRecordType() == 'estimate' ? 'custrecord_service_work_estimate' : 'custrecord_service_work_salesorder'
				],
				values:[
					nlapiGetRecordId()
				]
			};
			if (results[i].getValue('custrecord_service_work_status') == 31 && nlapiGetRecordType() == 'salesorder') {
				temp.fields.push('custrecord_service_work_status');
				temp.values.push(32);
			}
			updates.push(temp);
		}
		return updates;
	},
	updateServiceParts:function() {
		var serviceParts = [];
		for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
			var servicePart = nlapiGetLineItemValue('item', 'custcol_servicepart', i);
			if (servicePart) serviceParts.push(servicePart);
		}
		if (serviceParts.length === 0) return;

		var updatesToProcess = this._checkTransactionValuesParts(serviceParts);
		for (var ii = 0, countii = updatesToProcess.length ; ii < countii ; ii++) {
			nlapiSubmitField(
				'customrecord_serviceparts',
				updatesToProcess[ii].id,
				updatesToProcess[ii].fields,
				updatesToProcess[ii].values
			);
			log('Updated Service Work ('+ (ii+1) +'/'+ countii +')', updatesToProcess[ii]);
		}
	},
	_checkTransactionValuesParts:function(ids) {
		var updates = [];
		var filters = [];
			filters.push(new nlobjSearchFilter('internalid', null, 'anyof', ids));
			filters.push(new nlobjSearchFilter(nlapiGetRecordType() == 'estimate' ? 'custrecord_serviceparts_estimate' : 'custrecord_serviceparts_salesorder', null, 'anyof', ['@NONE@']));
		var columns = [];
			columns.push(new nlobjSearchColumn('internalid'));
		var results = nlapiSearchRecord('customrecord_serviceparts', null, filters, columns) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			var temp = {
				id:results[i].getId(),
				fields:[
					nlapiGetRecordType() == 'estimate' ? 'custrecord_serviceparts_estimate' : 'custrecord_serviceparts_salesorder'
				],
				values:[
					nlapiGetRecordId()
				]
			};
			updates.push(temp);
		}
		return updates;
	},
	rejectTransaction:function(scriptFunction, type, form, request) {

		if (!this.diagnosticFee) {
			log('Warning: Diagnostic Fee not configured', 'Users will be unable to reject Estimates until this is defined. This can be defined in the Company\'s General Preferences', 'AUDIT');
			return;
		}
		
		if (scriptFunction == 'beforeLoad') {
			this._rejectBeforeLoad(type, form, request);
		} else if (scriptFunction == 'beforeSubmit') {
			this._rejectBeforeSubmit(type);
		} else if (scriptFunction == 'afterSubmit') {
			this._rejectAfterSubmit(type);
		}
	},
	_rejectBeforeLoad:function(type, form, request) {

		/* Estimate Rejection 
			Build button to transform Estimate into 
			Sales Order
			*/
			if (nlapiGetRecordType() == 'estimate' && type == 'view') {
				var open = nlapiGetFieldValue('statusRef') == 'open';
				if (open) {
					form.addButton(
						'custpage_srvreject',
						'Reject Service Estimate',
						'window.open(\'/app/accounting/transactions/salesord.nl?memdoc=0&transform=estimate&e=T&id=' + nlapiGetRecordId() + '&reject=T\', \'_self\')'
					);
				}
			}

		/* Sales Order Rejection
			Trap request parameter, remove lines and
			insert diagnostic charge
			*/
			if (nlapiGetRecordType() == 'salesorder' && type == 'create' && request) {
				if (request.getParameter('reject') == 'T') {

					var field = form.addField('custpage_srvreject', 'checkbox', 'Service Estimate Rejected')
						field.setDefaultValue('T');
						field.setDisplayType('hidden');

					var serviceWorkCount = 0, rejectedServiceWork = [];
					for (var i = nlapiGetLineItemCount('item') ; i >= 1 ; i--) {
						var serviceWork = nlapiGetLineItemValue('item', 'custcol_servicework', i);
						if (serviceWork) {
							serviceWorkCount++;
							rejectedServiceWork.push(serviceWork);
						}
						log(i, {
							serviceWork:serviceWork,
							serviceWorkCount:serviceWorkCount
						});
						nlapiRemoveLineItem('item', i);
					}
					log('Rejected Service Work', {
						quantity:serviceWorkCount,
						serviceWork:rejectedServiceWork
					});

					var customerValues = nlapiLookupField('customer', nlapiGetFieldValue('entity'), 'pricelevel');
					var itemValues = nlapiLookupField('item', this.diagnosticFee, ['price', 'description'/*, 'costestimate'*/]);
					var itemData = {
						item:this.diagnosticFee,
						quantity:serviceWorkCount,
						price:customerValues.pricelevel,
						rate:itemValues.price,
						amount:itemValues.price,
						memo:itemValues.description,
						taxcode:-7,
						// costestimatetype:'ITEMDEFINED',
						// costestimate:itemValues.costestimate
					};

					for (var field in itemData) {
						nlapiSetLineItemValue('item', field, 1, itemData[field]);
					}
				}
			}
	},
	_rejectBeforeSubmit:function(type) {

		/* Sales Order Rejection
			Save ustpage_srvreject value in context
			*/
			if (nlapiGetRecordType() == 'salesorder' && nlapiGetFieldValue('custpage_srvreject') == 'T' && nlapiGetFieldValue('createdfrom') && type == 'create') {
				nlapiGetContext().setSessionObject('srvreject', 'T');
			} else {
				nlapiGetContext().setSessionObject('srvreject', '');
			}
	},
	_rejectAfterSubmit:function(type) {

		/* Sales Order Rejection
			Save ustpage_srvreject value in context
			*/
			if (nlapiGetRecordType() == 'salesorder' && nlapiGetContext().getSessionObject('srvreject') == 'T' && type == 'create') {
				nlapiGetContext().setSessionObject('srvreject', '');
				var estimate = nlapiGetFieldValue('estimate');

				/* Get Service Work associated to Estimate
					that are not already rejected, update status 
					*/
					var rejectedIds = [];
					var filter = [];
						filter.push(new nlobjSearchFilter('custrecord_service_work_estimate', null, 'anyof', [estimate]));
						filter.push(new nlobjSearchFilter('custrecord_service_work_status', null, 'noneof', [7]));
					var column = [];
						column.push(new nlobjSearchColumn('internalid'));
					var results = nlapiSearchRecord('customrecord_servicework', null, filter, column) || [];
					for (var i = 0, count = results.length ; i < count ; i++) {
						var id = results[i].getId();
						nlapiSubmitField('customrecord_servicework', id, 'custrecord_service_work_status', 7);
						rejectedIds.push(id);
					}

				log('Rejected Service Work', {
					salesOrder:nlapiGetRecordId(),
					estimate:estimate,
					user:nlapiGetUser(),
					rejectedIds:rejectedIds
				});
			}
	},
	serviceParts:function(form) {
		if ((type == 'create' || type == 'edit') && this.serviceRequest) {

			var serviceParts = this._getServiceParts(this.serviceRequest);

			if (serviceParts.length > 0) {
				var field = form.addField('custpage_servicepartjson', 'textarea', 'Service Parts');
					field.setDefaultValue(JSON.stringify(serviceParts));
					field.setDisplayType('hidden');
				// Hiding button, will add parts to the transaction by default
				// form.addButton('custpage_serviceparts', 'Add Service Parts', 'serviceTransaction.addServiceParts()');
			}
		}
	},
	_getServiceParts:function(serviceRequest) {
		var data = [];
		var filters = [
			[
				["custrecord_serviceparts_changeorder","is","F"], "OR",
				[
					["custrecord_serviceparts_changeorder","is","T"], "AND",
					nlapiGetRecordType() == 'estimate' ? ["custrecord_serviceparts_changetask.custevent_changeorderstatus","anyof", '@NONE@', 1, 2] : ["custrecord_serviceparts_changetask.custevent_changeorderstatus","anyof", 2]
				]
			], "AND",
			["custrecord_serviceparts_salesorder","anyof","@NONE@"], "AND",
			["custrecord_serviceparts_estimate","anyof","@NONE@"], "AND",
			["custrecord_serviceparts_request","anyof",serviceRequest]
		];
		var columns = [];
			columns.push(new nlobjSearchColumn('custrecord_serviceparts_part'));
			columns.push(new nlobjSearchColumn('custrecord_serviceparts_quantity'));
		var results = nlapiSearchRecord('customrecord_serviceparts', null, filters, columns) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				id:results[i].getId(),
				item:results[i].getValue('custrecord_serviceparts_part'),
				quantity:results[i].getValue('custrecord_serviceparts_quantity')
			});
		}
		return data;
	},
	salesRepTask:function() {

		var salesRep = nlapiLookupField('customer', nlapiGetFieldValue('entity'), 'salesrep'), request = nlapiGetFieldValue('custbody_servicerequest');
		if (nlapiGetUser() == salesRep || !salesRep || !request) return;

		var taskExists = this._salesRepTaskExists();

		if (!taskExists) this._createTask(salesRep, request);
	},
	_salesRepTaskExists:function() {

		var ids = [nlapiGetRecordId()];
		var createdFrom = nlapiGetFieldValue('createdfrom');
		if (createdFrom) ids.push(createdFrom);

		var filter = [];
			filter.push(new nlobjSearchFilter('custevent_salesrepnotification', null, 'is', 'T'));
			filter.push(new nlobjSearchFilter('internalid', 'transaction', 'anyof', ids));
		var column = [];
			column.push(new nlobjSearchColumn('internalid'));
		var results = nlapiSearchRecord('task', null, filter, column) || [];
		return results.length > 0;
	},
	_createTask:function(salesRep, request) {
		var record = nlapiCreateRecord('task');
			record.setFieldValue('title', 'Service Request Transaction to Review: #'+nlapiLookupField(nlapiGetRecordType(), nlapiGetRecordId(), 'tranid'));
			record.setFieldValue('custevent_salesrepnotification', 'T');
			record.setFieldValue('assigned', salesRep);
			record.setFieldValue('sendemail', 'T');
			record.setFieldValue('duedate', businessDays(this.taskDueDateBusinessDayAddition));
			record.setFieldValue('message', 'Please review this recently created transaction associated to your customer.');
			record.setFieldValue('company', nlapiGetFieldValue('entity'));
			record.setFieldValue('contact', nlapiLookupField('customrecord_servicerequest', request, 'custrecord_servicerequest_contact') || '');
			record.setFieldValue('transaction', nlapiGetRecordId());
			record.setFieldValue('custevent_servicerequest', request);
		record = nlapiSubmitRecord(record, true, true);
		log('Task Created for Sales Rep', {
			user:nlapiGetUser(),
			recordType:nlapiGetRecordType(),
			recordId:nlapiGetRecordId(),
			taskId:record
		});
	}
};