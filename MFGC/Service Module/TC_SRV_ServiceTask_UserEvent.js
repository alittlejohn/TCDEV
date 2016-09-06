var serviceTask = {
	beforeLoad:function(type, form, request) {
	},
	beforeSubmit:function(type) {

		this.rejectChangeOrder(type);
	},
	afterSubmit:function(type) {

		this.updateServiceWorkStatus(type);
	},
	rejectChangeOrder:function(type) {
		var servicePart = nlapiGetFieldValue('custevent_servicepart');
		if (type == 'delete' || nlapiGetFieldValue('custevent_changeorderstatus') == 3 && servicePart) {
			log('Reject Change Order', {
				task:nlapiGetRecordId(),
				servicePart:servicePart,
				type:type,
				user:nlapiGetUser()
			});

			var partTransactions = nlapiLookupField(
				'customrecord_serviceparts',
				servicePart,
				[
					'custrecord_serviceparts_estimate',
					'custrecord_serviceparts_salesorder'
				]
			);

			try {
				var salesOrderRemoved = this._removePartFromTransaction(
					servicePart,
					partTransactions.custrecord_serviceparts_salesorder,
					'salesorder'
				);
				var estimateRemoved = this._removePartFromTransaction(
					servicePart,
					partTransactions.custrecord_serviceparts_estimate,
					'estimate'
				);
			} catch(e) {
				var error = {};
				if (e instanceof nlobjError) {
					error.details = e.getDetails();
				} else {
					error.details = e.toString();
				}
				throw nlapiCreateError('Error Rejecting Service Part', error.details, true);
			}

			var fields = [], values = [];
			if (salesOrderRemoved) {
				fields.push('custrecord_serviceparts_salesorder'), values.push('');
			}
			if (estimateRemoved) {
				fields.push('custrecord_serviceparts_estimate'), values.push('');
			}
			nlapiSubmitField(
				'customrecord_serviceparts',
				servicePart,
				fields,
				values
			);
		}
	},
	_removePartFromTransaction:function(servicePart, id, type) {
		var lineId, dependentTransactions, removed = false;
		if (id) {
			var record = nlapiLoadRecord(type, id);
			lineId = record.findLineItemValue('item', 'custcol_servicepart', servicePart);
			if (lineId > 0) {
				dependentTransactions = (type == 'salesorder' && (record.getLineItemValue('item', 'linkedordbill', lineId) == 'T' || record.getLineItemValue('item', 'linkedshiprcpt', lineId) == 'T'));
				if (dependentTransactions) {
					throw nlapiCreateError(
						'Cannot Reject Change Order',
						'This Change Order cannot be rejected, it has either been fulfilled or billed already.',
						true
					);
				}
				if (type == 'estimate' || !dependentTransactions) {
					record.removeLineItem('item', lineId);
					nlapiSubmitRecord(record, true, true);
					removed = true;
				}
				
			}
		}
		log('Remove Serivce Part from Transaction', {
			servicePart:servicePart,
			transactionId:id,
			type:type,
			lineId:lineId,
			dependentTransactions:dependentTransactions,
			removed:removed
		});
		return removed;
	},
	updateServiceWorkStatus:function(type) {

		/* Get Service Work Id */
			var servicePart = nlapiLookupField(
				'task',
				nlapiGetRecordId(),
				'custevent_servicepart'
			);
			if (!servicePart) return;

			var serviceWork = nlapiLookupField(
				'customrecord_serviceparts',
				servicePart,
				'custrecord_serviceparts_work'
			);
			if (!serviceWork) return;

		/* Get all Service Parts associated to Work */
			var pending = false, approved = [], rejected = [];
			var filter = [];
				filter.push(new nlobjSearchFilter('custrecord_serviceparts_work', null, 'anyof', [serviceWork]));
				filter.push(new nlobjSearchFilter('custevent_changeorderstatus', 'custrecord_serviceparts_changetask', 'anyof', [2, 3])); // Approved, Unapproved
			var column = [];
				column.push(new nlobjSearchColumn('custevent_changeorderstatus', 'custrecord_serviceparts_changetask'));
				column.push(new nlobjSearchColumn('custrecord_service_work_status', 'custrecord_serviceparts_work')); // 33 Pending Approval
			var results = nlapiSearchRecord('customrecord_serviceparts', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				if (results[0].getValue('custrecord_service_work_status', 'custrecord_serviceparts_work') == 33) pending = true;
				if (results[i].getValue('custevent_changeorderstatus', 'custrecord_serviceparts_changetask') == 2) approved.push(results[i].getId());
				if (results[i].getValue('custevent_changeorderstatus', 'custrecord_serviceparts_changetask') == 3) rejected.push(results[i].getId());
			}

		/* Update Work as necessary */
			if (pending) {
				var fields = [], values = [];
				if (approved.length == results.length) {
					fields.push('custrecord_service_work_status'), values.push(34);
				}
				if (rejected.length == results.length) {
					fields.push('custrecord_service_work_status'), values.push(35);
				}
				if (fields.length > 0) nlapiSubmitField('customrecord_servicework', serviceWork, fields, values);
			}
			log('Update Service Work Status', {
				type:type,
				user:nlapiGetUser(),
				taskId:nlapiGetRecordId(),
				serviceWorkId:serviceWork,
				pending:pending,
				approved:approved,
				rejected:rejected,
				'results.length':results.length
			});
	}
}