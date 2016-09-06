var serviceFulfillment = {
	requestId:null,
	beforeLoad:function(type, form, request) {
		
		if (type == 'create' || type == 'edit') this.disableServiceFields(form);
	},
	beforeSubmit:function(type) {
	},
	afterSubmit:function(type) {

		if (type != 'delete' && type != 'xedit') this.completeServiceWork();
	},
	disableServiceFields:function(form) {

		this.requestId = nlapiGetFieldValue('custbody_servicerequest') || null;
		if (this.requestId) {

			var fields = ['custbody_servicerequest', 'custcol_servicepart', 'custcol_servicework'], field;
			for (var i = 0, count = fields.length ; i < count ; i++) {
				field = fields[i].indexOf('custcol_') === 0 ? nlapiGetLineItemField('item', fields[i], 1) || null : nlapiGetField(fields[i]) || null;
				if (field) field.setDisplayType('inline');
			}
		}
	},
	completeServiceWork:function() {

		this.requestId = nlapiGetFieldValue('custbody_servicerequest') || null;
		if (this.requestId) {
			var serviceWorkIds = [];
			for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
				if (nlapiGetLineItemValue('item', 'itemreceive', i) == 'T') {
					var serviceWorkId = nlapiGetLineItemValue('item', 'custcol_servicework', i);
					if (serviceWorkId) {
						nlapiSubmitField(
							'customrecord_servicework',
							serviceWorkId,
							'custrecord_service_work_status',
							18
						);
						serviceWorkIds.push(serviceWorkId);
					}
				}
			}
			log('Set Service Work to Complete', {
				serviceWorkIds:serviceWorkIds,
				completeStatus:18
			});
		}
	}
};