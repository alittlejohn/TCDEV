/* Generic Logging Function */
function log(message, details) {
	message = message === undefined ? '[No Message Specified]' : message;
	details = details === undefined ? '' : typeof details == 'object' ? JSON.stringify(details) : details;
	nlapiLogExecution('DEBUG', message, details);
}

/* CIS File Integration */

	/* CIS File-format
		{
		-	"postMonth": "11",
		-	"postYear": "2013",
		-	"postDate": "11/25/2013 9:23",
		-	"referenceNumber": "85237",
		-	"transactionDesc": "112413 ecare payments",
		-	"tranDate": "11/24/2013 0:00",
		-	"payCode": "PAY4",
		-	"payCodeDescription": "Payment - Credit Card/eCheck  ",
		-	"account": "210001",
		-	"debit": "0",
		-	"credit": "63.03",
		-	"companyId": "202",
			"department": "3",
		-	"CISClientName": "SCPV\t\t",
		-	"NSClientName": "Global Water Resources",
		-	"NSClientId": "10001"
		};*/

	function findIndex(array, object) {
		var matchFields = ['referenceNumber', 'transactionDesc', 'payCode', 'companyId', 'NSClientId', 'account'], match;
		for (var i = 0, count = array.length ; i < count ; i++) {
			match = true;
			for (var ii = 0, countii = matchFields.length ; ii < countii ; ii++) {
				if (array[i][matchFields[ii]] != object[matchFields[ii]]) {
					match = false;
					continue;
				}
			}
			if (match) break;
		}
		if (match) {
			return i;
		} else {
			return false;
		}
	}

	function accountLookup() {
		var filter = [], column = [], accounts = {};
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
		column.push(new nlobjSearchColumn('number', null, null));
		column.push(new nlobjSearchColumn('internalid', null, null));
		var results = nlapiSearchRecord('account', null, filter, column);
		if (!results) return accounts;
		for (var i = 0, count = results.length ; i < count ; i++) {
			accounts[results[i].getValue('number')] = results[i].getValue('internalid');
		}
		return accounts;
	}

	function combineData(data) {
		var newData = [];
		for (var i = 0, count = data.length ; i < count ; i++) {
			//log('--START--', '['+(i+1)+'/'+count+']');
			var index = findIndex(newData, data[i]);
			//log('index', index);
			if (index !== false) {
				newData[index]['debit'] = parseFloat(parseFloat(newData[index]['debit'])+parseFloat(data[i]['debit'])).toFixed(2);
				newData[index]['credit'] = parseFloat(parseFloat(newData[index]['credit'])+parseFloat(data[i]['credit'])).toFixed(2);
				newData[index]['lines'].push((i+1));
			} else {
				var pushObject = data[i];
				pushObject['lines'] = [(i+1)];
				newData.push(pushObject);
			}
			//log('---END---', '');
		}
		return newData;
	}

	function addAccounts(data, accounts) {
		for (var i = 0, count = data.length ; i < count ; i++) {
			if (accounts[data[i]['account']]) {
				data[i]['ns_account'] = accounts[data[i]['account']];
			} else {
				nlapiLogExecution('AUDIT', 'Account in File not found in NetSuite', data[i]['account']);
				data[i]['ns_account'] = 285;
			}
		}
		return data;
	}

	function clientLookup() {
		var filter = [], column = [], clients = {};
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
		column.push(new nlobjSearchColumn('entityid', null, null));
		column.push(new nlobjSearchColumn('internalid', null, null));
		var results = nlapiSearchRecord('customer', null, filter, column);
		if (!results) return clients;
		for (var i = 0, count = results.length ; i < count ; i++) {
			clients[results[i].getValue('entityid')] = results[i].getValue('internalid');
		}
		return clients;
	}

	function addClients(data, clients) {
		for (var i = 0, count = data.length ; i < count ; i++) {
			if (clients[data[i]['NSClientId']]) {
				data[i]['name'] = clients[data[i]['NSClientId']];
			} else {
				nlapiLogExecution('AUDIT', 'Client in File not found in NetSuite', data[i]['NSClientId']);
			}
		}
		return data;
	}

	function addValues(data) {
		var clients = clientLookup();
		data = addClients(data, clients);
		var accounts = accountLookup();
		data = addAccounts(data, accounts);
		return data;
	}

	function createJournal(data, filename) {
		var debit = 0, credit = 0;

		var record = nlapiCreateRecord('journalentry', {recordmode:"dynamic"});
		record.setFieldValue('trandate', nlapiDateToString(new Date(data[0]['tranDate'])));

		var reverseValues = {
			'debit' : {
				'PAY2' : {'ns_account':1, 'debit':0, 'credit':0, 'memo':'Automatic debit to reverse all PAY2 credits'},
				'PAY7' : {'ns_account':233, 'debit':0, 'credit':0, 'memo':'Automatic debit to reverse all DEP7 credits'},
				'PAY4' : {'ns_account':233, 'debit':0, 'credit':0, 'memo':'Automatic debit to reverse all PAY4 credits'},
				'PAYS' : {'ns_account':133, 'debit':0, 'credit':0, 'memo':'Automatic debit to reverse all PAYS credits'},
				'no_payCode' : {'ns_account':295, 'debit':0, 'credit':0, 'memo':'Automatic debit to reverse all undefined PayCodes credits'}
			},
			'credit' : {
				'PAY2' : {'ns_account':1, 'debit':0, 'credit':0, 'memo':'Automatic credit to reverse all PAY2 debits'},
				'PAY7' : {'ns_account':233, 'debit':0, 'credit':0, 'memo':'Automatic credit to reverse all DEP7 debits'},
				'PAY4' : {'ns_account':233, 'debit':0, 'credit':0, 'memo':'Automatic credit to reverse all PAY4 debits'},
				'PAYS' : {'ns_account':133, 'debit':0, 'credit':0, 'memo':'Automatic credit to reverse all PAYS debits'},
				'no_payCode' : {'ns_account':295, 'debit':0, 'credit':0, 'memo':'Automatic credit to reverse all undefined PayCodes credits'}
			}
		};

		var d_c_type = ['debit', 'credit'];
		for (var i = 0, count = data.length ; i < count ; i++) {
			for (var d_c = 0, count_d_c = 2 ; d_c < count_d_c ; d_c++) {
				if (parseFloat(data[i][d_c_type[d_c]]) != 0) {
					record.selectNewLineItem('line');
					record.setCurrentLineItemValue('line', 'account', data[i]['ns_account']);
					if (parseFloat(data[i][d_c_type[d_c]]) != 0) {
						record.setCurrentLineItemValue('line', d_c_type[d_c], parseFloat(data[i][d_c_type[d_c]]).toFixed(2));
					}
					if (data[i]['name']) record.setCurrentLineItemValue('line', 'entity', data[i]['name']);
					record.setCurrentLineItemValue('line', 'memo', data[i]['referenceNumber']+'; '+data[i]['transactionDesc']);
					record.setCurrentLineItemValue('line', 'custcol_cisposted', nlapiDateToString(new Date(data[i]['tranDate'])));
					record.setCurrentLineItemValue('line', 'custcol_ciscompanyid', data[i]['companyId']);
					record.setCurrentLineItemValue('line', 'custcol_cisclientname', data[i]['CISClientName'] ? data[i]['CISClientName'] : '');
					record.setCurrentLineItemValue('line', 'custcol_cispaycode', data[i]['payCode']);
					record.setCurrentLineItemValue('line', 'custcol_cispaycodedesc', data[i]['payCodeDescription']);
					record.commitLineItem('line');
					log('Line Added ['+(i+1)+'/'+count+']', {
						'debit/credit':d_c_type[d_c]+': '+data[i][d_c_type[d_c]],
						'clientName':data[i]['CISClientName'],
						'values':data[i]
					});
				}
			}
		}

		record.setFieldValue('externalid', filename);
		record = nlapiSubmitRecord(record, false, true);
		nlapiLogExecution('AUDIT', 'Journal Entry Created', record);
		return record;
	}

/* Refund File Integration */
	
	/* Refund File-format
		{
		-	"0": "C611308", // customer_number
		-	"1": "210300", // account_number
		-	"2": "-100.63", // amount
		-	"3": "06/03/2014", // date
		-	"4": "618", // memo
		-	"5": "GURDARSHAN GILL", // name
		-	"6": "57 PINE BROOK RD", // address 1
		-	"7": "", // address 2
		-	"8": "TOWACO", // city
		-	"9": "NJ", // state
		-	"10": "07082", // zip
		-	"11": "25788 W DUNLAP RD" // refnum
		};*/

	// Inactivated, moved to Scheduled process
		// function create_refunds(data) {
		// 	var created_records = [];
		// 	for (var i = 0, count = data.length ; i < count ; i++) {
		// 		try {
		// 			var c = data[i];
		// 			if (c == null) continue;
		// 			var record = nlapiCreateRecord('customrecord_refunddata');
		// 			record.setFieldValue('custrecord_refunddata_customernumber', c['c0']);
		// 			record.setFieldValue('custrecord_refunddata_accountnumber', c['c1']);
		// 			record.setFieldValue('custrecord_refunddata_amount', c['c2']);
		// 			record.setFieldValue('custrecord_refunddata_date', c['c3']);
		// 			record.setFieldValue('custrecord_refunddata_memo', c['c4']);
		// 			record.setFieldValue('custrecord_refunddata_name', c['c5']);
		// 			record.setFieldValue('custrecord_refunddata_address1', c['c6']);
		// 			record.setFieldValue('custrecord_refunddata_address2', c['c7']);
		// 			record.setFieldValue('custrecord_refunddata_city', c['c8']);
		// 			record.setFieldValue('custrecord_refunddata_state', c['c9']);
		// 			record.setFieldValue('custrecord_refunddata_zip', c['c10']);
		// 			record.setFieldValue('custrecord_refunddata_reference', c['c11']);
		// 			record = nlapiSubmitRecord(record, false, true);
		// 			log('Refund Created ('+(i+1)+'/'+(count)+')', record);
		// 			created_records.push(record);
		// 		} catch(e) {
		// 			nlapiLogExecution('ERROR', 'Error creating Refund records ('+(i+1)+'/'+(count)+')', e);
		// 			nlapiSendEmail(3, 'dev@truecloud.com,sharon.mylan@gwfathom.com', 'Error creating Refund records: '+e+' ('+(i+1)+'/'+count+')', JSON.stringify(data));
		// 			return null;
		// 		}
		// 	}
		// 	nlapiScheduleScript('customscript_globalwater_refundfileproc', 'customdeploy_globalwater_refundfileproc');
		// 	return created_records;
		// }

	function create_refund_file(data, filename) {
		var today = new Date();
		var file_name = filename || (today.getMonth()+1)+'-'+today.getDate()+'-'+today.getFullYear()+'-'+today.getTime();
		log('file_name', file_name);
		var file = nlapiCreateFile(file_name+'.txt', 'PLAINTEXT', JSON.stringify(data));
		file.setFolder(42);
		file = nlapiSubmitFile(file);
		nlapiScheduleScript('customscript_globalwater_refundfileproc', 'customdeploy_globalwater_refundfileproc', {'custscript_fileid':file});
		return file;
	}

function restlet(request, response) {
	log('request type', typeof request);
	if (typeof request == 'string') request = JSON.parse(request);
	log('request', request);
	var data = request, return_object;

	//nlapiSendEmail(3, 'sharon.mylan@gwfathom.com', 'Global Water Fathom Integration : '+(data.refund != 'true' ? 'Journal Entry' : 'Refunds'), JSON.stringify(data));

	/* TEST MULTIFILE PROCESSING */
	// var test = true;
	// if (test) {
	// 	nlapiLogExecution('AUDIT', 'TEST RECEIVED', JSON.stringify({
	// 		filename:data.datafilename
	// 	}));
	// 	return 'TEST-'+new Date().getTime();
	// }

	try {
		if (data.refund != 'true') {
			log('Create Journal Entry');
			/* Create Journal Entry */
				//nlapiSendEmail(3, 'sharon.mylan@gwfathom.com', 'Received the Global Water JSON', JSON.stringify(data));
				log('data.length', data.journals.length);
				var filename = data.datafilename;
				data = combineData(data.journals);
				log('data.length (post-combine)', data.length);
				data = addValues(data);
				log('data (post addValues)', data);
				return_object = createJournal(data, filename);
		} else {
			log('Create Refunds');
			return_object = create_refund_file(data.refunds, data.datafilename);
		}
	} catch(e) {
		var error = {};
		if (e instanceof nlobjError) {
			nlapiSendEmail(3, 'sharon.mylan@gwfathom.com,scripterrors@truecloud.com,fathom-it@gwfathom.com', 'Global Water Fathom Integration : '+(data.refund != 'true' ? 'Journal Entry' : 'Refunds')+' FAILURE', 'Stack Trace: '+e.getStackTrace()+'<br><br>'+e.getDetails()+'<br><br>File Name: '+data.datafilename, null, null, {entity:3});
			error.code = e.getCode(), error.details = e.getDetails();
		} else {
			nlapiSendEmail(3, 'sharon.mylan@gwfathom.com,scripterrors@truecloud.com,fathom-it@gwfathom.com', 'Global Water Fathom Integration : '+(data.refund != 'true' ? 'Journal Entry' : 'Refunds')+' FAILURE', JSON.stringify(e), null, null, {entity:3});
			error.details = e.toString();
		}
		nlapiLogExecution('ERROR', 'Caught-Error', JSON.stringify(error));
		return_object = error;
	}

	return return_object;
}