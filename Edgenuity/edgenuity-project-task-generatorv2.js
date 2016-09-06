/* Generic Logging Function */
	function tclog(message, details) {
		if (typeof details == 'object') details = JSON.stringify(details);
		var context = {
			'P' :  nlapiGetContext().getRemainingUsage(),
			'C' : nlapiGetContext().getExecutionContext(),
			'D' : nlapiGetContext().getDeploymentId(),
			'U' : nlapiGetUser()
		};
		message = message === undefined ? '[No Message Specified]' : message;
		details = details === undefined ? '' : details;
		nlapiLogExecution('DEBUG', message, details);
	}

var scheduled_tasks = true;

function find_existing_projects(customer, title, site) {
	tclog('find_existing_projects', {'customer':customer, 'title':title, 'site':site});
	var projects = 0;
	var filter = [];
		filter.push(new nlobjSearchFilter('parent', null, 'anyof', [customer]));
		filter.push(new nlobjSearchFilter('entityid', null, 'contains', title));
	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null));
		column.push(new nlobjSearchColumn('entityid', null, null));
	var results = nlapiSearchRecord('job', null, filter, column) || [];
	for (var i = 0, count = results.length ; i < count ; i++) {
		if (results[i].getValue('entityid').indexOf(site) > -1) projects++;
	}
	return projects;
}

function determine_resource(state) {
	nlapiLogExecution('AUDIT', 'Project Automation, State Value', state);
	var resource = 1918637;
	var filter = [];
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
		filter.push(new nlobjSearchFilter('custrecord_stateassignment_state', null, 'is', state));
	var column = [];
		column.push(new nlobjSearchColumn('custrecord_stateassignemnt_resource', null, null));
	var results = nlapiSearchRecord('customrecord_stateassignment', null, filter, column) || [];
	if (results.length !== 0) resource = results[0].getValue('custrecord_stateassignemnt_resource', null, null);
	return resource;
}

function gather_project_data(customer, item_type, resource, append, projectType) {
	var state = nlapiGetFieldValue('shipstate');
	var name = nlapiLookupField('entity', customer, 'altname');
	name = name.replace(/.*\s:\s/g, '');
	// Trim the name if it is in jeopardy of exceeding 83 characters
	if (name.length > 60) name = name.slice(0, 60);
	var year = new Date(nlapiGetFieldValue('trandate')).getFullYear();
	var existing_projects = find_existing_projects(nlapiGetFieldValue('entity'), name + '_' + year, append);
	var count = (existing_projects === 0 ? '' : ('_' + (existing_projects+1)));
	var data = {
		'companyname': state + ' ' + name + '_' + year + count + '_' + append,
		'jobtype': projectType,
		'entitystatus': 2,
		'startdate': nlapiGetFieldValue('trandate'),
		'custentity61': nlapiGetFieldValue('custbody_hubrecord'),
		'custentity_sales_order': nlapiGetRecordId(),
		'allowallresourcesfortasks': 'T',
		'custentity_salesordershippingstate' : nlapiGetFieldValue('shipstate'),
		'custentity_projectautomation': 'T'
		// '_jobresource': [{
		//	'jobresource': resource,
		//	'role': 8
		// }]
	};
	return data;
}

function gather_task_data(quantity, item_type, item, resource, rate, hours, append, divide_hours) {
	var data = [];
	for (var i = 0 ; i < quantity ; i++) {
		var temp_hours = parseFloat(hours)/divide_hours;
		for (var ii = 1 ; ii <= divide_hours ; ii++) {
			var temp = {
				'title': (data.length + 1) + ' ' + append,
				'constrainttype': 'FIXEDSTART',
				'startdate': nlapiGetFieldValue('trandate'),
				'custevent_company': nlapiGetFieldValue('entity'),
				'custevent_salesorder': nlapiGetRecordId(),
				'_assignee': [{
					'resource': resource,
					'serviceitem': item,
					'estimatedwork': temp_hours,
					'unitprice': (parseFloat(rate)/parseFloat(hours)),
					'unitcost': 0
				}]
			};
			data.push(temp);
		}
	}
	return data;
}

function create_project(customer, data, tasks) {

	if (tasks.length > 25 && !scheduled_tasks) {
		nlapiLogExecution('AUDIT', 'Abadoning Project and Task creation', 'Too many tasks ('+tasks.length+')');
		return;
	}

	/* Create Project record */
		var r = nlapiCreateRecord('job', {'parent':customer, 'customform':36});
		for (var key in data) {
			if (key.indexOf('_') !== 0) {
				r.setFieldValue(key, data[key]);
			} else {
				for (var a = 0, count_a = data[key].length ; a < count_a ; a++) {
					r.selectNewLineItem(key.replace('_', ''));
					for (var key_a in data[key][a]) {
						r.setCurrentLineItemValue(key.replace('_', ''), key_a, data[key][a][key_a]);
						tclog(key_a, data[key][a][key_a]);
					}
					r.commitLineItem(key.replace('_', ''));
				}
			}
		}
		r = nlapiSubmitRecord(r, true, true);
		log(' ', {'project':r, 'points':nlapiGetContext().getRemainingUsage()});

	/* Create Task record(s) */
		if (!scheduled_tasks) {
			for (var i = 0, count = tasks.length ; i < count ; i++) {
				var t = nlapiCreateRecord('projecttask', {'company': r});
				for (var key_t in tasks[i]) {
					if (key_t.indexOf('_') !== 0) {
						t.setFieldValue(key_t, tasks[i][key_t]);
					} else {
						for (var a = 0, count_a = tasks[i][key_t].length ; a < count_a ; a++) {
							t.selectNewLineItem(key_t.replace('_', ''));
							for (var key_a in tasks[i][key_t][a]) {
								t.setCurrentLineItemValue(key_t.replace('_', ''), key_a, tasks[i][key_t][a][key_a]);
							}
							t.commitLineItem(key_t.replace('_', ''));
						}
					}
				}
				t = nlapiSubmitRecord(t, true, true);
				log(' ', {'task':t, 'index': (i+1)+'/'+count, 'points':nlapiGetContext().getRemainingUsage()});
			}
		} else {
			var file = nlapiCreateFile(r+'_tasks.txt', 'PLAINTEXT', JSON.stringify(tasks));
				file.setFolder('2807289');
				file = nlapiSubmitFile(file);
			nlapiSubmitField('job', r, 'custentity_projecttasks', file);
			nlapiScheduleScript('customscript_edgenuity_projecttask_sch', 'customdeploy_edgenuity_projecttask_man');
		}

	return r;
}

function create_pd_project(projectType, divide_hours, item_type, hours) {

	/* 
		projectType = internalid
		Divide Hours = integer
		item_type = 'Display Name from Item'
		hours = integer or null
		*/

	var projectType = nlapiLookupField(
		'customrecord_profdevprojecttype',
		projectType,
		[
			'name',
			'custrecord_profdevprojecttype_append',
			'custrecord_profdevprojecttype_jobtype'
		]
	);
	nlapiLogExecution('DEBUG', 'projectType', JSON.stringify(projectType));

	/* Gather variables */
		var customer = nlapiGetFieldValue('entity'),
			item = nlapiGetCurrentLineItemValue('item', 'item'),
			quantity = nlapiGetCurrentLineItemValue('item', 'quantity'),
			rate = nlapiGetCurrentLineItemValue('item', 'rate'),
			resource = determine_resource(nlapiGetFieldValue('shipstate'));
			hours = hours || 8;
		tclog('variables', {'customer': customer, 'item_type': item_type, 'quantity': quantity});

	/* Gather Project data */
		var project_data = gather_project_data(
			customer,
			item_type,
			resource,
			projectType.custrecord_profdevprojecttype_append,
			projectType.custrecord_profdevprojecttype_jobtype
		);
		tclog('project_data', project_data);

	/* Gather Task data */
		var task_data = gather_task_data(quantity, item_type, item, resource, rate, hours, projectType.custrecord_profdevprojecttype_append, divide_hours);
		tclog('task_data', task_data);

	/* Create Project and Tasks, store on line */
		var project = create_project(customer, project_data, task_data, resource);
		tclog('project', project);
		nlapiSetCurrentLineItemValue('item', 'job', project);
}

function check_for_pd_items() {
	var points = nlapiGetContext().getRemainingUsage();
	tclog('----------START', 'Check for PD Items<br><br>Record: '+nlapiGetRecordId());
	for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
		var item = nlapiGetLineItemValue('item', 'item', i);
		var item_values = nlapiLookupField('item', item, ['displayname', 'custitem_pdhoursperquantity', 'custitem_createpdproject', 'custitem_profdevprojecttype', 'custitem_dividehoursbytask']);
		if (!item_values) continue;
		var pd_project = item_values.custitem_createpdproject == 'T' ? true : false;
		var projecType = item_values.custitem_profdevprojecttype;
		var divide_hours = parseInt(item_values.custitem_dividehoursbytask || 1, 10);
		var project = nlapiGetLineItemValue('item', 'job', i);
		if (pd_project && !project) {
			tclog('line #'+i, {'item':item});
			nlapiSelectLineItem('item', i);
			create_pd_project(item_values.custitem_profdevprojecttype, divide_hours, item_values.displayname, item_values.custitem_pdhoursperquantity);
			nlapiCommitLineItem('item');
		}
		// var test_items = ['512', '513', '13', '661', '1056', '1057', '1066', '21'];
		// if (test_items.indexOf(item) !== -1) {
		//	tclog('line #'+i, {'item':item});
		//	nlapiSelectLineItem('item', i);
		//	create_pd_project(site, divide_hours);
		//	nlapiCommitLineItem('item');
		// }
	}
	tclog('------------END', 'Points Consumed: '+(points-nlapiGetContext().getRemainingUsage()));
}