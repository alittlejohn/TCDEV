var suitelet = {
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

					// get posted data and create group, bg process instance, and update bulk assets

				} else {

					form = ui.build();

					/* Return Response */
						this.returnResponse(response, form, data);

				}

			} catch(e) {
				var error = {};
				if (e instanceof nlobjError) {
					error.type = 'NetSuite', error.details = e.getDetails() || e.getCode(), error.stack = e.getStackTrace();
				} else {
					error.type = 'JavaScript', error.details = e.toString();
				}
				log('Error', error, 'ERROR');
				this.returnResponse(response, null, error);
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
	returnResponse:function(response, form, data) {
		log('returnResponse', arguments.callee.name);
		if (form) {
			response.writePage(form);
		} else if (data) {
			response.write(typeof data == 'object' ? JSON.stringify(data) : data);
		}
	}
};

var ui = {
	build:function(type) {

		var form, tab, sublist, group, field;

		form = nlapiCreateForm('Associate Cars/Assets to Event');

		form.addSubmitButton('Confirm Selection');

		field = form.addField('custpage_suiteletcontext', 'textarea', 'SuiteLet Context');
			field.setDisplayType('hidden');
			field.setDefaultValue(JSON.stringify({
				scriptId:suitelet.execution.scriptId,
				deploymentId:suitelet.execution.deployment,
				parameters:suitelet.execution.parameters
			}));

		/* Add Script */
			form.setScript('customscript_mfgc_eventassociation_cli');

		/* Add filter fields */
			group = form.addFieldGroup('custpage_filters', 'Event');
				field = form.addField('custpage_event', 'select', 'Event', null, 'custpage_filters');
					this._setDefaultValue(field);
					field.setDisplayType('inline');

		/* Add tab and sublist
			*/
			tab = form.addTab('custpage_selectcarstab', 'Select Cars/Assets');
				sublist = form.addSubList('custpage_selectcars', 'inlineeditor', 'Select Cars/Assets', 'custpage_selectcarstab');
					field = sublist.addField('custpage_asset', 'select', 'Car/Asset', 'customrecord_ncfar_asset');
					field = sublist.addField('custpage_assettype', 'textarea', 'Asset Type');
						field.setDisplayType('disabled');
					field = sublist.addField('custpage_description', 'textarea', 'Description');
						field.setDisplayType('disabled');
					field = sublist.addField('custpage_status', 'text', 'Status');
						field.setDisplayType('disabled');
			tab = form.addTab('custpage_selectedcarstab', 'Selected Cars/Assets');
				sublist = form.addSubList('custpage_selectedcars', 'list', 'Selected Cars/Assets', 'custpage_selectcarstab');
					field = sublist.addField('custpage_select', 'checkbox', 'Disassociate from Event');
					field = sublist.addField('custpage_asset', 'select', 'Car/Asset', 'customrecord_ncfar_asset');
						field.setDisplayType('inline');
					field = sublist.addField('custpage_description', 'textarea', 'Description');
						field.setDisplayType('inline');
					field = sublist.addField('custpage_status', 'text', 'Status');
						field.setDisplayType('inline');
				// sublist.setLineItemValues();
		
		return form;
	},
	_setDefaultValue:function(field) {
		field.setDefaultValue(
			suitelet.execution.parameters[field.getName()] || ''
		);
	},
	getAssets:function(available) {

		var data = [];

		var filter = [];
			
		var column = [];
			
		var results = nlapiSearchRecord('customrecord_ncfar_asset', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				
			});
		}

		return data;
	}
};

var suiteletClient = {
	parameters:{},
	pageInit:function() {
		this.parameters = getParameters();
	},
	saveRecord:function() {
		return true;
	},
	validateField:function(type, name) {
		return true;
	},
	fieldChanged:function(type, name) {
		if (type == 'custpage_selectcars' && name == 'custpage_asset') {
			var asset = nlapiGetCurrentLineItemValue(type, name);
			this.setAssetValues(asset);
		}
	},
	postSourcing:function(type, name) {
	},
	lineInit:function(type) {
	},
	validateLine:function(type) {
		return true;
	},
	validateInsert:function(type) {
		return true;
	},
	validateDelete:function(type) {
		return true;
	},
	recalc:function(type) {

	},
	setAssetValues:function(asset) {
		if (asset) {
			var filter = [];
				filter.push(new nlobjSearchFilter('internalid', null, 'anyof', [asset]));
				filter.push(new nlobjSearchFilter('custrecord_asset_rentalstatus', null, 'anyof', [1, '@NONE@'])); // Available
			var column = [];
				column.push(new nlobjSearchColumn('custrecord_assetdescr'));
				column.push(new nlobjSearchColumn('custrecord_assettype'));
				column.push(new nlobjSearchColumn('custrecord_asset_rentalstatus'));
			var results = nlapiSearchRecord('customrecord_ncfar_asset', null, filter, column) || [];
			if (results.length > 0) {
				nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_assettype', results[0].getText('custrecord_assettype'));
				nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_description', results[0].getValue('custrecord_assetdescr'));
				nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_status', results[0].getText('custrecord_asset_rentalstatus'));
			} else {
				alert('Asset is not Available, please select another asset.');
				nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_asset', '', false, true);
			}
		} else {
			nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_assettype', '');
			nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_description', '');
			nlapiSetCurrentLineItemValue('custpage_selectcars', 'custpage_status', '');
		}
	}
};

/* Get Parameters */
	function getParameters() {
		var vars = {};
		var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi,
		function(m,key,value) {
			vars[key] = value;
		});
		return vars;
	}
