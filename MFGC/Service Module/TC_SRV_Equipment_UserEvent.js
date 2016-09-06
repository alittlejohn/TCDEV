var equipment = {
	placeholder:'TBD',
	beforeLoad:function(type, form, request) {

		this.getConfiguration();

		this.buildUI(type, form);
	},
	beforeSubmit:function(type) {

		var name = nlapiGetFieldValue('name');
		nlapiSetFieldValue('name', name.replace(/[^a-zA-Z0-9]/g, ''));

		if (type == 'edit') this.updateExternalId('beforeLoad');
	},
	afterSubmit:function(type) {

		if (type == 'edit') this.updateExternalId('afterSubmit');
	},
	updateExternalId:function(userEventFunction) {

		if (userEventFunction == 'beforeLoad') {
			var currentValues = nlapiLookupField(nlapiGetRecordType(), nlapiGetRecordId(), ['name', 'custrecord_equipment_customer']);
			var customer = nlapiGetFieldValue('custrecord_equipment_customer'), newName = nlapiGetFieldValue('name');
			log('Update External ID - beforeLoad', {
				currentName:currentValues.name,
				newName:newName,
				customer:customer
			});

			if (currentValues.name != newName && currentValues.custrecord_equipment_customer != customer) nlapiGetContext().setSessionObject('equipmentExternalId', customer+'-'+newName);
		}

		if (userEventFunction == 'afterSubmit') {
			var newExternalId = nlapiGetContext().getSessionObject('equipmentExternalId');
				nlapiGetContext().setSessionObject('equipmentExternalId', '');

			log('Update External ID - afterSubmit', {
				newExternalId:newExternalId
			});
			if (newExternalId && newExternalId != this.placeholder) nlapiSubmitField(nlapiGetRecordType(), nlapiGetRecordId(), 'externalid', newExternalId.replace(/[^a-zA-Z0-9]/g, ''));
		}
	},
	getConfiguration:function() {
		this.serviceRequestRecordId = nlapiGetContext().getSessionObject(nlapiGetRecordType()+'_serviceRequestRecordId') || getCustomRecordId('customrecord_servicerequest', nlapiGetRecordType()+'_serviceRequestRecordId') || null;
		if (!this.serviceRequestRecordId) throw nlapiCreateError('001 Unable to locate Service Request Record ID', '001 Please contact TrueCloud support.', true);
	},
	buildUI:function(type, form) {
		if (type == 'view') {
			form.addButton(
				'custpage_createrequest',
				'Create Service Request',
				"window.open('https://system.netsuite.com/app/common/custom/custrecordentry.nl?rectype="+this.serviceRequestRecordId+"&EQP="+nlapiGetRecordId()+"', '_self')"
			);
		}
	}
};