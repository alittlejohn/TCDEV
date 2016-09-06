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

					if (this.execution.parameters.fulfillment) {
						form = ui.build('fulfillment');
					} else if (this.execution.parameters.event) {
						form = ui.build('event');
					}

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

		if (type == 'fulfillment') {
			form = nlapiCreateForm('Select Cars/Assets');

			form.addSubmitButton('Confirm Selection');

			field = form.addField('custpage_suiteletcontext', 'textarea', 'SuiteLet Context');
				field.setDisplayType('hidden');
				field.setDefaultValue(JSON.stringify({
					scriptId:suitelet.execution.scriptId,
					deploymentId:suitelet.execution.deployment,
					parameters:suitelet.execution.parameters
				}));

			/* Add Script */
				form.setScript('customscript_mfgc_rentalselection_cli');

			/* Add filter fields */
				group = form.addFieldGroup('custpage_filters', 'Filters');
					field = form.addField('custpage_serialnumber', 'text', 'Serial Number', null, 'custpage_filters');
						this._setDefaultValue(field);
					field = form.addField('custpage_name', 'text', 'Name', null, 'custpage_filters');
						this._setDefaultValue(field);
					field = form.addField('custpage_assettype', 'select', 'Asset Type', 'customrecord_ncfar_assettype', 'custpage_filters');
						this._setDefaultValue(field);

			/* Add tab and sublist
				*/
				sublist = form.addSubList('custpage_selectcars', 'list', 'Select Cars/Assets');
					field = sublist.addField('custpage_select', 'checkbox', 'Select');
					field = sublist.addField('custpage_asset', 'select', 'Car/Asset', 'customrecord_ncfar_asset');
						field.setDisplayType('inline');
					field = sublist.addField('custpage_description', 'textarea', 'Description');
					field = sublist.addField('custpage_status', 'text', 'Status');
				sublist.setLineItemValues(this.getAssets(true));
		}
		
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
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			if (available) filter.push(new nlobjSearchFilter('custrecord_asset_rentalstatus', null, 'anyof', [1, '@NONE@']));
			if (suitelet.execution.parameters.custpage_serialnumber) filter.push(new nlobjSearchFilter('custrecord_assetserialno', null, 'startswith', suitelet.execution.parameters.custpage_serialnumber));
			if (suitelet.execution.parameters.custpage_name) filter.push(new nlobjSearchFilter('idtext', null, 'startswith', suitelet.execution.parameters.custpage_name));
			if (suitelet.execution.parameters.custpage_assettype) filter.push(new nlobjSearchFilter('custrecord_assettype', null, 'is', suitelet.execution.parameters.custpage_assettype));
		var column = [];
			column.push(new nlobjSearchColumn('internalid'));
			column.push(new nlobjSearchColumn('custrecord_assetdescr'));
			column.push(new nlobjSearchColumn('custrecord_asset_rentalstatus'));
		var results = nlapiSearchRecord('customrecord_ncfar_asset', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				custpage_asset:results[i].getId(),
				custpage_description:results[i].getValue('custrecord_assetdescr'),
				custpage_status:results[i].getValue('custrecord_asset_rentalstatus')
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

		log('saveRecord', this.parameters);

		if (this.parameters.fulfillment == 'true') {
			
			var assets = [];
			for (var i = 1, count = nlapiGetLineItemCount('custpage_selectcars') ; i <= count ; i++) {
				if (nlapiGetLineItemValue('custpage_selectcars', 'custpage_select', i) == 'T') {
					assets.push(nlapiGetLineItemValue('custpage_selectcars', 'custpage_asset', i));
				}
			}

			if (assets.length === 0) {
				alert('Please select a Car/Asset.');
				return false;
			}
			if (assets.length > 1) {
				alert('Please only select a single Car/Asset.');
				return false;
			}
			if (assets.length === 1) {
				log('saveRecord', {
					line:parseInt(this.parameters.line, 10),
					asset:assets[0]
				});
				parent.window.opener.nlapiSelectLineItem('item', parseInt(this.parameters.line, 10));
					parent.window.opener.nlapiSetCurrentLineItemValue('item', 'custcol_rentalasset', assets[0]);
				parent.window.opener.nlapiCommitLineItem('item');
				window.ischanged = false;
				window.close()
			}
		}

		// return true;
	},
	validateField:function(type, name) {
		return true;
	},
	fieldChanged:function(type, name) {
		log('fieldChanged', {
			type:type,
			name:name
		});
		var filters = ['custpage_serialnumber', 'custpage_name', 'custpage_assettype'];
		if (filters.indexOf(name) > -1) {
			var scriptContext = JSON.parse(nlapiGetFieldValue('custpage_suiteletcontext'));
			var parameters = '';
			for (var param in scriptContext.parameters) {
				if (param.indexOf('custpage_') === 0) continue;
				parameters += '&' + param + '=' + scriptContext.parameters[param];
			}
			for (var f = 0, countf = filters.length ; f < countf ; f++) {
				var value = nlapiGetFieldValue(filters[f]);
				if (value) parameters += '&' + filters[f] + '=' + value;
			}

			window.ischanged = false;
			window.location.href = nlapiResolveURL('SUITELET', scriptContext.scriptId, scriptContext.deploymentId) + parameters;
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