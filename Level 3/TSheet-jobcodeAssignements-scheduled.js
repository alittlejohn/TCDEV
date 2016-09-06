var createAssignments = {
	start:new Date(),
	batchSize:50,
	assignees:[],
	execute:function(type) {

		log('Start Scheduled Script', {
			type:type
		});

		var cases = this.getSupportCases();
		if (cases.length > 0) this.getAssignees();
		var assignments = this.consolidateAssignments(cases);
		
		this.sendRequests(assignments, 'jobcodeAssignments');

		log('End Scheduled Script', {
			elapsedSeconds:((new Date().getTime()-this.start.getTime())/1000).toFixed(2)
		});
	},
	getSupportCases:function(tsheetId) {
		var data = [], initialIndex = 0;

		do {
			var filter = [];
				filter.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', initialIndex));
				filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('status', null, 'noneof', tsheet.closedStatuses.case));
				filter.push(new nlobjSearchFilter('custevent_excludefromtsheets', null, 'is', 'F'));
				if (tsheetId) {
					filter.push(new nlobjSearchFilter('custevent_tsheetid', null, 'is', tsheetId));
				} else {
					filter.push(new nlobjSearchFilter('custevent_tsheetassignmentsent', null, 'is', 'F'));
					filter.push(new nlobjSearchFilter('custevent_tsheetid', null, 'isnotempty', null));
				}

			var column = [];
				column.push(new nlobjSearchColumn('custevent_tsheetid', null, null).setSort());

			var results = nlapiSearchRecord('supportcase', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.push(results[i].getValue('custevent_tsheetid'));
			}

			if (results.length < 1000) {
				initialIndex = null;
			} else {
				initialIndex = results[999].getId();
			}
		} while(initialIndex > 0);

		return tsheetId ? results[0].getId() : data;
	},
	consolidateAssignments:function(data) {
		var consolidated = [], temp = [];
		for (var i = 0, count = data.length ; i < count ; i++) {
			for (var ii = 0, countii = this.assignees.length ; ii < countii ; ii++) {
				if (temp.length < this.batchSize || ii + 1 < countii) {
					temp.push({
						user_id:this.assignees[ii],
						jobcode_id:data[i]
					});
				}
				if (temp.length === this.batchSize || ii + 1 === countii) {
					consolidated.push(JSON.parse(JSON.stringify(temp)));
					temp = [];
				}
			}
		}
		
		log('Consolidated Jobcodes', {
			'data.length':data.length,
			'consolidated.length':consolidated.length,
			example:consolidated.length > 0 ? consolidated[0][0] : undefined
		});

		return consolidated;
	},
	getAssignees:function() {
		var filter = [];
			filter.push(new nlobjSearchFilter('custentity_tsheetid', null, 'isnotempty', null));
			filter.push(new nlobjSearchFilter('supportrep', null, 'is', 'T'));
		var column = [];
			column.push(new nlobjSearchColumn('custentity_tsheetid'));
		var results = nlapiSearchRecord('employee', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			this.assignees.push(results[i].getValue('custentity_tsheetid'));
		}
		log('Get Assignees', {
			'assignees.length':this.assignees.length
		});
	},
	sendRequests:function(data, type) {
		for (var i = 0, count = data.length ; i < count ; i++) {
			var response = tsheet.execute(
				'assignJobCode',
				null,
				{
					data:data[i]
				}
			);
			if (response.body) response.body = JSON.parse(response.body);
			log('Type: ' + type + ', ' + (i+1) + '/' + count, response);

			if (!response.body.results) continue;

			if (!response.body.results.jobcode_assignments) continue;

			var netsuiteId = this.getSupportCases(data[i][0].jobcode_id);
			nlapiSubmitField('supportcase', netsuiteId, 'custevent_tsheetassignmentsent', 'T');
			log('Updated Record', {
				type:'supportcase',
				id:netsuiteId,
				tsheetId:data[i][0].jobcode_id
			});

			yield();
		}
	}
};