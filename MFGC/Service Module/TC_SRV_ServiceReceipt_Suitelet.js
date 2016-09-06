var suitelet = {
	placeholder:'TBD',
	execution:{
		parameters:{}
	},
	execute:function(request, response) {

		/* Get Execution Context and Parameters */
			this.getContext(request);
			this.getParameters(request);

		/* Process Request */
			var data = {}, form;
			try {

				if (this.execution.method == 'POST') {

					this.getFormData(request);

					this.cleanSerialNumbers();

					this.customer = nlapiLookupField('customrecord_servicerequest', this.execution.parameters.custpage_servicerequest, 'custrecord_servicerequest_customer');

					this.updateSerialNumbers();

					this.updateServiceWork();

					nlapiSetRedirectURL('RECORD', 'customrecord_servicerequest', this.execution.parameters.custpage_servicerequest);

				} else {

					var form = ui.build();

					/* Return Response */
						response.writePage(form);

				}

			} catch(e) {
				var error = {};
				if (e instanceof nlobjError) {
					error.type = 'NetSuite', error.title = e.getCode(), error.details = e.getDetails(), error.stack = e.getStackTrace();
				} else {
					error.type = 'JavaScript', error.details = e.toString();
				}
				nlapiLogExecution('ERROR', 'Error', JSON.stringify(error));
				response.write(JSON.stringify(error));
			}

		log('Execution-time (seconds)', ((new Date().getTime()-this.execution.start)/1000).toFixed(2));
	},
	getContext:function(request) {
		var context = nlapiGetContext();
		this.execution.start = new Date().getTime();
		this.execution.context = context.getExecutionContext();
		this.execution.user = nlapiGetUser();
		this.execution.email = context.getEmail();
		this.execution.subsidiary = context.getSubsidiary();
		this.execution.company = context.getCompany();
		this.execution.environment = context.getEnvironment();
		this.execution.deployment = context.getDeploymentId();
		this.execution.scriptId = context.getScriptId();
		if (request) {
			this.execution.method = request.getMethod();
			this.execution.url = request.getURL();
			this.execution.domain = this.execution.url.replace(/\/app.*/, '');
		}
		log('Execution Context', this.execution);
	},
	getParameters:function(request) {
		if (request) {
			var allParameters = request.getAllParameters();
			for (var parameter in allParameters) {
				var temp = request.getParameter(parameter);
				if (temp) this.execution.parameters[parameter] = request.getParameter(parameter);
			}
		}
		log('Parameters', this.execution.parameters);
	},
	getFormData:function(request) {
		this.data = {
			data:JSON.parse(this.execution.parameters.custpage_datastorage || '[]')
		};
		log('getFormData', this.data);
	},
	cleanSerialNumbers:function() {
		for (var i = 0, count = this.data.data.length ; i < count ; i++) {
			if (this.data.data[i].newSerialNumber) {
				this.data.data[i].newSerialNumber = this.data.data[i].newSerialNumber.replace(/[^a-zA-Z0-9]/g, '');
				if (this.data.data[i].newSerialNumber == this.placeholder) this.data.data[i].newSerialNumber = '';
			}
		}
	},
	updateServiceWork:function() {
		for (var i = 0, count = this.data.data.length ; i < count ; i++) {

			var foundEquipment = false;

			var fields = [
				'custrecord_service_work_status',
				'custrecord_service_work_dreceived',
				'custrecord_service_work_tracking'
			];
			var values = [
				31,
				nlapiDateToString(new Date()),
				this.data.data[i].trackingNumber
			];
			if (this.data.data[i].foundEquipmentId) {
				fields.push('custrecord_service_work_equipment');
				values.push(this.data.data[i].foundEquipmentId);
				foundEquipment = true;
			}

			nlapiSubmitField(
				'customrecord_servicework',
				this.data.data[i].serviceWork,
				fields,
				values
			);
			log('Updated Service Work', {
				id:this.data.data[i].serviceWork,
				trackingNumber:this.data.data[i].trackingNumber,
				fields:fields,
				values:values
			});

		}
	},
	updateSerialNumbers:function() {

		this.findEquipment();
		log('updateSerialNumbers', this.data.data);

		for (var i = 0, count = this.data.data.length ; i < count ; i++) {
			var newSerialNumber = this.data.data[i].newSerialNumber;
			var equipmentId = nlapiLookupField('customrecord_servicework', this.data.data[i].serviceWork, 'custrecord_service_work_equipment');
			if (newSerialNumber) {
				if (this.data.data[i].foundEquipmentId) {
					log('Found Existing Serial Number', {
						newSerialNumber:newSerialNumber,
						existingEquipmentId:this.data.data[i].foundEquipmentId,
						customer:this.customer,
						note:'Inactivated Equipment ID #'+equipmentId
					});

					nlapiSubmitField('customrecord_equipment', equipmentId, 'isinactive', 'T');

				} else {
					nlapiSubmitField(
						'customrecord_equipment',
						equipmentId,
						[
							'name',
							'externalid'
						],
						[
							newSerialNumber,
							this.customer + '-' + newSerialNumber
						]
					);
					log('Updated Serial Number', {
						equipmentId:equipmentId,
						newSerialNumber:newSerialNumber,
						customer:this.customer
					});
				}
			}
		}
	},
	findEquipment:function() {

		log('findEquipment', this.data.data);
		
		/* Get Serial Numbers */
			var serialNumbers = [];
			for (var s = 0, counts = this.data.data.length ; s < counts ; s++) {
				if (this.data.data[s].newSerialNumber) {
					serialNumbers.push(this.data.data[s].newSerialNumber);
				}
			}
			if (!serialNumbers) return;

		/* Search for Serial Numbers */
			var filter = [
				['custrecord_equipment_customer', 'is', this.customer],
				'AND',
				[]
			];
			for (var f = 0, countf = serialNumbers.length ; f < countf ; f++) {
				filter[2].push(['name', 'is', serialNumbers[f]]);
				if (f+1 < countf) filter[2].push('OR');
			}
			var results = nlapiSearchRecord('customrecord_equipment', null, filter, [new nlobjSearchColumn('name'), new nlobjSearchColumn('isinactive')]) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				var foundEquipmentName = results[i].getValue('name'), foundEquipmentId = results[i].getId();
				var index = misc.index(this.data.data, foundEquipmentName, 'newSerialNumber');
				if (index !== null) {
					this.data.data[index].foundEquipmentId = foundEquipmentId;
					if (results[i].getValue('isinactive') == 'T') nlapiSubmitField('customrecord_equipment', foundEquipmentId, 'isinactive', 'F');
				}
			}

	}
};

var ui = {
	sublist:'custpage_servicework',
	build:function() {
		var form = nlapiCreateForm('Receive Equipment'), tab, sublist, group, field;

		form.addSubmitButton('Receive Equipment');

		/* Add Script */

			form.setScript('customscript_service_servicereceipt_cli');

		/* Add body fields */
			field = form.addField('custpage_servicerequest', 'select', 'Service Request', 'customrecord_servicerequest');
				field.setDisplayType('inline');
				field.setDefaultValue(suitelet.execution.parameters.request);
			field = form.addField('custpage_datastorage', 'longtext', 'Data Storage');
				field.setDisplayType('hidden');

		/* Add tab and sublist
			Ungrouped Asset Records
			*/
			tab = form.addTab('custpage_serviceworktab', 'Receive Equipment');
			sublist = form.addSubList(this.sublist, 'list', 'Receive Equipment', 'custpage_serviceworktab');
				sublist.addField('receive', 'checkbox', 'Receive');
				sublist.addField('url', 'url', 'View').setLinkText('View');
				sublist.addField('servicework', 'integer', 'Service Work ID').setDisplayType('hidden');
				sublist.addField('equipment', 'select', 'Equipment', 'customrecord_equipment').setDisplayType('inline');
				sublist.addField('trackingnumber', 'text', 'Tracking Number').setDisplayType('entry');
				sublist.addField('newserialnumber', 'text', 'Update Serial Number').setDisplayType('entry');
			sublist.setLineItemValues(this.getUnreceivedServiceWork());

		return form;
	},
	getUnreceivedServiceWork:function() {
		var data = [];
		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('custrecord_service_work_request', null, 'anyof', [suitelet.execution.parameters.request]));
			filter.push(new nlobjSearchFilter('custrecord_service_work_status', null, 'anyof', [29]));
		var column = [];
			column.push(new nlobjSearchColumn('custrecord_service_work_equipment'));
		var results = nlapiSearchRecord('customrecord_servicework', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				url:suitelet.execution.domain + nlapiResolveURL('RECORD', 'customrecord_servicework', results[i].getId()),
				servicework:results[i].getId(),
				equipment:results[i].getValue('custrecord_service_work_equipment')
			});
		}
		return data;
	}
};

var suiteletClient = {
	saveRecord:function() {
		var data = [];
		for (var i = 1, count = nlapiGetLineItemCount(ui.sublist) ; i <= count ; i++) {
			if (nlapiGetLineItemValue(ui.sublist, 'receive', i) == 'T') {
				data.push({
					serviceWork:nlapiGetLineItemValue(ui.sublist, 'servicework', i),
					trackingNumber:nlapiGetLineItemValue(ui.sublist, 'trackingnumber', i),
					newSerialNumber:nlapiGetLineItemValue(ui.sublist, 'newserialnumber', i)
				});
			}
		}
		nlapiSetFieldValue('custpage_datastorage', JSON.stringify(data));
		if (data.length === 0) {
			alert('Please select at lease one piece of Equipment to receive.');
			return false;
		}
		return true;
	}
};