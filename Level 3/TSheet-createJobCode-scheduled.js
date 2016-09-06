var createJobcodes = {
	start:new Date(),
	batchSize:50,
	assignees:[],
	execute:function(type) {

		log('Start Scheduled Script', {
			type:type
		});

		var projects = this.getProjects();
		projects = this.consolidateJobcodes(projects, 'job');
		this.sendRequests(projects, 'job');

		var tasks = this.getProjectTasks();
		tasks = this.consolidateJobcodes(tasks, 'projectask');
		this.sendRequests(tasks, 'projectask');

		var cases = this.getSupportCases();
		cases = this.consolidateJobcodes(cases, 'supportcase');
		if (cases.length > 0) this.getAssignees();
		this.sendRequests(cases, 'supportcase');

		log('End Scheduled Script', {
			elapsedSeconds:((new Date().getTime()-this.start.getTime())/1000).toFixed(2)
		});
	},
	getProjects:function() {
		var data = [], initialIndex = 0;

		do {
			var filter = [];
				filter.push(new nlobjSearchFilter('internalid', null, 'anyof', [4176, 4214]));
				filter.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', initialIndex));
				filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('custentity_testbox', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('status', null, 'noneof', tsheet.closedStatuses.project));
				filter.push(new nlobjSearchFilter('custentity_excludefromtsheets', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('custentity_tsheetid', null, 'isempty', null));

			var column = [];
				column.push(new nlobjSearchColumn('internalid', null, null).setSort());
				column.push(new nlobjSearchColumn('entityid', null, null));
				column.push(new nlobjSearchColumn('altname', null, null));

			var results = nlapiSearchRecord('job', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.push({
					parent_id: "0",
					name: this.trimLength(results[i].getValue('entityid') + ' ' + results[i].getValue('altname')),
					short_code: tsheet._fixedWidth(results[i].getId(), 'P'),
					type: 'regular',
					billable: "no",
					billable_rate: "0.00",
					assigned_to_all: "yes"
				});
			}

			if (results.length < 1000) {
				initialIndex = null;
			} else {
				initialIndex = results[999].getId();
			}
		} while(initialIndex > 0);

		return data;
	},
	getProjectTasks:function() {
		var data = [], initialIndex = 0;

		do {
			var filter = [];
				filter.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', initialIndex));
				filter.push(new nlobjSearchFilter('custevent_tsheetid', null, 'isempty', null));
				filter.push(new nlobjSearchFilter('ismilestone', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('issummarytask', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('status', null, 'noneof', tsheet.closedStatuses.projectTask));
				filter.push(new nlobjSearchFilter('custevent_excludefromtsheets', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('custentity_tsheetid', 'job', 'isnotempty', null));
				filter.push(new nlobjSearchFilter('custentity_excludefromtsheets', 'job', 'is', 'F'));

			var column = [];
				column.push(new nlobjSearchColumn('internalid', null, null).setSort());
				column.push(new nlobjSearchColumn('id', null, null));
				column.push(new nlobjSearchColumn('title', null, null));
				column.push(new nlobjSearchColumn('custentity_tsheetid', 'job', null));

			var results = nlapiSearchRecord('projecttask', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.push({
					parent_id: results[i].getValue('custentity_tsheetid', 'job'),
					name: this.trimLength(results[i].getValue('id') + ' ' + results[i].getValue('title')),
					short_code: tsheet._fixedWidth(results[i].getId(), 'T'),
					type: 'regular',
					billable: "no",
					billable_rate: 0.00,
					assigned_to_all: "yes"
				});
			}

			if (results.length < 1000) {
				initialIndex = null;
			} else {
				initialIndex = results[999].getId();
			}
		} while(initialIndex > 0);

		return data;
	},
	getSupportCases:function() {
		var data = [], initialIndex = 0;

		do {
			var filter = [];
				filter.push(new nlobjSearchFilter('internalid', null, 'anyof', [5051]));
				filter.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', initialIndex));
				filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('status', null, 'noneof', tsheet.closedStatuses.case));
				filter.push(new nlobjSearchFilter('custevent_tsheetid', null, 'isempty', null));
				filter.push(new nlobjSearchFilter('custevent_excludefromtsheets', null, 'is', 'F'));

			var column = [];
				column.push(new nlobjSearchColumn('internalid', null, null).setSort());
				column.push(new nlobjSearchColumn('casenumber', null, null));
				column.push(new nlobjSearchColumn('title', null, null));

			var results = nlapiSearchRecord('supportcase', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.push({
					parent_id: 0,
					name: this.trimLength(results[i].getValue('casenumber') + ' ' + results[i].getValue('title')),
					short_code: tsheet._fixedWidth(results[i].getId(), 'C'),
					type: 'regular',
					billable: "no",
					billable_rate: 0.00,
					assigned_to_all: "no"
				});
			}

			if (results.length < 1000) {
				initialIndex = null;
			} else {
				initialIndex = results[999].getId();
			}
		} while(initialIndex > 0);

		return data;
	},
	consolidateJobcodes:function(data, type) {
		var consolidated = [], temp = [];
		for (var i = 0, count = data.length ; i < count ; i++) {
			if (temp.length < this.batchSize || i + 1 === count) temp.push(data[i]);
			if (temp.length === this.batchSize || i + 1 == count) {
				consolidated.push(JSON.parse(JSON.stringify(temp)));
				temp = [];
			}
		}
		
		log('Consolidated Jobcodes: ' + type, {
			'data.length':data.length,
			'consolidated.length':consolidated.length,
			example:consolidated.length > 0 ? consolidated[0][0] : undefined
		});

		return consolidated;
	},
	getAssignees:function() {
		var filter = [];
			filter.push(new nlobjSearchFilter('custentity_tsheetid', null, 'isnotempty', null));
			filter.push(new nlobjSearchFilter('issupportrep', null, 'is', 'T'));
		var column = [];
			column.push(new nlobjSearchColumn('internalid'));
		var results = nlapiSearchRecord('employee', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			this.assignees.push(results[i].getId());
		}
	},
	sendRequests:function(data, type) {
		for (var i = 0, count = data.length ; i < count ; i++) {
			var response = tsheet.execute(
				'createJobCode',
				null,
				{
					data:data[i]
				}
			);
			if (response.body) response.body = JSON.parse(response.body);
			log('Type: ' + type + ', ' + (i+1) + '/' + count, response);

			yield();

			if (!response.body.results) continue;

			if (!response.body.results.jobcodes) continue;

			for (var jobcode in response.body.results.jobcodes) {
				var temp = response.body.results.jobcodes[jobcode];
				var tsheetId = temp.id;
				var netSuiteIdentifiers = tsheet._parseShortCode(temp.short_code);
				nlapiSubmitField(netSuiteIdentifiers.type, netSuiteIdentifiers.id, netSuiteIdentifiers.type == 'job' ? 'custentity_tsheetid' : 'custevent_tsheetid', tsheetId);
				log('Updated Record', {
					type:netSuiteIdentifiers.type,
					id:netSuiteIdentifiers.id,
					tsheetId:tsheetId
				});

				yield();
			}
		}
	},
	trimLength:function(name) {
		if (name.length > 61) name = name.slice(0, 61) + '...';
		return name;
	}
};