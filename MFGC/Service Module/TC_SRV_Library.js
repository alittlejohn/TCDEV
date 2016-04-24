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
			console.log('tempValue', tempValue, typeof tempValue);
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
			log('tempValue, typeof: ' + typeof tempValue, tempValue);
			row += '<td>' + tempValue + '</td>';
		}
		row += '</tr>';
		return row;
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