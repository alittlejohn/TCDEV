var servicePart = {
	taskDueDateBusinessDayAddition:1,
	beforeLoad:function(type, form, request) {
	},
	beforeSubmit:function(type) {
	},
	afterSubmit:function(type) {

		if (type != 'xedit' && type != 'delete') this.createChangeOrderTask();
	},
	createChangeOrderTask:function() {
		if (nlapiGetFieldValue('custrecord_serviceparts_changeorder') == 'T' && !nlapiGetFieldValue('custrecord_serviceparts_changetask')) {

			/* Collect values */
				var part = nlapiGetFieldText('custrecord_serviceparts_part');
				var quantity = nlapiGetFieldValue('custrecord_serviceparts_quantity');
				var serviceRequest = nlapiGetFieldValue('custrecord_serviceparts_request');
				var requestValues = nlapiLookupField(
					'customrecord_servicerequest',
					serviceRequest,
					[
						'custrecord_servicerequest_customer',
						'custrecord_servicerequest_contact',
						'custrecord_servicerequest_customer.salesrep',
						'custrecord_servicerequest_supportrep'
					]
				);
				var assignedToValues = this._assignedToDetails(
					requestValues['custrecord_servicerequest_customer.salesrep'],
					requestValues.custrecord_servicerequest_supportrep
				);

			/* Create Task */
				var record = nlapiCreateRecord('task');
					record.setFieldValue('custevent_servicerequest', serviceRequest);
					record.setFieldValue('custevent_servicepart', nlapiGetRecordId());
					record.setFieldValue('title', 'Service Change Order, Part: ' + part + ', Quantity: ' + quantity);
					record.setFieldValue('assigned', assignedToValues.id);
					record.setFieldValue('message', assignedToValues.message);
					record.setFieldValue('sendemail', 'T');
					record.setFieldValue('duedate', businessDays(this.taskDueDateBusinessDayAddition));
					record.setFieldValue('company', requestValues.custrecord_servicerequest_customer);
					record.setFieldValue('contact', requestValues.custrecord_servicerequest_contact);
				record = nlapiSubmitRecord(record, true, true);

			/* Update Service Part/Labor with Task */
				nlapiSubmitField(nlapiGetRecordType(), nlapiGetRecordId(), 'custrecord_serviceparts_changetask', record);
				log('Change Order Task Created', {
					id:record,
					assignedTo: requestValues['custrecord_servicerequest_customer.salesrep'] ? 
						'Sales Rep: ' + requestValues['custrecord_servicerequest_customer.salesrep'] : 
						requestValues.custrecord_servicerequest_supportrep
				});
		
			/* Update Service Work Status */
				var serviceWork = nlapiGetFieldValue('custrecord_serviceparts_work');
				if (serviceWork) {
					nlapiSubmitField(
						'customrecord_servicework',
						serviceWork,
						'custrecord_service_work_status',
						33
					);
				}
		}
	},
	_assignedToDetails:function(salesRep, technician) {
		if (salesRep) {
			return {
				id:salesRep,
				message:'Please review the Change Order as your earliest convenience. '+
					'If the Change Order is accepted please update the Task to reflect this which will send a notification '+
					'to the Service Representative working on the Service Request.'
			};
		} else {
			return {
				id:technician,
				message:'The Customer associated to the Service Request does not have a Sales Rep assigned, the Change Order will '+
					'be assigned to you initially. If a suitable Sales Representative is available, you can reassign the Task to '+
					'them for further review and approval of the Change Order.'
			};
		}
	}
}