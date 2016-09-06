var getTime = {
	start:new Date(),
	defaultStart:new Date(2016, 0, 1, 0, 0, 0),
	timeRequestToReprocess:nlapiGetContext().getSetting('SCRIPT', 'custscript_tsheet_timerequest'),
	execute:function(type) {
		
		log('Start Scheduled Script', {
			type:type,
			timeRequestToReprocess:this.timeRequestToReprocess || undefined
		});

		/* Get Start and End Times */
			var startTime = this.getStartTime();
			var endTime = this.getEndTime();

		/* Build a new Time Request if necessary
			or reprocess a request. If a request
			has already been generated for the 
			current period then skip the creation
			of a new request 
			*/
			var timeRequest;
			if (this.timeRequestToReprocess) {
				timeRequest = this.timeRequestToReprocess;
				startTime = this.getStartTime(this.timeRequestToReprocess);
				endTime = this.getEndTime(this.timeRequestToReprocess)
				log('Time Request to be reprocessed', {
					id:this.timeRequestToReprocess,
					startTime:startTime,
					endTime:endTime
				});
			} else {
				if (startTime.getDate() == endTime.getDate() && startTime.getHours() == endTime.getHours()) {
					startTime = this.getStartTime(timeRequest);
					log('Time Request Found', {
						message:'Do not requery TSheets',
						id:timeRequest,
						startTime:startTime,
						endTime:endTime
					});
				} else {
					timeRequest = this.createTimeRequest(startTime, endTime);
					log('Time Request Created', {
						id:timeRequest,
						startTime:startTime,
						endTime:endTime
					});
				}
			}

		/* Get Timesheets from TSheets */
			if (timeRequest) {
				this.getTime(
					startTime.toISOString().split('.')[0]+'%2B00:00',
					endTime.toISOString().split('.')[0]+'%2B00:00',
					timeRequest
				);
			}

		/* Turn TSheet Time Entries into NetSuite
			Time Entries */
			var data = this.getUnprocessedEntries();
			log('Unprocessed TSheet Entries', {
				'data.length':data.length,
				example:data.length > 0 ? data[0] : undefined
			});
			if (data.length > 0) {
				this.employees = this.getEmployees();
				this.processEntries(data);
			}

		log('End Scheduled Script', {
			elapsedSeconds:((new Date().getTime()-this.start.getTime())/1000).toFixed(2)
		});
	},
	getStartTime:function(id) {
		var lastEnd;
		if (!id) {
			var filter = [];
				if (id) filter.push(new nlobjSearchFilter('internalidnumber', null, 'equalto', id));
				filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			var column = [];
				column.push(new nlobjSearchColumn('custrecord_tsheettimerequest_end').setSort(true));
			var results = nlapiSearchRecord('customrecord_tsheettimerequest', null, filter, column) || [];
			if (results) {
				lastEnd = new Date(results[0].getValue('custrecord_tsheettimerequest_end'));
			} else {
				lastEnd = this.defaultStart;
			}
		} else {
			lastEnd = new Date(nlapiLookupField('customrecord_tsheettimerequest', id, 'custrecord_tsheettimerequest_start'));
		}
		return new Date(lastEnd.getFullYear(), lastEnd.getMonth(), lastEnd.getDate(), lastEnd.getHours(), lastEnd.getMinutes(), 59);
	},
	getEndTime:function(id) {
		var newEnd;
		if (!id) {
			var today = new Date();
			newEnd = nlapiAddDays(today, -1);
		} else {
			newEnd = new Date(nlapiLookupField('customrecord_tsheettimerequest', id, 'custrecord_tsheettimerequest_end'));
		}
		return new Date(newEnd.getFullYear(), newEnd.getMonth(), newEnd.getDate(), 23, 59, 59);
	},
	createTimeRequest:function(start, end) {
		var record = nlapiCreateRecord('customrecord_tsheettimerequest');
			record.setFieldValue('custrecord_tsheettimerequest_start', nlapiDateToString(start, 'datetimetz'));
			record.setFieldValue('custrecord_tsheettimerequest_end', nlapiDateToString(end, 'datetimetz'));
		return nlapiSubmitRecord(record, true, true);
	},
	getTime:function(startISO, endISO, timeRequest) {

		var parameters = {
			modified_since:startISO,
			modified_before:endISO,
			// on_the_clock:"no",
			page:"1"
		};

		do {

			var response = tsheet.execute(
				'getTime',
				parameters,
				null
			);

			if (response.body) response.body = JSON.parse(response.body);
			log('** Page: ' + parameters.page, 'Start **');

			yield();

			if (!response.body.results) return;

			if (!response.body.results.timesheets) return;

			for (var timesheet in response.body.results.timesheets) {
				var temp = response.body.results.timesheets[timesheet];
				var record = this._processResult(temp, timeRequest, response.body.supplemental_data);
				log('Processed Result', {
					tsheetId:temp.id,
					error:record.details ? true : false,
					id:record.details ? undefined : record,
					error:record.details ? record : undefined
				}, record.details ? record.code == 'DUP_CSTM_RCRD_ENTRY' ? 'AUDIT' : 'ERROR' : 'DEBUG');

				yield();
			}

			log('** Page: ' + parameters.page, 'End **');

			if (response.body.more) {
				parameters.page = (parseInt(parameters.page, 10) + 1).toString();
			} else {
				parameters.page = "0";
			}

		} while(parseInt(parameters.page, 10) > 0);
	},
	_processResult:function(data, timeRequest, supplementalData) {
		try {
			var record = nlapiCreateRecord('customrecord_tsheettimeentry');
				record.setFieldValue('externalid', timeRequest + '-' + data.id);
				record.setFieldValue('custrecord_tsheettimeentry_id', data.id);
				record.setFieldValue('custrecord_tsheettimeentry_jobcodeshort', this._jobcodeShortcode(data.jobcode_id, supplementalData));
				record.setFieldValue('custrecord_tsheettimeentry_email', this._userEmail(data.user_id, supplementalData));
				record.setFieldValue('custrecord_tsheettimeentry_userid', data.user_id);
				record.setFieldValue('custrecord_tsheettimeentry_data', JSON.stringify(data));
				record.setFieldValue('custrecord_tsheettimeentry_request', timeRequest);
			return nlapiSubmitRecord(record, true, true);
		} catch(e) {
			var error = {};
			if (e instanceof nlobjError) {
				error.type = 'NetSuite', error.code = e.getCode(), error.details = e.getDetails();
			} else {
				error.type = 'JavaScript', error.details = e.toString();
			}
			return error;
		}
	},
	_jobcodeShortcode:function(jobcodeId, data) {
		if (!jobcodeId || !data) return '';
		if (!data.jobcodes) return '';
		return data.jobcodes[jobcodeId].short_code || '';
	},
	_userEmail:function(userId, data) {
		if (!userId || !data) return '';
		if (!data.users) return '';
		return data.users[userId].email || '';
	},
	getUnprocessedEntries:function() {
		var data = [], lastIndex;

		do {

			var filter = [];
				if (lastIndex) filter.push(new nlobjSearchFilter('internalidnumber', null, 'lessthan', lastIndex));
				filter.push(new nlobjSearchFilter('custrecord_tsheettimeentry_error', null, 'isempty', null));
				filter.push(new nlobjSearchFilter('custrecord_tsheettimeentry_timeentry', null, 'anyof', ['@NONE@']));
				filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));

			var column = [];
				column.push(new nlobjSearchColumn('internalid').setSort(true));
				column.push(new nlobjSearchColumn('custrecord_tsheettimeentry_data'));
				column.push(new nlobjSearchColumn('custrecord_tsheettimeentry_jobcodeshort'));
				column.push(new nlobjSearchColumn('custrecord_tsheettimeentry_email'));
				column.push(new nlobjSearchColumn('custrecord_tsheettimeentry_userid'));

			var results = nlapiSearchRecord('customrecord_tsheettimeentry', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.push({
					id:results[i].getId(),
					userId:results[i].getValue('custrecord_tsheettimeentry_userid'),
					userEmail:results[i].getValue('custrecord_tsheettimeentry_email'),
					shortJobCode:results[i].getValue('custrecord_tsheettimeentry_jobcodeshort'),
					details:JSON.parse(results[i].getValue('custrecord_tsheettimeentry_data'))
				});
			}

			if (results.length === 1000) {
				lastIndex = results[999].getId();
			} else {
				lastIndex = 0;
			}

			yield();

		} while (lastIndex > 0);

		return data;
	},
	getEmployees:function() {
		var data = {emails:{}}, lastIndex = 0;

		do {

			var filter = [];
				filter.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', lastIndex));
				filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));

			var column = [];
				column.push(new nlobjSearchColumn('custentity_tsheetid'));
				column.push(new nlobjSearchColumn('email'));

			var results = nlapiSearchRecord('employee', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				var email = results[i].getValue('email'), tsheetId = results[i].getValue('custentity_tsheetid');
				if (tsheetId) {
					data[tsheetId] = results[i].getId();
				}
				if (email) {
					data.emails[email] = results[i].getId();
				}
			}

			if (results.length === 1000) {
				lastIndex = results[999].getId();
			} else {
				lastIndex = 0;
			}

			yield();

		} while(lastIndex > 0);

		return data;
	},
	processEntries:function(data) {

		log('-- Process Entries', 'Start --');

		for (var i = 0, count = data.length ; i < count ; i++) {
			var error, recordId;
			
			try {

				/* Parse Shortcode */
					var netSuiteIds = tsheet._parseShortCode(data[i].shortJobCode);
					if (!netSuiteIds) throw nlapiCreateError('Jobcode shortcode', 'Missing a shortcode for the Jobcode', true);
				
				/* Create Record */
					record = nlapiCreateRecord('timebill');
						record.setFieldValue('employee', this._employee(data[i].userId, data[i].userEmail));
						record.setFieldValue('trandate', this._trandate(data[i].details.date));
						record.setFieldValue('hours', this._hours(data[i].details.duration));
						record.setFieldValue('customer', this._customer(netSuiteIds.type, netSuiteIds.id));
						record.setFieldValue('casetaskevent', this._casetaskevent(netSuiteIds.type, netSuiteIds.id));
						record.setFieldValue('memo', data[i].notes || '');
					recordId = nlapiSubmitRecord(record, true, true);

			} catch(e) {
				error = {};
				if (e instanceof nlobjError) {
					error.type = 'NetSuite', error.code = e.getCode(), error.details = e.getDetails(), error.stack = e.getStackTrace();
				} else {
					error.type = 'JavaScript', error.details = e.toString();
				}
			}

			/* Update TSheet Time Entry */
				var fields, values;
				if (recordId) {
					fields = ['custrecord_tsheettimeentry_timeentry', 'custrecord_tsheettimeentry_error'];
					values = [record, ''];
				} else if (error) {
					fields = ['custrecord_tsheettimeentry_error'];
					values = [error.details];
				}
				nlapiSubmitField('customrecord_tsheettimeentry', data[i].id, fields, values);

			log('Processed Entry ' + (i+1) + '/' + count, {
				id:data[i].id,
				error:error ? true : undefined,
				fields:fields,
				values:values
			}, error ? 'ERROR' : 'DEBUG');

			yield();
		}

		log('-- Process Entries', 'End --');
	},
	_employee:function(id, email) {
		var employeeId;
		if (id) {
			employeeId = this.employees[id] || null;
		}
		if (email && !employeeId) {
			employeeId = this.employees.emails[email] || null;
		}
		if (employeeId) {
			return employeeId;
		} else {
			throw nlapiCreateError('Unable to find Employee', 'Unable to find Employee, ID: '+id+', Email: '+email, true);
		}
	},
	_trandate:function(date) {
		if (!date) throw nlapiCreateError('Unable to parse Date', 'Unable to parse Date: '+date, true);
		date = date.split('-');
		return nlapiDateToString(new Date(
			parseInt(date[0], 10),
			parseInt(date[1], 10) - 1, 
			parseInt(date[2], 10)
		));
	},
	_hours:function(seconds) {
		if (!seconds) throw nlapiCreateError('Unable to convert Seconds', 'Unable to convert Seconds: '+seconds, true);
		seconds = parseInt(seconds, 10);
		var hours = parseInt(seconds / 3600) % 24;
		var minutes = parseInt(seconds / 60) % 60;
		return hours + ':' + minutes;
	},
	_customer:function(type, id) {
		if (type == 'project') return id;
		if (type == 'projecttask') return nlapiLookupField('projecttask', id, 'company');
		if (type == 'supportcase') return nlapiLookupField('supportcase', id, 'company');
	},
	_casetaskevent:function(type, id) {
		if (type == 'project') return ''
		if (type == 'projecttask') return id;
		if (type == 'supportcase') return id;
	}
};