/* Logging function */
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

/* Yielding function */
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

var tsheet = {
	closedStatuses:{
		project:['20', '19'], // Rejected, Project Complete
		projectTask:['COMPLETE'],
		case:['5']
	},
	execute:function(method, parameters, data) {

		this._defineContext();

		if (this[method]) {
			this[method](parameters || data);
		} else {
			throw nlapiCreateError(
				'Invalid TSheet Method',
				'The method specified, "' + method + '", does not exist.',
				false
			);
		}

		return {
			error:this.error,
			code:this.code,
			body:this.body
		};
	},
	createJobCode:function(data) {

		/* Definition
			https://developers.tsheets.com/docs/api/jobcodes/jobcode-object
			https://developers.tsheets.com/docs/api/jobcodes/add-jobcodes

			var example = {
				parent_id: integer, 0 if it should be top-level
				name: string, must be unique per parent jobcode
				short_code: alphanumeric
				type: string, 'regular'
				billable: boolean, false
				billable_rate: float, 0.00
				assigned_to_all: boolean, true
			}
			*/

		this.endpoint = 'jobcodes', this.httpMethod = 'POST', this.postData = data;

		this._sendRequest();

		this._writeExecution();
	},
	updateJobCode:function(data) {

		/* Definition
			https://developers.tsheets.com/docs/api/jobcodes/jobcode-object
			https://developers.tsheets.com/docs/api/jobcodes/edit-jobcodes

			var example = {
				id: integer,
				name: string,
				active: boolean
			}
			*/

		this.endpoint = 'jobcodes', this.httpMethod = 'PUT', this.postData = data;

		this._sendRequest();

		this._writeExecution();
	},
	assignJobCode:function(data) {

		/* Definition
			https://developers.tsheets.com/docs/api/jobcode_assignments/jobcode-assignment-object
			https://developers.tsheets.com/docs/api/jobcode_assignments/add-jobcode-assignments

			var example = {
				user_id: integer,
				jobcode_id: integer
			}
			*/

		this.endpoint = 'jobcode_assignments', this.httpMethod = 'POST', this.postData = data;

		this._sendRequest();

		this._writeExecution();

	},
	getTime:function(parameters) {

		/* Definition
			https://developers.tsheets.com/docs/api/timesheets/timesheet-object
			https://developers.tsheets.com/docs/api/timesheets/list-timesheets
			*/

		this.endpoint = 'timesheets', this.httpMethod = 'GET';
		
		this._stringifyParameters(parameters);

		this._sendRequest();

		this._writeExecution();
	},
	_stringifyParameters:function(parameters) {
		if (!parameters) return;
		for (var parameter in parameters) {
			this.parameters += !this.parameters ? '?' : '&';
			this.parameters += parameter + '=' + parameters[parameter];
		}
	},
	_sendRequest:function() {
		try {
			this.response = nlapiRequestURL(
				this.url + this.endpoint + this.parameters,
				this.postData ? JSON.stringify(this.postData) : null,
				this.headers,
				this.httpMethod
			);
			this.code = this.response.getCode();
			this.body = this.response.getBody();
		} catch(e) {
			if (e instanceof nlobjError) {
				this.error = {
					type:'NetSuite',
					code:e.getCode(),
					details:e.getDetails(),
					stack:e.getStackTrace()
				};
			} else {
				this.error = {
					type:'JavaScript',
					details:e.toString()
				};
			}
			log('Error', this.error, 'ERROR');
		}
		this.responseReceived = new Date();
	},
	_writeExecution:function() {
		var record = nlapiCreateRecord('customrecord_httprequestlog');
			record.setFieldValue('custrecord_httprequestlog_url', this.url || '');
			record.setFieldValue('custrecord_httprequestlog_endpoint', this.endpoint || '');
			record.setFieldValue('custrecord_httprequestlog_httpmethod', this.httpMethod || '');
			record.setFieldValue('custrecord_httprequestlog_parameters', this.parameters || '');
			record.setFieldValue('custrecord_httprequestlog_postdata', this.postData ? typeof this.postData == 'object' ? JSON.stringify(this.postData) : this.postData : '');
			record.setFieldValue('custrecord_httprequestlog_response', this.body ? this._writeResponseFile() : '');
			record.setFieldValue('custrecord_httprequestlog_responsecode', this.code);
			record.setFieldValue('custrecord_httprequestlog_error', this.error ? 'T' : 'F');
			record.setFieldValue('custrecord_httprequestlog_errordetails', this.error ? JSON.stringify(this.error) : '');
			record.setFieldValue('custrecord_httprequestlog_context', JSON.stringify(this.executionContext));
		this.httpRequestLog = nlapiSubmitRecord(record, true, true);

		log('URL: ' + this.url + ', Endpoint: ' + this.endpoint, {
			requestElapsedSeconds:((this.responseReceived.getTime()-this.start.getTime())/1000).toFixed(2),
			totalElapsedSeconds:((new Date().getTime()-this.start.getTime())/1000).toFixed(2),
			httpMethod:this.httpMethod,
			parameters:this.parameters,
			code:this.code,
			error:this.error,
			logId:this.httpRequestLog,
			logFileId:this.httpResponseFile
		});
	},
	_writeResponseFile:function() {
		var file = nlapiCreateFile(
			this.start.getTime() + '-' + this.endpoint + '.txt',
			'PLAINTEXT',
			this.body
		);
		file.setFolder(this.folder);
		this.httpResponseFile = nlapiSubmitFile(file);
		file = null;
		return this.httpResponseFile;
	},
	_defineContext:function() {

		var context = nlapiGetContext();

		this.start = new Date(),
		this.responseReceived = undefined,
		this.folder = context.getSetting('SCRIPT', 'custscript_tsheet_responsefolder'),
		this.url = context.getSetting('SCRIPT', 'custscript_tsheet_url'),
		this.headers = {
			'Authorization':'Bearer ' + context.getSetting('SCRIPT', 'custscript_tsheet_clienttoken'),
			'Content-Type':'application/json'
		},
		this.endpoint = undefined,
		this.httpMethod = undefined,
		this.parameters = '',
		this.postData = null,
		this.response = undefined,
		this.code = undefined,
		this.body = undefined,
		this.error = undefined,
		this.httpRequestLog = undefined,
		this.httpResponseFile = undefined,
		this.executionContext = {
			scriptId:context.getScriptId() || undefined,
			deploymentId:context.getDeploymentId() || undefined,
			executionContext:context.getExecutionContext() || undefined,
			user:nlapiGetUser() || undefined,
			recordType:nlapiGetRecordType() || undefined,
			recordId:nlapiGetRecordId() || undefined
		};
	},
	_fixedWidth:function(id, prefix, length) {
		id = id.toString();
		if (!length) length = 8;
		if (id.length === length) return prefix + id;
		do {
			id = '0' + id;
		} while (id.length < length);
		return prefix + id;
	},
	_parseShortCode:function(value) {
		if (!value) return null;
		return {
			type: value.indexOf('P') > -1 ? 'job' : value.indexOf('T') > -1 ? 'projecttask' : value.indexOf('C') > -1 ? 'supportcase' : null,
			id: parseInt(value.replace(/[^0-9]/g, ''), 10)
		};
	}
};