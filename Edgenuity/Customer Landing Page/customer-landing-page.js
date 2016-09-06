// https://forms.sandbox.netsuite.com/app/site/hosting/scriptlet.nl?script=471&deploy=1&compid=1291624&h=eeabac75479d207f7a8f&action=get_cdata&cid=5086
/* Generic Logging Function */
function log(message, details) {
	if (typeof details == 'object') details = JSON.stringify(details);
	var context = {
		'P' :  nlapiGetContext().getRemainingUsage(),
		'C' : nlapiGetContext().getExecutionContext(),
		'D' : nlapiGetContext().getDeploymentId(),
		'U' : nlapiGetUser()
	};
	message = message === undefined ? '[No Message Specified]' : message;
	details = details === undefined ? '' : details;
	nlapiLogExecution('DEBUG', message, details+'<br><br><i><font color="C0C0C0">'+JSON.stringify(context)+'</font></i>');
}

function suitelet(request, response) {
	log('suitelet', '**START**');
	var data = {}, abort = false;
	var callback = request.getParameter('callback') || false;

	/* Extract routing-function */
		var params = request.getAllParameters(),
		p_data = {};
		for (var param in params) {
			if (param !== 'script' && param !== 'deploy' && param !== 'callback' && param !== 'compid' && param != '_' && param != 'h') p_data[param] = params[param];
		}
		log('parameters', p_data);

	/* Perform requested-action */
		try {
			if (p_data['action'] == 'get_cdata' && !abort) data = get_customer_data(p_data);
			if (p_data['action'] == 'update') data = update_field(p_data['customer'], p_data['field'], p_data['value']);
		} catch(e) {
			if (e instanceof nlobjError) {
				data['error'] = 'Error: '+e.getDetails()+'('+e.getStackTrace()+')';
				nlapiLogExecution('ERROR', 'NetSuite-related Error Encountered', data['error']);
			} else {
				data['error'] = JSON.stringify(e);
				nlapiLogExecution('ERROR', 'JavaScript-related Error Encountered', data['error']);
			}
		}

	/* Respond with data */
		log('data - '+p_data['action'], data);
		if(callback){
			data = callback+'('+JSON.stringify(data)+')';
		}else{
			data = JSON.stringify(data);
		}
		response.setHeader('Custom-Header-Content-Type', 'application/json');
		response.write(data);

		nlapiLogExecution('DEBUG','nlapiGetContext().getRemainingUsage()',nlapiGetContext().getRemainingUsage());

	log('suitelet', '***END***');
}

function get_purchased_days(customer, proj_type){
	var data = 0;
	if(!customer || !proj_type){return 0;}
	var filter = [];
		filter.push(new nlobjSearchFilter('type', 'job', 'anyof', [1,2,3,4]));
		filter.push(new nlobjSearchFilter('customer','job','anyof',customer));
		filter.push(new nlobjSearchFilter('isinactive','job','is','F'));
		filter.push(new nlobjSearchFilter('jobtype','job','anyof',proj_type));
		filter.push(new nlobjSearchFilter('custentity_account_management', 'job', 'anyof', '@ALL@'));
		filter.push(new nlobjSearchFilter('custentitypd_territory_mapping', 'job', 'contains',''));
		filter.push(new nlobjSearchFilter('custentitysales_rep_project_form', 'job', 'contains',''));

	var column = [];
		column.push(new nlobjSearchColumn('formulanumeric', null, 'SUM').setFormula('{projecttaskassignment.estimatedwork}'));

	var results = nlapiSearchRecord('projecttask', null, filter, column) || [];

	if(results.length){
		data = data = results[0].getValue('formulanumeric', null, 'SUM') ? data = results[0].getValue('formulanumeric', null, 'SUM') : 0;
		
		if(proj_type == "1"){//onsite
			data = (parseInt(data)/8).toFixed(1) + ' Days / '+ parseInt(data)+' Hours';
		}
		else if(proj_type == "2"){//webinar
			data = (parseInt(data)/4).toFixed(1) + ' Webs / '+ parseInt(data)+' Hours';
		}
		else{
			data = '0 Days / 0 Hours';
		}
	}

	return data;
}

function update_field(customer, field, value) {
	// if (!customer || !field || !value) return {'error':'Missing Customer/Field/Value, all three are required'};
	if (!customer || !field) return {'error':'Missing Customer/Field/Value, all three are required'};//allow to update with empty value
	if(!value){
		value = '';
	}
	nlapiSubmitField('customer', customer, field, value);
	return {'success':true};
}

function get_pd_remaining_hours(parameters){
	var data = 0;
	var filter = [];
		filter.push(new nlobjSearchFilter('type', 'job', 'anyof', [1,2,3,4]));
		filter.push(new nlobjSearchFilter('isinactive', 'job', 'is', 'F'));
		filter.push(new nlobjSearchFilter('custentity_account_management', 'job', 'anyof', '@ALL@'));
		filter.push(new nlobjSearchFilter('custentitypd_territory_mapping', 'job', 'contains',''));
		filter.push(new nlobjSearchFilter('custentitysales_rep_project_form', 'job', 'contains',''));
		filter.push(new nlobjSearchFilter('customer', 'job', 'anyof',parameters));

	var column = [];
		column.push(new nlobjSearchColumn('customer', 'job', 'group').setSort());
		column.push(new nlobjSearchColumn('formulanumeric', null, 'SUM').setFormula('{projecttaskassignment.estimatedwork}-{projecttaskassignment.actualwork}'));

	var results = nlapiSearchRecord('projecttask', null, filter, column) || [];

	if(results.length){
		data = results[0].getValue('formulanumeric', null, 'SUM')
	}

	return data;
}
function get_pd_remaining_days(parameters,type){
	var data = 0;
	var filter = [];
		filter.push(new nlobjSearchFilter('type', 'job', 'anyof', [1,2,3,4]));
		filter.push(new nlobjSearchFilter('isinactive', 'job', 'is', 'F'));
		filter.push(new nlobjSearchFilter('custentity_account_management', 'job', 'anyof', '@ALL@'));
		filter.push(new nlobjSearchFilter('custentitypd_territory_mapping', 'job', 'contains',''));
		filter.push(new nlobjSearchFilter('custentitysales_rep_project_form', 'job', 'contains',''));
		filter.push(new nlobjSearchFilter('customer', 'job', 'anyof',parameters));
		filter.push(new nlobjSearchFilter('jobtype', 'job', 'anyof',type));
		filter.push(new nlobjSearchFilter('status', 'job', 'anyof','2'));//in progress

	var column = [];
		column.push(new nlobjSearchColumn('customer', 'job', 'group').setSort());
		column.push(new nlobjSearchColumn('formulanumeric', null, 'SUM').setFormula('{projecttaskassignment.estimatedwork}-{projecttaskassignment.actualwork}'));

	var results = nlapiSearchRecord('projecttask', null, filter, column) || [];

	if(results.length){
		data = results[0].getValue('formulanumeric', null, 'SUM');
		if(type=='1'){//onsite
			data = (parseInt(data)/8).toFixed(1);
		}
		if(type=='2'){//webinar
			data = (parseInt(data)/4).toFixed(1);
		}
	}

	return data;
}
function get_pd_fields(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', null, 'anyof', parameters));
		filter.push(new nlobjSearchFilter('jobtype', 'job', 'anyof',['1','2']));//onsite and webinar

	var column = [];
		column.push(new nlobjSearchColumn('internalid', 'job', null));
		column.push(new nlobjSearchColumn('custentity_pd_web_purchased',  'job',  null));
		column.push(new nlobjSearchColumn('custentity_pd_onsite_purchased',  'job',  null));
		column.push(new nlobjSearchColumn('custentity_train_plan_saved',  'job',  null));
		column.push(new nlobjSearchColumn('custentity_train_plan_exempt',  'job',  null));
		column.push(new nlobjSearchColumn('custentity_0_pd_remaining',  'job',  null));
		column.push(new nlobjSearchColumn('startdate',  'job',  null).setSort(true));
		column.push(new nlobjSearchColumn('companyname',  'job',  null));
		column.push(new nlobjSearchColumn('status',  'job',  null));

	var results = nlapiSearchRecord('customer', null, filter, column) || [];

	if(results.length){
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				internalid: results[i].getValue('internalid', 'job', null),
				train_plan_saved: results[i].getValue('custentity_train_plan_saved', 'job', null),
				train_plan_exempt: results[i].getValue('custentity_train_plan_exempt', 'job', null),
				custentity_0_pd_remaining: results[i].getValue('custentity_0_pd_remaining', 'job', null),
				startdate: results[i].getValue('startdate', 'job', null),
				status: results[i].getText('status', 'job', null),
				project: results[i].getValue('companyname', 'job', null)
			});
		}
	}

	return data;
}

function get_messages(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', null, 'anyof', parameters));
		filter.push(new nlobjSearchFilter('messagetype', 'messages', 'anyof', 'EMAIL'));
		filter.push(new nlobjSearchFilter('recipient', 'messages', 'noneof', '@NONE@'));
		filter.push(new nlobjSearchFilter('author', 'messages', 'noneof', '@NONE@'));
		filter.push(new nlobjSearchFilter('subject', 'messages', 'isnotempty'));
		filter.push(new nlobjSearchFilter('subject', 'messages', 'doesnotcontain', 'case #'));
		filter.push(new nlobjSearchFilter('subject', 'messages', 'doesnotcontain', 'case#'));
		filter.push(new nlobjSearchFilter('subject', 'messages', 'doesnotcontain', 'Edgenuity Support'));
		filter.push(new nlobjSearchFilter('subject', 'messages', 'doesnotcontain', 'Edgenuity Customer Support'));
		filter.push(new nlobjSearchFilter('message', 'messages', 'doesnotcontain', 'customersupport@education2020.com'));

	var column = [];
		column.push(new nlobjSearchColumn('internalid',  'messages',  null));
		column.push(new nlobjSearchColumn('messagedate',  'messages',  null).setSort(true));
		column.push(new nlobjSearchColumn('author',  'messages',  null));
		column.push(new nlobjSearchColumn('recipient',  'messages',  null));
		column.push(new nlobjSearchColumn('message',  'messages',  null));
		column.push(new nlobjSearchColumn('subject',  'messages',  null));

	var results = nlapiSearchRecord('customer', null, filter, column) || [];

	if(results.length){
		for (var i = 0, count = results.length ; i < count ; i++) {
			var recipient = results[i].getText('recipient', 'messages' , null);
			var author = results[i].getText('author', 'messages' , null);
			data.push({
				internalid: results[i].getValue('internalid', 'messages', null).split(' ')[0],
				messagedate: results[i].getValue('messagedate', 'messages', null).split(' ')[0],
				author: author,
				recipient: recipient,
				message: escape(results[i].getValue('message', 'messages' , null)),
				subject: results[i].getValue('subject', 'messages' , null)
			});
		}
	}

	return data;
}

function get_files(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', null, 'anyof', parameters));

	var column = [];
		column.push(new nlobjSearchColumn('internalid', 'file', null));
		column.push(new nlobjSearchColumn('documentsize',  'file',  null));
		column.push(new nlobjSearchColumn('folder',  'file',  null));
		column.push(new nlobjSearchColumn('name',  'file',  null));
		column.push(new nlobjSearchColumn('modified',  'file',  null).setSort(true));
		column.push(new nlobjSearchColumn('filetype',  'file',  null));
		column.push(new nlobjSearchColumn('url',  'file',  null));

	var results = nlapiSearchRecord('customer', null, filter, column) || [];

	if(results.length>1){
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				internalid: results[i].getValue('internalid', 'file', null),
				documentsize: results[i].getValue('documentsize', 'file', null),
				folder: results[i].getValue('folder', 'file', null),
				name: results[i].getValue('name', 'file', null),
				modified: results[i].getValue('modified', 'file', null),
				filetype: results[i].getValue('filetype', 'file', null),
				url: results[i].getValue('url', 'file', null),
			});
		}
	}

return data;
}

function get_tasks(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('entityid', 'companycustomer', 'is', parameters));

	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null));
		column.push(new nlobjSearchColumn('startdate',  null,  null).setSort(true));
		column.push(new nlobjSearchColumn('title',  null,  null));
		column.push(new nlobjSearchColumn('custeventam_task_type',  null,  null));

	var results = nlapiSearchRecord('task', null, filter, column) || [];

	if(results.length){
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				startdate: results[i].getValue('startdate', null, null).split(' ')[0],
				title: results[i].getValue('title', null, null),
				custeventam_task_type: results[i].getText('custeventam_task_type', null, null)
			});
		}
	}

return data;
}

function get_cases(parameters){
	var data = [];
	/* Get List of data, executed through 1000+ results */
		var filter = [];
			filter.push(new nlobjSearchFilter('internalid', null, 'anyof', parameters));

		var column = [];
			column.push(new nlobjSearchColumn('internalid', null, null));
			column.push(new nlobjSearchColumn('createddate', 'case', null).setSort(true));
			column.push(new nlobjSearchColumn('title', 'case', null));
			column.push(new nlobjSearchColumn('origin', 'case', null));
			column.push(new nlobjSearchColumn('status', 'case', null));

		var results = nlapiSearchRecord('customer', null, filter, column) || [];

		if(results.length>1){
			for (var i = 0, count = results.length ; i < count ; i++) {
				data.push({
					createddate: results[i].getValue('createddate','case',null).split(' ')[0],
					title: results[i].getValue('title','case',null),
					origin: results[i].getText('origin','case',null),
					status: results[i].getText('status','case',null)
				});
				if(nlapiGetContext().getRemainingUsage() <= 25) {break;}
			}
		}

	return data;
}

function get_imp_advisor(parameters){
	var imp_advisor = {};
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', 'customer', 'anyof', parameters));
		filter.push(new nlobjSearchFilter('role', null, 'anyof', '1'));//implementation advisor

	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null).setSort());
		column.push(new nlobjSearchColumn('entityid', null, null));
		column.push(new nlobjSearchColumn('email', null, null));
		column.push(new nlobjSearchColumn('phone', null, null));

	var results = nlapiSearchRecord('contact', null, filter, column) || [];

	if(results.length){
		imp_advisor.name = results[0].getValue('entityid');
		imp_advisor.email = results[0].getValue('email');
		imp_advisor.phone = results[0].getValue('phone');
	}
	return imp_advisor;
}

function get_so_obj(parameters,for_item_info){
	var data = [];
	var so_items = for_item_info?get_so_items(parameters,for_item_info):get_so_items(parameters,false);
	nlapiLogExecution('DEBUG','so_items',JSON.stringify(so_items));
	nlapiLogExecution('DEBUG','get_so_obj params',JSON.stringify(parameters));
	if(so_items){
		data.push(so_items);
	}
	return data;

}

function get_so_items(parameters,for_item_info){
	nlapiLogExecution('DEBUG','typeof parameters', JSON.stringify(parameters));
	nlapiLogExecution('DEBUG','so id', parameters);
	nlapiLogExecution('DEBUG','for_item_info', for_item_info);
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', null, 'anyof', parameters));

	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null).setSort(true));
		column.push(new nlobjSearchColumn('custbody_po_exp_date', null, null));
		column.push(new nlobjSearchColumn('item', null, null));
		column.push(new nlobjSearchColumn('custitem1', 'item', null));
		column.push(new nlobjSearchColumn('quantity', null, null));

	var results = nlapiSearchRecord('salesorder', null, filter, column) || [];

	var last_so_id = null;
	var media_appliances_tmp = {};
	var media_appliances_arr = [];

	for (var i = 0, count = results.length ; i < count ; i++) {
		var internalid = results[i].getValue('internalid', null, null);
		var item_text = results[i].getText('item', null, null);
		var item = results[i].getValue('item', null, null);
		var type_text = '';
		var type = '';
		if(item){
			type_text = results[i].getText('custitem1', 'item', null);
			nlapiLogExecution('DEBUG', 'type_text', type_text);
			type = results[i].getValue('custitem1', 'item', null);
		}

		/* Count Media Appliances */
			if(for_item_info && type == "1"){
				var quantity = parseInt(results[i].getValue('quantity', null, null)) || 0;
				if (media_appliances_tmp[item_text]) {
					// this section gets executed when you have already encountered this item before in the results
				} else {
					// this section gets executed when it's a new item
					media_appliances_tmp[item_text] =  {
						'item_text' : item_text,
						'item' : results[i].getValue('item', null, null),
						'type_text': type_text,//item type e.g. Media Appliance
						'type': type,//item type e.g. Media Appliance
						'quantity' : quantity
					}
				}
				// nlapiLogExecution('DEBUG','media_appliances_tmp',JSON.stringify(media_appliances_tmp));
			}

		if(last_so_id == internalid){
			var new_item_obj = {
				'item_text' : item_text,
				'item' : item,
				'type_text': type_text,//item type e.g. Media Appliance
				'type': type,//item type e.g. Media Appliance
				'quantity' : results[i].getValue('quantity', null, null)
			}
			data[data.length-1].items.push(new_item_obj);
			nlapiLogExecution('DEBUG','new_item_obj',JSON.stringify(new_item_obj));
			nlapiLogExecution('DEBUG','data items',JSON.stringify(data[data.length-1].items));
		}
		/* else create new object and push to data */
		else{
			data.push({
				'internalid': internalid,
				'custbody_po_exp_date': results[i].getValue('custbody_po_exp_date', null, null),
				'items':[],
				'media_appliances':media_appliances_arr
			});
		}

		last_so_id = internalid;
	}

	// push to media_appliances array
	for (var item in media_appliances_tmp) {
		media_appliances_arr.push(media_appliances_tmp[item]);
	}

	get_purchased_time(data);
	return data;
}

function get_open_projects(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('customer', null, 'anyof', parameters)); //project on customer record
		filter.push(new nlobjSearchFilter('status', null, 'noneof', '1'));// status of project is not closed

	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null).setSort());
		column.push(new nlobjSearchColumn('entityid', null, null));
		column.push(new nlobjSearchColumn('startdate', null, null));

	var results = nlapiSearchRecord('job', null, filter, column) || [];

	for (var i = 0, count = results.length ; i < count ; i++) {
		var project_name = results[i].getValue('entityid', null, null) || '';
		if(project_name){
			project_name = project_name.split(' : ');
			project_name = project_name[project_name.length-1];
		}
		data.push({
			'internalid': results[i].getId(),
			'entityid': project_name,
			'startdate': results[i].getValue('startdate', null, null),
		});
	}

	return data;
}

function get_max_expiration(parameters){
	log('parameters: ',parameters);

	// params are now so array not customer id
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', null, 'anyof', parameters));

	var column = [];
		column.push(new nlobjSearchColumn('custbody_po_exp_date', null, 'max'));

	var results = nlapiSearchRecord('salesorder', null, filter, column) || [];

	var max_date = '';
	if(results.length){
		max_date = results[0].getValue('custbody_po_exp_date', null, 'max');
	}

	return max_date;
}

function get_purchased_time(so_data) {
    // for each sales order
    for (var s = 0, ss = so_data.length; s < ss; s++) {
        var onsite_purch_days = 0;
        var onsite_purch_hours = 0;
        var web_purch_days = 0;
        var web_purch_hours = 0;

        // for each items
        for (var i = 0, ii = so_data[s].items.length; i < ii; i++) {
            // nlapiLogExecution('DEBUG', 'so_data[s].items[i]', JSON.stringify(so_data[s].items[i]));

            /* Onsite Purchased Days and Hours */
	            if (so_data[s].items[i].item == '13' || so_data[s].items[i].item == '1056') {
	                // get the quantity and add to purch days and hours
	                onsite_purch_days += parseInt(so_data[s].items[i].quantity);
	                onsite_purch_hours += parseInt(so_data[s].items[i].quantity) * 8;
	            }
	            if (so_data[s].items[i].item == '512') {
	                // get the quantity times 3 and add to purch days and hours
	                onsite_purch_days += parseInt(so_data[s].items[i].quantity) * 3;
	                onsite_purch_hours += parseInt(so_data[s].items[i].quantity) * 3 * 8;
	            }

	            so_data[s].onsite_purch_days = onsite_purch_days;
	            so_data[s].onsite_purch_hours = onsite_purch_hours;

            /* Web Purchased Days and Hours */
            	var item_by_one_arr = ['21','661', '1057', '1066'];

            	for(var c=0,cc=item_by_one_arr.length;c<cc;c++){
            		if (so_data[s].items[i].item == item_by_one_arr[c]) {
            			 web_purch_days += parseInt(so_data[s].items[i].quantity);
            			 web_purch_hours += parseInt(so_data[s].items[i].quantity) * 4;
            		}

            	}
            	if (so_data[s].items[i].item == '513') {
	                web_purch_days += parseInt(so_data[s].items[i].quantity) * 2;
	                web_purch_hours += parseInt(so_data[s].items[i].quantity) * 2 * 4;
	            }
	            so_data[s].web_purch_days = web_purch_days;
	            so_data[s].web_purch_hours = web_purch_hours;
        }
    }
}

function get_hubs(parameters,license_count){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('internalid', 'custrecord_sales_order', 'anyof', parameters));// add only active so - REMOVED per client request 5/22/15
		filter.push(new nlobjSearchFilter('mainline', 'custrecord_sales_order', 'is', 'T'));
		if(!license_count){
			filter.push(new nlobjSearchFilter('custrecord_hub_status', null, 'noneof', '2'));//status not complete
		}

	var column = [];
			column.push(new nlobjSearchColumn('internalid', null, null).setSort());
			column.push(new nlobjSearchColumn('custrecord_hub_status', null, null));// hub status
			column.push(new nlobjSearchColumn('name', null, null));// hub name
			column.push(new nlobjSearchColumn('custrecord_sales_order', null, null));
			column.push(new nlobjSearchColumn('custbody_po_exp_date', 'custrecord_sales_order', null));// get expiration of so
			column.push(new nlobjSearchColumn('status', 'custrecord_sales_order', null));// get status of so

		/* License Types(s) & Qty */
			column.push(new nlobjSearchColumn('custrecord_licenses_dedicated_new', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_shared_new', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_dedicated_expansion', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_dedicated_renewal', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_shared_expansion', null, null));
			column.push(new nlobjSearchColumn('custrecord_license_shared_renewal', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_dedicated_pilot', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_shared_pilot', null, null));
			column.push(new nlobjSearchColumn('custrecord_licenses_shared_trial', null, null));
			column.push(new nlobjSearchColumn('custrecord_site_licences_ded_new', null, null));
			column.push(new nlobjSearchColumn('custrecord_site_licenses_ded_expansion', null, null));
			column.push(new nlobjSearchColumn('custrecord_site_licenses_ded_renewal', null, null));
			column.push(new nlobjSearchColumn('custrecord_site_licenses_ded_pilot', null, null));

		/* Course Count */
			column.push(new nlobjSearchColumn('custrecord_course_customizations', null, null));
			column.push(new nlobjSearchColumn('custrecord_course_expansion', null, null));
			column.push(new nlobjSearchColumn('custrecord_course_renewal', null, null));
			column.push(new nlobjSearchColumn('custrecord_courses_pilot', null, null));
			column.push(new nlobjSearchColumn('custrecord_course_new', null, null));

	var results = nlapiSearchRecord('customrecord_hub', null, filter, column) || [];

	for (var i = 0, count = results.length ; i < count ; i++) {
		var custrecord_sales_order = results[i].getText('custrecord_sales_order', null, null) || '';

		if(custrecord_sales_order){
			var dedicated_new = parseInt(results[i].getValue('custrecord_licenses_dedicated_new', null, null)) || 0;
			var dedicated_expansion = parseInt(results[i].getValue('custrecord_licenses_dedicated_expansion', null, null)) || 0;
			var dedicated_renewal = parseInt(results[i].getValue('custrecord_licenses_dedicated_renewal', null, null)) || 0;
			var dedicated_pilot = parseInt(results[i].getValue('custrecord_licenses_dedicated_pilot', null, null)) || 0;
			var total_dedicated = dedicated_new + dedicated_expansion + dedicated_renewal + dedicated_pilot;

			var shared_new = parseInt(results[i].getValue('custrecord_licenses_shared_new', null, null)) || 0;
			var shared_expansion = parseInt(results[i].getValue('custrecord_licenses_shared_expansion', null, null)) || 0;
			var shared_renewal = parseInt(results[i].getValue('custrecord_license_shared_renewal', null, null)) || 0;
			var shared_pilot = parseInt(results[i].getValue('custrecord_licenses_shared_pilot', null, null)) || 0;
			var shared_trial = parseInt(results[i].getValue('custrecord_licenses_shared_trial', null, null)) || 0;
			var total_shared = shared_new + shared_expansion + shared_renewal + shared_pilot + shared_trial;

			var site_licenses_ded_new = parseInt(results[i].getValue('custrecord_site_licences_ded_new', null, null)) || 0;
			var site_licenses_ded_expansion = parseInt(results[i].getValue('custrecord_site_licenses_ded_expansion', null, null)) || 0;
			var site_licenses_ded_renewal = parseInt(results[i].getValue('custrecord_site_licenses_ded_renewal', null, null)) || 0;
			var site_licenses_ded_pilot = parseInt(results[i].getValue('custrecord_site_licenses_ded_pilot', null, null)) || 0;
			var total_site = site_licenses_ded_new + site_licenses_ded_expansion + site_licenses_ded_renewal + site_licenses_ded_pilot;

			var custrecord_course_customizations = parseInt(results[i].getValue('custrecord_course_customizations', null, null)) || 0;
			var custrecord_course_expansion = parseInt(results[i].getValue('custrecord_course_expansion', null, null)) || 0;
			var custrecord_course_renewal = parseInt(results[i].getValue('custrecord_course_renewal', null, null)) || 0;
			var custrecord_courses_pilot = parseInt(results[i].getValue('custrecord_courses_pilot', null, null)) || 0;
			var custrecord_course_new = parseInt(results[i].getValue('custrecord_course_new', null, null)) || 0;

			var so_custbody_po_exp_date = results[i].getValue('custbody_po_exp_date', 'custrecord_sales_order', null);
			var total_courses = 0;
			if(so_custbody_po_exp_date){
				var now = new Date();
				if (new Date(so_custbody_po_exp_date) <= now) {
					// nlapiLogExecution('DEBUG','date is greater than today');
					total_courses = custrecord_course_renewal;
				}else{
					// nlapiLogExecution('DEBUG','date is not greater than today');
					total_courses = custrecord_course_customizations + custrecord_course_expansion + custrecord_courses_pilot + custrecord_course_new + custrecord_course_renewal;
				}
			}

			data.push({
				'internalid': results[i].getId(),
				'name': results[i].getValue('name', null, null),
				'custrecord_hub_status': results[i].getValue('custrecord_hub_status', null, null) || '',
				'custrecord_hub_status_text': results[i].getText('custrecord_hub_status', null, null) || '',
				'custrecord_sales_order': custrecord_sales_order,
				'so_custbody_po_exp_date': so_custbody_po_exp_date,
				'so_status': results[i].getValue('status', 'custrecord_sales_order', null),
				'custrecord_licenses_dedicated_new': dedicated_new,
				'custrecord_licenses_dedicated_expansion': dedicated_expansion,
				'custrecord_licenses_dedicated_renewal': dedicated_renewal,
				'custrecord_licenses_dedicated_pilot': dedicated_pilot,
				'custrecord_licenses_dedicated_pilot': dedicated_pilot,
				'custrecord_licenses_shared_new': shared_new,
				'custrecord_licenses_shared_expansion': shared_expansion,
				'custrecord_license_shared_renewal': shared_renewal,
				'custrecord_licenses_shared_pilot': shared_pilot,
				'custrecord_licenses_shared_trial': shared_trial,
				'custrecord_site_licenses_ded_new': site_licenses_ded_new,
				'custrecord_site_licenses_ded_expansion': site_licenses_ded_expansion,
				'custrecord_site_licenses_ded_renewal': site_licenses_ded_renewal,
				'custrecord_site_licenses_ded_pilot': site_licenses_ded_pilot,
				'custrecord_course_customizations': custrecord_course_customizations,
				'custrecord_course_expansion': custrecord_course_expansion,
				'custrecord_course_renewal': custrecord_course_renewal,
				'custrecord_courses_pilot': custrecord_courses_pilot,
				'custrecord_course_new': custrecord_course_new,
				'total_dedicated': total_dedicated,
				'total_shared': total_shared,
				'total_site': total_site,
				'total_courses': total_courses
			});
		}
	}
	return data;
}
function get_all_hubs_sans_so(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('custrecord_purchasing_entity', null, 'anyof', parameters));//purchasing entity is customer
		filter.push(new nlobjSearchFilter('custrecord_hub_status', null, 'noneof', '2'));//status not complete

	var column = [];
			column.push(new nlobjSearchColumn('internalid', null, null).setSort());
			column.push(new nlobjSearchColumn('custrecord_hub_status', null, null));// hub status
			column.push(new nlobjSearchColumn('name', null, null));// hub name
			column.push(new nlobjSearchColumn('custrecord_sales_order', null, null));

	var results = nlapiSearchRecord('customrecord_hub', null, filter, column) || [];

	for (var i = 0, count = results.length; i < count; i++) {
	    var custrecord_sales_order = results[i].getText('custrecord_sales_order', null, null) || '';
	    if (custrecord_sales_order) {
	        custrecord_sales_order = custrecord_sales_order.replace('Sales Order #', '');
	    }
	    data.push({
	        'internalid': results[i].getId(),
	        'name': results[i].getValue('name', null, null),
	        'custrecord_hub_status': results[i].getValue('custrecord_hub_status', null, null) || '',
	        'custrecord_hub_status_text': results[i].getText('custrecord_hub_status', null, null) || '',
	        'custrecord_sales_order': custrecord_sales_order
	    });
	}
	return data;
}

function get_sales_orders(parameters,for_hubs,aftertoday){
	nlapiLogExecution('DEBUG','so internalid',parameters);
	var so_arr = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('entity', null, 'is', parameters));
		filter.push(new nlobjSearchFilter('status', null, 'noneof', ['SalesOrd:C','SalesOrd:H','SalesOrd:A']));//not cancelled, closed, or pending approval, ie approved
		if(aftertoday){
			filter.push(new nlobjSearchFilter('custbody_po_exp_date', null, 'onorafter', 'today'));
		}

	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, 'group').setSort());

	var results = nlapiSearchRecord('salesorder', null, filter, column) || [];

	if(results.length){
		for (var i = 0, count = results.length ; i < count ; i++) {
			var internalid = results[i].getValue('internalid', null, 'group');
			so_arr.push(internalid);
		}
	}

	return so_arr;
}

function activeIsOrder(customerId) {
	var filter = [];
		filter.push(new nlobjSearchFilter('subsidiary', null, 'anyof', [1]));
		filter.push(new nlobjSearchFilter('mainline', null, 'is', 'F'));
		filter.push(new nlobjSearchFilter('type', null, 'anyof', ['SalesOrd']));
		filter.push(new nlobjSearchFilter('formulatext', null, 'is', 'Yes').setFormula('CASE WHEN {type} = \'Sales Order\' AND {custbody_po_exp_date} > {today} AND {item} LIKE \'IS_%\' THEN \'Yes\' ELSE \'No\' END'));
		filter.push(new nlobjSearchFilter('name', null, 'anyof', [customerId]));
	var column = [];
		column.push(new nlobjSearchColumn('entity', null, 'group'));
	var results = nlapiSearchRecord('transaction', null, filter, column) || [];
	return results.length > 0 ? 'Yes' : 'No';
}

/* Find Customer Data

	expected parameters:
		"cid" internal id of customer record

	functions used:
		get_max_expiration
		get_sales_orders
		get_hubs
		get_cases
		get_tasks

 */

function get_customer_data(parameters) {
	var data = [];

	//open the customer record
	try{
		r = nlapiLoadRecord('customer',parameters['cid']);
		var so_arr = get_sales_orders(parameters['cid']);
		nlapiLogExecution('DEBUG','so_arr',JSON.stringify(so_arr));
		var so_arr_noexp = get_sales_orders(parameters['cid'],true);//without filter expiration <=today
		nlapiLogExecution('DEBUG','so_arr_noexp',JSON.stringify(so_arr_noexp));
		var so_arr_after_today = get_sales_orders(parameters['cid'],false,true);//with filter expiration >=today
		nlapiLogExecution('DEBUG','so_arr_after_today',JSON.stringify(so_arr_after_today));

		var hubs = [];
		var licenses = [];
		if(so_arr_noexp.length){
			hubs = get_hubs(so_arr_noexp);
			nlapiLogExecution('DEBUG','hubs',JSON.stringify(hubs));
		}
		if(so_arr_after_today.length){
			licenses = get_hubs(so_arr_after_today,true);
			nlapiLogExecution('DEBUG','licenses',JSON.stringify(licenses));
		}
		nlapiLogExecution('DEBUG','hubs',JSON.stringify(hubs));
		var total_dedicated_lic = 0;
		var total_shared_lic = 0;
		var total_site_lic = 0;
		var total_courses = 0;
		if(so_arr_noexp.length){
			
			so_arr_noexp ? so_arr_noexp = so_arr_noexp.join('%05') : so_arr_noexp = '';

			// get total licenses from hubs
			for(var h=0,hh=licenses.length;h<hh;h++){
				// The Sales Order is not Closed or Cancelled
				if(licenses[h].so_status!='cancelled' && licenses[h].so_status!='closed' && licenses[h].so_status!='pendingApproval'){
					total_dedicated_lic += licenses[h].total_dedicated;
					total_shared_lic += licenses[h].total_shared;
					total_site_lic += licenses[h].total_site;
					total_courses += licenses[h].total_courses;
				}
			}
		}
		var last_media_appliance = '';
		if(so_arr.length){
			last_media_appliance = get_so_obj(so_arr,true)[0];
			if(last_media_appliance){
				nlapiLogExecution('DEBUG','last_media_appliance before',JSON.stringify(last_media_appliance));
				last_media_appliance = last_media_appliance[0].media_appliances[0];
				nlapiLogExecution('DEBUG','last_media_appliance after',JSON.stringify(last_media_appliance));
			}
		}

		data.push({
			'internalid': r.getId(),
			'mch_pin': r.getFieldValue('custentity1'),
			'entityid': parseInt(r.getFieldValue('entityid')),
			'companyname': r.getFieldValue('companyname'),
			'custentity_district': r.getFieldText('custentity_district'),
			'billstate': r.getFieldValue('billstate'),
			'custentitypd_territory_mapping': r.getFieldValue('custentitypd_territory_mapping'),
			'custentity2': r.getFieldValue('custentity2'),
			'entitystatus': r.getFieldText('entitystatus'),
			'category': r.getFieldText('category'),
			'imp_advisor' : get_imp_advisor(parameters['cid']),
			'partnership_advisor' : r.getFieldValue('custentity_account_management') ? nlapiLookupField('employee', r.getFieldValue('custentity_account_management'),['firstname','lastname', 'email','phone']) : {},
			'contact_id': r.getFieldValue('contact'),
			'primary_contact' : r.getFieldValue('contact') ? nlapiLookupField('contact', r.getFieldValue('contact'),['firstname','lastname','email','phone']) : {},
			'salesrep': nlapiLookupField('customer',parameters['cid'],'salesrep','text'),
			'custentity_account_management': r.getFieldText('custentity_account_management') || r.getFieldValue('custentity_account_management'),
			'custentity_pd_consultant': r.getFieldText('custentity_pd_consultant') || r.getFieldValue('custentity_pd_consultant'),
			'custentity_itsales_eng': r.getFieldText('custentity_itsales_eng') || r.getFieldValue('custentity_itsales_eng'),
			'custentity293': r.getFieldText('custentity293') || 'Not-Specified',// r.getFieldValue('custentity_itsales_eng'), //Tier: Platinum/Gold/Silver
			'total_dedicated_lic': total_dedicated_lic,
			'total_shared_lic': total_shared_lic,
			'total_site_lic': total_site_lic,
			'total_courses': total_courses,
			'max_po_expiration': so_arr.length ? get_max_expiration(so_arr) : '',//returns contract_expiration; If multiple SO, max date
			'salesorders': so_arr.length ? get_so_obj(so_arr,false) : '',//array of objects
			'media_appliances': last_media_appliance,//array of objects
			'media_appliances_latest_active_so': get_media_appliances_latest_active_so(parameters['cid']),
			'activeIsOrder': activeIsOrder(r.getId()),
			'active_so_list': so_arr_noexp,//array internalids
			'all_hubs': hubs,//array of objects
			'hubs': get_all_hubs_sans_so(parameters['cid']),//array of objects REMOVED SO LOGIC
			'open_projects': get_open_projects(parameters['cid']),
			'cases' : get_cases(parameters['cid']),
			'tasks' : get_tasks(r.getFieldValue('entityid')),
			'files' : get_files(parameters['cid']),
			'messages' : get_messages(parameters['cid']),
			'professional_dev' : {
				imp_plan_exempt: r.getFieldValue('custentity_imp_plan_exempt'),
				imp_plan_saved: r.getFieldValue('custentity_imp_plan_saved'),
				followup_date: r.getFieldValue('custentity_followup_date'),
				endofyear_review_date: r.getFieldValue('custentity_endofyear_review_date'),
				endofyear_review: r.getFieldValue('custentity_endofyear_review'),
				midyear_review_date: r.getFieldValue('custentity_midyear_review_date'),
				midyear_review: r.getFieldValue('custentity_midyear_review'),
				imp_mtg_date: r.getFieldValue('custentity_imp_mtg_date'),
				imp_mtg: r.getFieldValue('custentity_imp_mtg'),
				exempt_paevent: r.getFieldValue('custentity_exempt_paevent'),
				train_plan_saved: r.getFieldValue('custentity_train_plan_saved'),
				train_plan_exempt: r.getFieldValue('custentity_train_plan_exempt'),
				custentity_0_pd_remaining: r.getFieldValue('custentity_0_pd_remaining'),
				pd_web_purchased_days: get_purchased_days(r.getId(),'2'),
				pd_onsite_purchased_days: get_purchased_days(r.getId(),'1'),
				pd_remaining_days_webinar : get_pd_remaining_days(r.getId(),'2'),
				pd_remaining_days_onsite : get_pd_remaining_days(r.getId(),'1'),
				project_fields : get_pd_fields(parameters['cid'])
			},
			'tooltip_content': get_tooltip_data(parameters['cid'], r.getFieldValue('custentity1'), r.getFieldValue('subsidiary'))
		});

	}
	//error check
	catch(e){
		nlapiLogExecution('ERROR', 'Could Not Open Customer Record', e);
		return;
	}
	return data;
}

function filterTimeFormat(time) {
 
	// Number of decimal places to round to
	var decimal_places = 2;
 
	// Maximum number of hours before we should assume minutes were intended. Set to 0 to remove the maximum.
	var maximum_hours = 15;
 
	// 3
	var int_format = time.match(/^\d+$/);
 
	// 1:15
	var time_format = time.match(/([\d]*):([\d]+)/);
 
	// 10m
	var minute_string_format = time.toLowerCase().match(/([\d]+)m/);
 
	// 2h
	var hour_string_format = time.toLowerCase().match(/([\d]+)h/);
 
	if (time_format != null) {
		hours = parseInt(time_format[1]);
		minutes = parseFloat(time_format[2]/60);
		time = hours + minutes;
	} else if (minute_string_format != null || hour_string_format != null) {
		if (hour_string_format != null) {
			hours = parseInt(hour_string_format[1]);
		} else {
			hours = 0;
		}
		if (minute_string_format != null) {
			minutes = parseFloat(minute_string_format[1]/60);
		} else {
			minutes = 0;
		}
		time = hours + minutes;
	} else if (int_format != null) {
		// Entries over 15 hours are likely intended to be minutes.
		time = parseInt(time);
		if (maximum_hours > 0 && time > maximum_hours) {
			time = (time/60).toFixed(decimal_places);
		}
	}
 
	// make sure what ever we return is a 2 digit float
	time = parseFloat(time).toFixed(decimal_places);
 
	return time;
}
function get_media_appliances_latest_active_so(parameters){
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('entity', null, 'is', parameters));
		filter.push(new nlobjSearchFilter('custitem1', 'item', 'anyof', [1]));

	var column = [];
		column.push(new nlobjSearchColumn('internalid', null, null).setSort(true));
		column.push(new nlobjSearchColumn('custbody_po_exp_date', null, null));
		column.push(new nlobjSearchColumn('item', null, null));
		column.push(new nlobjSearchColumn('custitem1', 'item', null));
		column.push(new nlobjSearchColumn('quantity', null, null));

	var results = nlapiSearchRecord('salesorder', null, filter, column) || [];

	var last_internal_id = 0;

	if(results.length){
		for (var i = 0, count = results.length ; i < count ; i++) {
			var internalid = results[i].getValue('internalid', null, null);
			if(!last_internal_id || last_internal_id==internalid){
				data.push({
					'internalid': results[i].getId(),
					'custbody_po_exp_date': results[i].getValue('custbody_po_exp_date', null, null),
					'custrecord_hub_status': results[i].getValue('custrecord_hub_status', null, null) || '',
					'custitem1': results[i].getText('custitem1', 'item', null) || '',
					'item': results[i].getText('item', null, null) || '',
					'quantity': results[i].getValue('quantity', null, null) || '',
				});
			}
			last_internal_id = internalid;
		}
	}
	return data;
}
/*************************************************************************************************************/
	/*****  START TOOLTIP STUFF                                                                                  */
	/*************************************************************************************************************/
	var env = nlapiGetContext().getEnvironment(),
	isDebug = (env === 'SANDBOX') ? true : false,
	subDomain = (!isDebug) ? '' : '.sandbox';

	function get_tooltip_data(cid, mch, subsidiary) {

		/* Get Data from current system and integrated systems */
		var start = new Date().getTime();
		if (!mch) return;
    // _current_system_data(mch);
    // _imagine(mch);
    _truenorth(mch, 'truenorth-account');
    log('Integration Elapsed Time...', (new Date().getTime() - start) / 1000);
    var submap = {
    	'1': 'edgenuity',
    	'23': 'genready',
    	'28': 'truenorth'
    }

    /* If the integration has been successful, style the hyperlink */
    var current_system = submap[subsidiary];
    log('current_system', current_system);
    var style = 'background-color:white;color:grey;';
    /* Determine the background color of the link */
    for (var key in content_data) {
    	if (key == current_system) continue;
    	if (content_data[key].customerfound) {
    		style = 'background-color:#CFF56F;color:rgb(37, 85, 153);';
    		break;
    	}
    }
    /* Determine the background color of the table header cells */
    for (var key in content_data) {
    	if (content_data[key].customerfound) {
            content_data[key].found_bg = '#CFF56F'; //found
        } else {
            content_data[key].found_bg = '#FF9494'; //not found
        }
        for (var keyy in content_data[key]) {
        	if (!content_data[key][keyy]) {
        		content_data[key][keyy] = ''
        	}
        }
    }

    // log('style', style);
    content_data.bg_style = style;

    return escape(JSON.stringify(content_data));
}

/* Misc. Functions */
	/* Generic Logging function 
		t - title of the log
		d - description/contents of the log
		l - level of the log
		if a console object is present the system will print
		to the console in the browser

		RETURN: undefined
		*/
		var console_exists = false;
	try { console_exists = console ? true : false; } catch(e) { /*nlapiLogExecution('AUDIT', 'No console available', 'Will be unable to debug from the console');*/ }
	function log(t, d, l) {
		var level = 'DEBUG';
		if (l) {
			if (l == 2 || l == 'a') level = 'AUDIT';
			if (l == 3 || l == 'e') level = 'ERROR';
		}
		if (console_exists) {
			if (level == 'DEBUG') console.log(t, d);
			if (level == 'AUDIT') console.warn(t, d);
			if (level == 'ERROR') console.error(t, d);
		}
		if (typeof t == 'object') t = JSON.stringify(t);
		if (typeof d == 'object') d = JSON.stringify(d);
		nlapiLogExecution(level, t, d);
	}
	/* Error writing function 
		t - title of the error
		d - description of the error
		hard - throws a formal error
		record - record-type to write error back to
		internalid - record internalid to write error back to
		field - field on record to write error back to

		RETURN: undefined
		*/
		function error(t, d, hard, record, internalid, field) {
			if (typeof t == 'object') t = JSON.stringify(t);
			if (typeof d == 'object') d = JSON.stringify(d);
			if (record && internalid && field) nlapiSubmitField(record, internalid, field, d);
			log(t, d, 3);
			if (hard) throw nlapiCreateError(t, d, true);
		}
	/* Get Index from Array
		o - object, should be an array
		v - value to find in o
			value can be either a single value or it can
			be an array of values
		k - key to search for v in o
			value can be either a single value or it can 
			be an array of values

		RETURN: 
			false - invalid inputs
			null - no match based on inputs
			integer (including 0) - index of first matching
			index in the array
			*/
			function _index(o, v, k) {
				log('_index', {'object':o, 'values':v, 'keys':k});
				if (!o || !v) return false;
				if (o.constructor.toString().indexOf('Array') > -1) {
					for (var i = 0, count = o.length ; i < count ; i++) {
						if (typeof v != 'object') {
							if (k) {
								if (o[i][k] == v) return i;
							} else {
								if (o[i] == v) return i;
							}
						} else {
							var match = true;
							for (var ii = 0, count_ii = v.length ; ii < count_ii ; ii++) {
								if (o[i][k[ii]] != v[ii]) match = false;
							}
							if (match) return i;
						}
					}
				} else {
					return false;
				}
				return null;
			}
	/* Get Parameters from a NetSuite nlobjRequest
		object
		request - an nlobjRequest (SuiteLets, User-Events)

		RETURN: a key-value pair of parameters */
		function _params(request) {
			var params = request.getAllParameters(),
			p_data = {};
			for (var param in params) {
				if (param !== 'script' && param !== 'deploy' && param !== 'callback' && param !== 'compid' && param != '_' && param != 'h') p_data[param] = params[param];
			}
			return p_data;
		}
	/* Get Parameters from window object
	RETURN: a key-value pair of parameters */
	function _params_window(){
		var vars = [], hash;
		var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
		for(var i = 0; i < hashes.length; i++){
			hash = hashes[i].split('=');
			vars.push(hash[0]);
			vars[hash[0]] = hash[1];
		}
		return vars;
	}

	var content_data = {
		"edgenuity": {
			"customerfound": true,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null,
			"salesreptitle":null
		},
		"genready": {
			"customerfound": true,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null,
			"salesreptitle":null
		},
		"truenorth": {
			"customerfound": false,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null,
			"salesreptitle":null
		},
		"imagine": {
			"customerfound": false,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null,
			"salesreptitle":null
		}
	};
	var urls = {
		"truenorth-account":"https://na26.salesforce.com/services/data/v34.0/query?q=SELECT%20Owner.name,%20Owner.MobilePhone,%20Owner.email,%20Owner.title%20FROM%20Account%20where%20MCH_INST_PIN__c%20=%20%27{MCH}%27",
		"truenorth-lead":"https://na26.salesforce.com/services/data/v34.0/query?q=SELECT%20Owner.name,%20Owner.MobilePhone,%20Owner.email,%20Owner.title%20%20FROM%20Lead%20where%20MCH_LEAD_PIN_2__c%20=%20%27{MCH}%27"
	};

	var submap = {
		'1': 'edgenuity',
		'23': 'genready',
		'28': 'truenorth'
	};

	function _rank(annualrevenue, subsidiary) {
		if (!annualrevenue) annualrevenue = 0;
		var return_rank = null;
		if (subsidiary == 'edgenuity' || subsidiary == 'truenorth') {
			if (annualrevenue >= 500001) {
				return_rank = 'Large';
			}
			if (annualrevenue >= 100001 && annualrevenue < 500001) {
				return_rank = 'Medium';
			}
			if (annualrevenue < 100001) {
				return_rank = 'Small';
			}
		}
		if (subsidiary == 'genready') {
			if (annualrevenue >= 125) {
				return_rank = 'Large';
			}
			if (annualrevenue >= 50 && annualrevenue < 125) {
				return_rank = 'Medium';
			}
			if (annualrevenue < 50) {
				return_rank = 'Small';
			}
		}
		log('_rank', {'annualrevenue':annualrevenue, 'subsidiary':subsidiary, 'rank':return_rank});
		return return_rank;
	}

	function _get_children(parent) {
		var data = [];
		var limiter = 50;
		var filter = [
		['isinactive', 'is', 'F'],
		'AND',
		['subsidiary', 'anyof', '1', '23', '28'],
		'AND',
		[
		['parent', 'anyof', parent],
		'OR',
		['parentcustomer.parent', 'anyof', parent]
		]
		];
		var column = [new nlobjSearchColumn('internalid')];
		var results = nlapiSearchRecord('customer', null, filter, column) || [];
		if (results.length === 0) return false;
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push(parseInt(results[i].getId(), 10));
			if (data.length == limiter) break;
		}
		log('Related Customer Count', data.length);
		return data;
	}

	function _get_customers(mch) {
		var data = [];
		var parents = [];
		var parent_mapping = {};
		var filter = [
		['isinactive', 'is', 'F'], 'AND',
		['subsidiary', 'anyof', '1', '23', '28'], 'AND',
		[
		['CUSTRECORD_DATAWRHSE_EDGENUITY.custrecordinst_pin', 'is', mch], 'OR',
		['CUSTRECORD_DATAWRHSE_EDGENUITY_GENR.custrecordinst_pin', 'is', mch], 'OR',
		['CUSTRECORD_MCH_DATAWAREHOUSE_LINK.custrecordinst_pin', 'is', mch]
		]
		];
		var column = [new nlobjSearchColumn('internalid')];
		var results = nlapiSearchRecord('customer', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			var internalid = parseInt(results[i].getId(), 10);
			if (data.indexOf(internalid) === -1) data.push(internalid);
			if (parents.indexOf(internalid) === -1) parents.push(internalid);
			parent_mapping[internalid] = internalid;

			/* Get Children related to the result */
			var children = _get_children(internalid);
			if (children) {
				for (var c = 0, count_c = children.length ; c < count_c ; c++) {
					parent_mapping[children[c]] = internalid;
					if (data.indexOf(children[c]) === -1) data.push(children[c]);
				}
			}
		}
		return {'internalids':data, 'relationships':parent_mapping, 'parents':parents};
	}

	function _date(current, result, type) {
		current = current ? nlapiStringToDate(current) : null;
		result = result ? nlapiStringToDate(result) : null;
		if (!current) {
		//log('_date no current value', {'current':current, 'result':result});
		return result !== null ? nlapiDateToString(result) : null;
	}
	if (!result) {
		//log('_date no result', {'current':current, 'result':result});
		return current !== null ? nlapiDateToString(current) : null;
	}
	if (type == 'max') {
		if (current.getTime() < result.getTime()) {
			//log('_date max result is greater', {'current':current, 'result':result});
			return nlapiDateToString(result);
		} else {
			//log('_date max result is smaller', {'current':current, 'result':result});
			return nlapiDateToString(current);
		}
	}
	if (type == 'min') {
		if (current.getTime() > result.getTime()) {
			//log('_date min result is smaller', {'current':current, 'result':result});
			return nlapiDateToString(result);
		} else {
			//log('_date min result is greater', {'current':current, 'result':result});
			return nlapiDateToString(current);
		}
	}
}

function _current_system_data(mch) {
	var start = new Date().getTime();

	/* Data-model to be returned */
	content_data = {
		"edgenuity": {
			"customerfound": true,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null
		},
		"genready": {
			"customerfound": true,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null
		},
		"truenorth": {
			"customerfound": false,
			"annualvalue": 0,
			"rank": null,
			"customersince": null,
			"lastpurchase": null,
			"salesrep": null,
			"salesrepemail": null,
			"salesrepphone": null
		}
	};

	/* Get customers (with children) */
	var filter_data = _get_customers(mch);
	log('Customer Filter information', filter_data);
	if (filter_data.internalids.length === 0) {
		log('No Matching Customers', 'Escaping out of tooltip-lookups');
		log('Elapsed Time', (new Date().getTime() - start)/1000);
		log('---END---', '-----');
		return false;
	}

	/* Load up the configuration search, 
		extract filters and columns and 
		run th search */
		var search = nlapiLoadSearch(null, 'customsearch7165');
		var columns = search.getColumns();
		var filters = [search.getFilterExpression()];
		filters.push('AND');
		var internalid_filter = ['internalid', 'anyof'];
		for (var f = 0, count_f = filter_data.internalids.length ; f < count_f ; f++) {
			internalid_filter.push(filter_data.internalids[f].toString());
		}
		filters.push(internalid_filter);
		log('New Filter', filters);
		var results = nlapiSearchRecord('customer', null, filters, search.getColumns()) || [];
		log('results.length', results.length);

	/* Iterate through the results updating
	the data-model with values */
	for (var i = 0, count = results.length ; i < count ; i++) {
		var datakey = submap[results[i].getValue('subsidiary', null, 'group')];
		var internalid = parseInt(results[i].getValue('internalid', null, 'group'), 10);
		var parent_record = filter_data.parents.indexOf(internalid) !== -1;
		var amount = datakey == 'genready' ? parseFloat(results[i].getValue(columns[18]) || 0) : parseFloat(results[i].getValue(columns[16]) || 0);
		var cust_since = results[i].getValue('trandate', 'transaction', 'min');
		var last_purchase = results[i].getValue('trandate', 'transaction', 'max');
		log('Result ['+(i+1)+'/'+count+']', {
			'datakey':datakey,
			'internalid':internalid,
			'parent':parent_record,
			'amount':amount,
			'customer since':cust_since,
			'last purchase':last_purchase
		});
		log('Raw Result ['+(i+1)+'/'+count+']', results[i]);
		if (datakey && parent_record) {
			content_data[datakey]["rank"] = datakey == 'genready' ? results[i].getValue(columns[19]) : results[i].getValue(columns[17]);
			if (datakey != 'truenorth') {
				content_data[datakey]["customerfound"] = true;
				content_data[datakey]["salesrep"] = results[i].getText('salesrep', null, 'group');
				content_data[datakey]["salesrepemail"] = results[i].getValue('email', 'salesrep', 'group');
				content_data[datakey]["salesrepphone"] = results[i].getValue('custentity114', 'salesrep', 'group');
			}
		}
		content_data[datakey]["annualvalue"] += amount;
		content_data[datakey]["customersince"] = _date(content_data[datakey]["customersince"], cust_since, 'min');
		content_data[datakey]["lastpurchase"] = _date(content_data[datakey]["lastpurchase"], last_purchase, 'max');
	}

	/* Calculate the Rank */
	if (content_data.edgenuity.customerfound == true) content_data.edgenuity.rank = _rank(content_data.edgenuity.annualvalue, 'edgenuity');
	if (content_data.truenorth.annualvalue > 0) content_data.truenorth.rank = _rank(content_data.truenorth.annualvalue, 'truenorth');
	if (content_data.genready.customerfound == true) content_data.genready.rank = _rank(content_data.genready.annualvalue, 'genready');

	/* Respond with data */
	log('Elapsed Time', (new Date().getTime() - start)/1000);
	log('---END---', '-----');
}

function _imagine(mch) {
	var response = nlapiRequestURL(urls.imagine, {'mch':mch});
	var body = response.getBody();
	var code = response.getCode();
	log('_imagine response', {'code':code, 'body':body});
	if (code == 200) {
		body = JSON.parse(body);
		content_data['imagine'] = body.imagine;
	}
}

function _get_session_id() {
	var filter = [];
	filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
	var column = [new nlobjSearchColumn('name'), new nlobjSearchColumn('internalid').setSort(true)];
	var results = nlapiSearchRecord('customrecord_sid', null, filter, column) || [];
	var sessionId = results.length > 0 ? results[0].getValue('name') : null;
	log('sessionId', sessionId);
	return sessionId;
}

function _truenorth(mch, type) {
	var response = nlapiRequestURL(
		urls[type].replace('{MCH}', mch),
		null,
		{
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'Authorization': 'Bearer '+_get_session_id()
		});
	var body = response.getBody();
	var code = response.getCode();
	log('_truenorth '+type+' response', {'code':code, 'body':body});
	if (code == 200) {
		body = JSON.parse(body);
		var found = false;

		/* Add Account data to object */
		if (body.records) {
			if (body.records.length > 0) {
				found = true;
				content_data.truenorth.customerfound = true;
				content_data.truenorth.salesrep = body.records[0].Owner.Name || '';
				content_data.truenorth.salesrepemail = body.records[0].Owner.Email || '';
				content_data.truenorth.salesrepphone = body.records[0].Owner.MobilePhone || '';
				content_data.truenorth.salesreptitle = body.records[0].Owner.Title || '';
				log('_truenorth content_data', content_data);
			}
		}

		/* Add Lead data to object */
		if (type == 'truenorth-account' && !found) {
			_truenorth(mch, 'truenorth-lead');
		}
	}
}
/*************************************************************************************************************/
/*****  END TOOLTIP STUFF                                                                                    */
/*************************************************************************************************************/