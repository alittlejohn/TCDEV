var serviceWork = {
	beforeLoad:function(type, form, request) {

		this.buildUI(type, form);
	},
	beforeSubmit:function(type) {

	},
	afterSubmit:function(type) {

	},
	buildUI:function(type, form) {
		if (type == 'view') {
			var id = nlapiGetRecordId(), employee = nlapiGetContext().getUser(), entity = nlapiGetFieldValue('custrecord_service_work_contract') || nlapiGetFieldValue('custrecord_service_work_customer');
			form.addButton(
				'custpage_tracktime',
				'Track Time',
				"window.open('/app/accounting/transactions/timebill.nl?record.custcol_servicework="+id+"&record.employee="+employee+"&record.customer="+entity+"', '_self')"
			);
		}
	}
};