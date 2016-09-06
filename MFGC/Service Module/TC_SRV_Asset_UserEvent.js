var asset = {
	internalCustomer:nlapiGetContext().getSetting('SCRIPT', 'custscript_request_internalcustomer'),
	beforeLoad:function(type, form, request) {

		this.serviceFormOrganization(form);
	},
	beforeSubmit:function(type) {

		this.normalizeServiceDate();
	},
	afterSubmit:function(type) {

		this.addEquipment();
	},
	serviceFormOrganization:function(form) {

		var tab = form.addTab('custpage_service', 'Service Setup');

		var field;
			field = form.addField('custpage_tabfield', 'text', 'Tab Field', null, 'custpage_service');
				field.setDisplayType('hidden');
			field = form.getField('custrecord_assetserviceschedule');
				form.insertField(field, 'custpage_tabfield');
			field = form.getField('custrecord_assetnextservicedate');
				form.insertField(field, 'custpage_tabfield');
			field = form.getField('custrecord_assetequipment');
				form.insertField(field, 'custpage_tabfield');
	},
	normalizeServiceDate:function() {

		var serviceDate = nlapiGetFieldValue('custrecord_assetnextservicedate');
		if (!serviceDate) return;

		serviceDate = new Date(serviceDate);
		nlapiSetFieldValue(
			'custrecord_assetnextservicedate',
			nlapiDateToString(
				new Date(
					serviceDate.getFullYear(),
					serviceDate.getMonth(),
					1
				)
			)
		);
	},
	addEquipment:function() {

		var schedule = nlapiGetFieldValue('custrecord_assetserviceschedule');
		var equipmentId = nlapiGetFieldValue('custrecord_assetequipment');
		
		if (!schedule && !equipmentId) return;

		if (!this.internalCustomer && !equipmentId) {
			log(
				'Cannot setup Asset\'s related Equipment Record',
				'Please define the Internal Customer in the Company\'s General Preferences',
				'ERROR'
			);
			return;
		}

		this._upsertAsset(equipmentId);
	},
	_upsertAsset:function(equipmentId) {

		var equipmentFields = {
			name:removeSpecialCharacters(nlapiGetFieldValue('custrecord_assetserialno') || nlapiGetFieldValue('name')),
			custrecord_equipment_description:nlapiGetFieldValue('custrecord_assetdescr'),
			custrecord_equipment_customer:this.internalCustomer,
			custrecord_equipment_purchased:nlapiGetFieldValue('custrecord_assetpurchasedate'),
			custrecord_equipment_disposed:nlapiGetFieldValue('custrecord_assetstatus') == 4 ? 'T' : 'F',
			custrecord_equipmentasset:nlapiGetRecordId()
		};

		if (equipmentId) {
			var fields = [], values = [];
			for (var field in equipmentFields) {
				fields.push(field), values.push(equipmentFields[field]);
				nlapiSubmitField('customrecord_equipment', equipmentId, fields, values);
			}
		} else {
			var equipment = nlapiCreateRecord('customrecord_equipment');
			for (var field in equipmentFields) {
				equipment.setFieldValue(field, equipmentFields[field]);
			}
			equipmentId = nlapiSubmitRecord(equipment, true, true);
			nlapiSubmitField(nlapiGetRecordType(), nlapiGetRecordId(), 'custrecord_assetequipment', equipmentId);
		}

		log('Upsert Asset', {
			upsert:equipmentId ? 'update' : 'create',
			equipmentId:equipmentId
		}, 'AUDIT');
	}
};