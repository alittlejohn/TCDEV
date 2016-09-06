var updateJobcodes = {
	postData:{
		id:undefined,
		name:undefined,
		active:undefined,
		assigned_to_all: "yes"
	},
	beforeLoad:function(type, form, request) {
	},
	beforeSubmit:function(type) {
	},
	afterSubmit:function(type) {
		if (type == 'edit' || type == 'xedit' || type == 'delete') {
			
			/* Get Current and Old Records */
				var recordType = nlapiGetRecordType(), id = nlapiGetRecordId();
				var oldRecord = nlapiGetOldRecord();
				var newRecord = nlapiGetNewRecord();
				log('After Submit', {
					type:type,
					recordType:recordType,
					id:id,
					old:oldRecord,
					new:newRecord
				}, 'DEBUG');

			/* If Editing, compare elements to ensure a change was made */
				var nameField = recordType == 'job' ? 'companyname' : 'title', statusField = recordType == 'job' ? 'entitystatus' : 'status', name, active;
				if (type == 'edit' || type =='xedit') {
					if (oldRecord.getFieldValue(nameField) != newRecord.getFieldValue(nameField) && newRecord.getFieldValue(nameField)) {
						name = newRecord.getFieldValue(nameField);
					}
					if (oldRecord.getFieldValue('isinactive') != newRecord.getFieldValue('isinactive') && newRecord.getFieldValue('isinactive')) {
						active = newRecord.getFieldValue('isinactive') == 'F';
					}
					if (oldRecord.getFieldValue(statusField) != newRecord.getFieldValue(statusField) && newRecord.getFieldValue(statusField)) {

						/* Closed statuses by recordType */
							var closed = {
								job:['19', '20'],
								projectTask:['COMPLETE'],
								supportcase:['5']
							};

						if ((active === true || active == undefined) && closed[recordType].indexOf(newRecord.getFieldValue(statusField)) > -1) {
							active = false;
						} else {
							active = true;
						}
					}
				}
				log('After Submit', {
					type:type,
					recordType:recordType,
					id:id,
					name:{
						field:nameField,
						value:name
					},
					status:{
						field:statusField,
						value:newRecord.getFieldValue(statusField)
					},
					active:active,
					tsheetId:oldRecord.getFieldValue('custevent_tsheetid') || oldRecord.getFieldValue('custentity_tsheetid')
				}, 'AUDIT');

			/* Update postData elements */
				this.postData.id = oldRecord.getFieldValue('custevent_tsheetid') || oldRecord.getFieldValue('custentity_tsheetid');
				if (!this.postData.id) return;

				if (type == 'delete') {
					this.postData.name = undefined;
				} else {
					var numberField = nlapiGetRecordType() == 'job' ? 'entityid' : nlapiGetRecordType() == 'supportcase' ? 'casenumber' : 'id';
					var number = nlapiLookupField(nlapiGetRecordType(), nlapiGetRecordId(), numberField);
					this.postData.name = number + ' ' + name;
				}

				if (type == 'delete') {
					this.postData.active = false;
				} else {
					this.postData.active = active
				}
				
			if (this.postData.name || this.postData.active != undefined) {

				if (nlapiGetRecordType() == 'supportcase') this.postData.assigned_to_all = 'no';

				log('TSheet Jobcode Update', this.postData);
				tsheet.execute('updateJobCode', null, {data:[this.postData]});
			}
		}
	}
}