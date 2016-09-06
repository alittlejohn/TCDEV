var logs = [], consoleLog = false; try { consoleLog = console ? true : false; } catch (e) { consoleLog = false; }
function log(t, d, l) {
	logs.push({
		t: t,
		d: d,
		l: l
	});
	if (consoleLog) {
		console.log(l || 'DEBUG', t, d);
	} else {
		nlapiLogExecution(
			l || 'DEBUG',
			typeof t == 'object' ? JSON.stringify(t) : t,
			typeof d == 'object' ? JSON.stringify(d) : d
		);
	}
}

var search = {
	run: function(type, id, filters, columns, limit, returnRaw) {
		var startTime = new Date().getTime();
		log('search.run', {
			type: type,
			id: id,
			filters: this.stringifyFiltersColumns(filters),
			columns: this.stringifyFiltersColumns(columns),
			limit: limit,
			returnRaw: returnRaw
		});

		this.data = [], this.formulaCount = {};

		this.execute(type, id, filters, columns, limit, returnRaw);

		log('search.run', {
			elapsedSeconds: ((new Date().getTime() - startTime) / 1000).toFixed(2),
			iterations: Math.ceil(this.data.length / 1000),
			'results.length': this.data.length
		});

		return this.data;
	},
	execute: function(type, id, filters, columns, limit, returnRaw) {
		var search = id ? nlapiLoadSearch(type || null, id) : nlapiCreateSearch(type || null, filters || null, columns || null);
		var continueSearching = true,
			start = 0,
			end = 1000;
		columns = search.getColumns();
		do {
			var results = search.runSearch().getResults(start, end) || [];
			for (var i = 0, count = results.length; i < count; i++) {
				if (this.data.length === limit) {
					continueSearching = false;
					break;
				}
				if (returnRaw) {
					this.data.push(results[i]);
				} else {
					var temp = {};
					for (var c = 0, countc = columns.length; c < countc; c++) {
						var join = columns[c].getJoin(),
							name = columns[c].getName();
						if (name.indexOf('formula') > -1) name = this.formulaIterator(name);
						var tempValue = results[i].getValue(columns[c]),
							tempText = results[i].getText(columns[c]) || undefined;
						if (join) {
							if (temp[join]) {
								temp[join][name] = {
									value: tempValue,
									text: tempText
								};
							} else {
								temp[join] = {};
								temp[join][name] = {
									value: tempValue,
									text: tempText
								};
							}
						} else {
							if (temp[name]) {
								temp[name].value = tempValue;
								temp[name].text = tempValue;
							} else {
								temp[name] = {
									value: tempValue,
									text: tempText
								};
							}
						}
					}
					this.data.push(temp);
				}
			}
			if (results.length === 1000) {
				start += 1000;
				end += 1000;
			} else {
				continueSearching = false;
			}
		} while (continueSearching);
	},
	formulaIterator: function(name) {
		if (this.formulaCount[name]) {
			this.formulaCount[name]++;
			name = name + this.formulaCount[name];
		} else {
			this.formulaCount[name] = 0;
		}
		return name;
	},
	stringifyFiltersColumns: function(input) {
		var response = [];
		if (!input) return null;
		for (var i = 0, count = input.length; i < count; i++) {
			if (input[i] instanceof nlobjSearchColumn) {
				response.push({
					name: input[i].getName(),
					join: input[i].getJoin() || undefined,
					summary: input[i].getSummary() || undefined,
					sort: input[i].getSort() || undefined,
					formula: input[i].getFormula() || undefined,
					'function': input[i].getFunction() || undefined,
					label: input[i].getLabel() || undefined
				});
			}
			if (input[i] instanceof nlobjSearchFilter) {
				response.push({
					name: input[i].getName() || undefined,
					join: input[i].getJoin() || undefined,
					operator: input[i].getOperator() || undefined,
					value: input[i].values || undefined,
					formula: input[i].getFormula() || undefined,
					summary: input[i].getSummaryType() || undefined
				});
			}
		}
		return response;
	}
};

var misc = {
	index: function(a, v, k) {
		if (!k) throw nlapiCreateError('Use .indexOf()', 'Use .indexOf() to find the index instead of this function.', true);
		for (var i = 0, count = a.length; i < count; i++) {
			if (typeof k == 'object') {
				var found = true;
				for (var key in k) {
					if (a[i][k[key]] != v[key]) found = false;
				}
				if (found) return i;
			} else {
				if (a[i][k] == v) return i;
			}
		}
		return null;
	}
};

var arrayToCSV = {
	columns: [],
	columnRow: '',
	bodyRows: '',
	build: function(array, folder, name, returnText, handlers) {
		if (handlers) this.handlers = handlers;
		for (var i = 0, count = array.length; i < count; i++) {
			this.addColumns(array[i]);
			var tempRow = this.buildRow(array[i]);
			this.bodyRows += tempRow;
			if (i + 1 < count) this.bodyRows += '\n';
		}
		for (var ii = 0, countii = this.columns.length; ii < countii; ii++) {
			this.columnRow += '"' + this.columns[ii].replace(/\"/g, '""').toUpperCase() + '"';
			if (ii + 1 < countii) {
				this.columnRow += ','
			} else {
				this.columnRow += '\n';
			}
		}
		var fileContent = this.columnRow + this.bodyRows;
		if (returnText) {
			return fileContent;
		} else {
			var file = nlapiCreateFile(name, 'CSV', fileContent);
			if (folder) {
				file.setFolder(folder);
				file = nlapiSubmitFile(file);
			} else {
				return file;
			}
		}
	},
	addColumns: function(object) {
		for (var key in object) {
			if (this.columns.indexOf(key) === -1) {
				this.columns.push(key);
			}
		}
	},
	buildRow: function(object) {
		var row = '';
		for (var i = 0, count = this.columns.length; i < count; i++) {
			var tempValue = object[this.columns[i]] || '';
			if (this.handlers) {
				if (this.handlers[this.columns[i]]) tempValue = handlers[this.columns[i]](tempValue);
			}
			if (typeof tempValue != 'string') tempValue = tempValue.toString();
			row += '"' + tempValue.replace(/\"/g, '""') + '"';
			if (i + 1 < count) row += ',';
		}
		return row;
	}
};

var arrayToHTML = {
	columns: [],
	columnRow: '',
	bodyRows: '',
	build: function(array, folder, name, returnText, handlers) {
		if (handlers) this.handlers = handlers;
		for (var i = 0, count = array.length; i < count; i++) {
			this.addColumns(array[i]);
			this.bodyRows += this.buildRow(array[i]);
		}
		this.columnRow += '<thead><tr>'
		for (var ii = 0, countii = this.columns.length; ii < countii; ii++) {
			this.columnRow += '<td><b>' + this.columns[ii].toUpperCase() + '</b></td>';
		}
		this.columnRow += '</tr></thead>'
		var fileContent = '<table>' + this.columnRow + this.bodyRows + '</table>';
		if (returnText) {
			return fileContent;
		} else {
			var file = nlapiCreateFile(name, 'HTML', fileContent);
			if (folder) {
				file.setFolder(folder);
				file = nlapiSubmitFile(file);
			} else {
				return file;
			}
		}
	},
	addColumns: function(object) {
		for (var key in object) {
			if (this.columns.indexOf(key) === -1) {
				this.columns.push(key);
			}
		}
	},
	buildRow: function(object) {
		var row = '<tr>';
		for (var i = 0, count = this.columns.length; i < count; i++) {
			var tempValue = object[this.columns[i]] || '';
			if (this.handlers) {
				if (this.handlers[this.columns[i]]) tempValue = handlers[this.columns[i]](tempValue);
			}
			if (typeof tempValue == 'object') tempValue = JSON.stringify(tempValue);
			row += '<td>' + tempValue + '</td>';
		}
		row += '</tr>';
		return row;
	}
};

var buildServiceRequest = {
	execute:function(data, sendEmail, webRequest) {

		/* data-Keys 
			custrecord_servicerequest_customer
			custrecord_servicerequest_ponumber
			custrecord_servicerequest_comments
			custrecord_servicerequest_address1
			custrecord_servicerequest_address2
			custrecord_servicerequest_city
			custrecord_servicerequest_state
			custrecord_servicerequest_zip
			serviceWork [{
				serial
				custrecord_service_work_equipment
				onsite
				custrecord_service_work_repair
				custrecord_service_work_symptoms
			}]

			*/

		/* Cleanse Serial Numbers of special characters */
			for (var i = 0, count = data.serviceWork.length ; i < count ; i++) {
				data.serviceWork[i].serial = removeSpecialCharacters(data.serviceWork[i].serial);
			}

		/* Create Service Request */
			var record = nlapiCreateRecord('customrecord_servicerequest');
				for (var field in data) {
					if (typeof data[field] == 'object') continue;
					record.setFieldValue(field, data[field]);
				}
				record.setFieldValue('custrecord_servicerequest_websubmit', webRequest ? 'T' : 'F');
				record.setFieldValue('custrecord_servicerequest_sendemail', sendEmail ? 'T' : 'F');
			record = nlapiSubmitRecord(record, true, true);
			log('Create Service Request', {
				serviceRequestId:record
			});

		this._upsertServiceWork(
			data.custrecord_servicerequest_customer,
			record,
			data.serviceWork
		);

		return record;
	},
	_upsertServiceWork:function(customer, serviceRequest, data) {

		var start = new Date().getTime();

		/* Get Equipment Internal IDs or
			create new Equipment records */
			data = this._upsertEquipment(customer, serviceRequest, data);
			log('Service Work Data', data);

		/* Create Service Work Records */
			var ids = [], specialFields = ['name', 'onsite'];
			for (var i = 0, count = data.length ; i < count ; i++) {
				var record = nlapiCreateRecord('customrecord_servicework');
				log('record initialized');
				record.setFieldValue('custrecord_service_work_customer', customer)
				record.setFieldValue('custrecord_service_work_request', serviceRequest);
				record.setFieldValue('name', data[i].serial + ' ' + serviceRequest);
				if (data[i].onsite != 'T' || data[i].onsite != true) {
					record.setFieldValue('custrecord_service_work_status', 29);
				} else {
					record.setFieldValue('custrecord_service_work_status', 31);
				}
				record.setFieldValue('custrecord_service_work_equipment', data[i].custrecord_service_work_equipment);
				record.setFieldValue('custrecord_service_work_repair', data[i].custrecord_service_work_repair);
				record.setFieldValue('custrecord_service_work_symptoms', data[i].custrecord_service_work_symptoms);
				record = nlapiSubmitRecord(record, true, true);
				ids.push(record);
			}

		log('Create Service Work', {
			elapsedSeconds:((new Date().getTime()-start)/1000).toFixed(2),
			ids:ids
		});
	},
	_upsertEquipment:function(customer, serviceRequest, data) {
		var equipment = [], equipmentLookup = [], start = new Date().getTime();

		/* Add new Service Work lines' equipment to an array
			for a search-lookup */
			for (var e = 0, counte = data.length ; e < counte ; e++) {
				if (!data[e].custrecord_service_work_equipment) equipment.push(data[e].serial);
			}

		/* Perform a lookup of the unknown equipment
			and add it to an array */
			var filter = [
				['isinactive', 'is', 'F'],
				'AND',
				['custrecord_equipment_customer', 'is', customer],
				'AND',
				[]
			];
			for (var f = 0, countf = equipment.length ; f < countf ; f++) {
				filter[4].push(['name', 'is', equipment[f]]);
				if (f+1 < countf) filter[4].push('OR');
			}
			var results = nlapiSearchRecord('customrecord_equipment', null, filter, [new nlobjSearchColumn('name')]) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				equipmentLookup.push({
					name:results[i].getValue('name'),
					id:results[i].getId()
				});
			}

		/* Add the Equipment Internal ID of each 
			Service Work line to the original data
			*/
			var upsertInfo = {'created':[], 'found':[]};
			for (var ee = 0, countee = data.length ; ee < countee ; ee++) {
				if (!data[ee].custrecord_service_work_equipment) {
					var index = misc.index(equipmentLookup, data[ee].serial, 'name');
					if (index !== null) {
						data[ee].custrecord_service_work_equipment = equipmentLookup[index].id;
						upsertInfo.found.push(equipmentLookup[index].id);
					} else {
						var serialNumber = data[ee].serial;
						var record = nlapiCreateRecord('customrecord_equipment');
							record.setFieldValue('custrecord_equipment_customer', customer);
							record.setFieldValue('externalid', nlapiGetFieldValue('custrecord_servicerequest_customer')+'-'+serialNumber);
							record.setFieldValue('name', data[ee].serial);
							record.setFieldValue('custrecord_equipment_description', data[ee].description);
							record.setFieldValue('custrecord_equipment_mfg', data[ee].manufacturer);
							record.setFieldValue('custrecord_service_work_createdby', serviceRequest);
							record.setFieldValue('custrecord_equipment_websubmission', 'T');
						record = nlapiSubmitRecord(record, true, true);
						data[ee].custrecord_service_work_equipment = record;
						upsertInfo.found.push(record);
					}
				}
			}

		log('Upsert Equipment', {
			elapsedSeconds:((new Date().getTime()-start)/1000).toFixed(2),
			created:upsertInfo.created,
			found:upsertInfo.found
		});

		return data;
	}
};

var distance = {
	mapQuestKey:'Fmjtd%7Cluurn10bnu%2C2n%3Do5-9wyg10',
	companyLatitude:27.937728, // Tampa Location
	companyLongitude:-82.259524, // Tampa Location
	customerAddress:{
		street:null,
		city:null,
		state:null,
		zip:null
	},
	callback:undefined,
	enabled:false,
	calculate:function(manual) {

		this.enabled();

		if (!this.enabled && !manual) {
			console.error('User does not have HTML Geolocation enabled, need to use manual address input');
			return;
		}

		if (manual) {
			this.processManualAddress();
		} else {
			this.processDynamicAddress();
		}
	},
	enabled:function() {
		
		if (!this.enabled && navigator.geolocation) this.enabled = true;
	},
	processManualAddress:function() {

		/* Validate manual address-elements are populated */
			var missingElements = [], nonMandatoryElements = ['address2'];
			for (var key in this.customerAddress) {
				if (!this.customerAddress[key] && nonMandatoryElements.indexOf(key) === -1) missingElements.push(key);
			}
			if (missingElements.length > 0) {
				console.error('Missing mandatory elements', missingElements);
				return;
			}

		/* Get Latitude/Longitude */
			var url = 'https://www.mapquestapi.com/geocoding/v1/address?key='+this.mapQuestKey+'&inFormat=json&json='+escape(JSON.stringify({location:this.customerAddress}));
			var request = jQuery.ajax({
				method:'GET',
				url:url
			});
			request.done(function(data) {
				if (data.results.length > 0) {
					if (data.results[0].locations.length > 0) {
						distance._returnDistance(
							data.results[0].locations[0].latLng.lat,
							data.results[0].locations[0].latLng.lng,
							'MapQuest'
						);
					} else {
						console.error('Invalid Response from MapQuest', data.info.messages, data);
					}
				} else {
					console.error('Invalid Response from MapQuest', data.info.messages, data);
				}
			});
			request.fail(function(jqXHR, status) {
				console.log('request.fail', jqXHR, status);
			});
	},
	processDynamicAddress:function() {
		navigator.geolocation.getCurrentPosition(function(position) {
			distance._returnDistance(
				position.coords.latitude,
				position.coords.longitude,
				'HTML5'
			);
		});
	},
	_returnDistance:function(latitude, longitude, source) {

		var R = 3959;
		var dLat = this._degreeToRadius(latitude - this.companyLatitude);
		var dLon = this._degreeToRadius(longitude - this.companyLongitude);
		var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(this._degreeToRadius(this.companyLatitude)) * Math.cos(this._degreeToRadius(latitude)) * Math.sin(dLon/2) * Math.sin(dLon/2);
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		var d = parseFloat((R * c).toFixed(2));

		console.log('Distance', {
			source:source,
			distance:d,
			companyLatitude:this.companyLatitude,
			companyLongitude:this.companyLongitude,
			latitude:latitude,
			longitude:longitude
		});
		
		this.miles = d;

		if (this.callback) {
			this.callback(d);
		}
	},
	_degreeToRadius:function(input) {

		return parseFloat(input * (Math.PI/180));
	}
};

function yield(minimumPoints) {
	if (parseInt(nlapiGetContext().getRemainingUsage(), 10) < (minimumPoints || 100)) {
		log('Yielding Script', {
			remainingPoints: parseInt(nlapiGetContext().getRemainingUsage(), 10),
			minimumPoints: (minimumPoints || 100)
		}, 'AUDIT');
		var yieldResponse = nlapiYieldScript();
		log('Yield Response', yieldResponse, 'AUDIT');
	}
}

function getParameters(request) {
	var parameters = {};
	if (request) {
		var params = request.getAllParameters();
		var param_ignore = ['callback', 'compid', 'h', '_'];
		for (var param in params) {
			if (param_ignore.indexOf('param') !== 0) parameters[param] = params[param];
		}
	} else {
		var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi,
		function(m, key, value) {
			parameters[key] = value;
		});
	}
	return parameters;
}

function getTabs(form, index, sessionObject) {
	var allTabs = form.getTabs();
	var customTabs = [];
	for (var i = 0, count = allTabs.length ; i < count ; i++) {
		if (allTabs[i].indexOf('custom') === 0) customTabs.push(allTabs[i]);
	}
	nlapiGetContext().setSessionObject(sessionObject, customTabs[index]);
	return customTabs[index];
}

function getCustomRecordId(recordId, sessionObject) {
	var filter = [];
		filter.push(new nlobjSearchFilter('scriptid', null, 'is', recordId));
	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null));
	var results = nlapiSearchRecord('customrecordtype', null, filter, column) || [];
	nlapiGetContext().setSessionObject(sessionObject, results[0].getValue('internalid'));
	return results.length > 0 ? results[0].getValue('internalid') : null;
}

function businessDays(numberOfDays) {
	var newDate = nlapiAddDays(new Date(), numberOfDays || 1);
	var newDay = newDate.getDay(); // Sunday 0, Saturday 6
	if (newDay === 0) newDate = nlapiAddDays(newDate, 1);
	if (newDay === 5) newDate = nlapiAddDays(newDate, 3);
	if (newDay === 6) newDate = nlapiAddDays(newDate, 2);
	return nlapiDateToString(newDate);
}

function removeSpecialCharacters(input) {
	var output = input.replace(/[^a-zA-Z0-9]/g, '');
	log('Remove Special Characters', {
		input:input,
		output:output
	});
	return output;
}

var addressLibrary = {
	fieldId:'custpage_addressselect',
	build:function(type, form, request, field, customer, shipping, billing) {
		if (type == 'create' || type == 'edit') {
			if (form) {
				var fieldObj = form.addField(this.fieldId, 'select', 'Select Address');
				if (field) form.insertField(fieldObj, field);
				this.appendAddresses(customer, null, shipping, billing, fieldObj);
			}
		}
	},
	appendAddresses:function(customer, id, shipping, billing, fieldObj) {
		if (!customer && !fieldObj) {
			nlapiRemoveSelectOption('custpage_addressselect', null);
			return;
		}
		
		if (!fieldObj) nlapiRemoveSelectOption('custpage_addressselect', null);

		var addresses = this.getAddresses(customer, null, shipping, billing);
		var defaultExists = misc.index(addresses, true, 'default');
		for (var i = 0, count = addresses.length ; i < count ; i++) {
			if (!fieldObj) {
				if (i === 0) {
					nlapiInsertSelectOption('custpage_addressselect', '', '', defaultExists === null ? true : false);
					nlapiInsertSelectOption('custpage_addressselect', 'custom', '- Custom -', false);
				}
				nlapiInsertSelectOption('custpage_addressselect', addresses[i].id, addresses[i].label, addresses[i].default);
			} else {
				if (i === 0) {
					fieldObj.addSelectOption('', '', defaultExists === null ? true : false);
					fieldObj.addSelectOption('custom', '- Custom - ', false);
				}
				fieldObj.addSelectOption(addresses[i].id, addresses[i].label, addresses[i].default);
			}
		}
	},
	getAddresses:function(customer, id, shipping, billing, addressElements) {
		var data = [];

		if (!customer) return data;

		var filter = [];
			filter.push(new nlobjSearchFilter('internalid', null, 'is', customer));
			if (id) filter.push(new nlobjSearchFilter('formulatext', null, 'is', id).setFormula('{addressinternalid}'));
			if (addressElements) {
				for (field in addressElements) {
					filter.push(new nlobjSearchFilter(field, null, 'is', addressElements[field]));
				}
			}
		var column = [];
			column.push(new nlobjSearchColumn('addressinternalid'));
			column.push(new nlobjSearchColumn('addresslabel'));
			column.push(new nlobjSearchColumn('address1'));
			column.push(new nlobjSearchColumn('address2'));
			column.push(new nlobjSearchColumn('city'));
			column.push(new nlobjSearchColumn('state'));
			column.push(new nlobjSearchColumn('zipcode'));
			column.push(new nlobjSearchColumn('isdefaultshipping').setSort(shipping || false));
			column.push(new nlobjSearchColumn('isdefaultbilling').setSort(billing || false));
		var results = nlapiSearchRecord('customer', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				id:results[i].getValue('addressinternalid'),
				label:results[i].getValue('addresslabel'),
				address1:results[i].getValue('address1'),
				address2:results[i].getValue('address2'),
				city:results[i].getValue('city'),
				state:results[i].getValue('state'),
				zip:results[i].getValue('zipcode'),
				default:shipping || billing ? (results[i].getValue('isdefaultshipping') == 'T' || results[i].getValue('isdefaultbilling') == 'T') : false
			});
		}

		return data;
	},
	disable:function(disable, map, ignoreFields) {
		if (!ignoreFields) ignoreFields = [];
		if (typeof ignoreFields == 'string') ignoreFields = [ignoreFields];
		for (var field in map) {
			if (ignoreFields.indexOf(field) === -1) nlapiDisableField(field, disable);
		}
	},
	addAddress:function(customer, address) {
		var record = nlapiLoadRecord('customer', customer);
			record.selectNewLineItem('addressbook');
				record.setCurrentLineItemValue('addressbook', 'defaultshipping', 'F');
				record.setCurrentLineItemValue('addressbook', 'defaultbilling', 'F');
				record.setCurrentLineItemValue('addressbook', 'label', address.address1);
				record.setCurrentLineItemValue('addressbook', 'isresidential', 'F');
				var subrecord = record.createCurrentLineItemSubrecord('addressbook', 'addressbookaddress');
					subrecord.setFieldValue('country', address.country);
					subrecord.setFieldValue('attention', address.attention);
					subrecord.setFieldValue('addressee', address.addressee);
					subrecord.setFieldValue('addrphone', address.addrphone);
					subrecord.setFieldValue('addr1', address.address1);
					subrecord.setFieldValue('addr2', address.address2);
					subrecord.setFieldValue('city', address.city);
					subrecord.setFieldValue('dropdownstate', address.state);
					subrecord.setFieldValue('zip', address.zip);
				subrecord.commit();
			record.commitLineItem('addressbook');
		nlapiSubmitRecord(record, true, true);
		var addressId = this.getAddresses(customer, null, null, null, {
			addresslabel:address.address1,
			zipcode:address.zip
		})[0].id;
		log('Customer Address Added', {
			addressId:addressId
		});
		return addressId;
	}
}