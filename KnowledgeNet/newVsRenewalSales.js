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

/* Notes
	this.test - should be set to "false", "0", or "" to take it out of testing
		this allows you to quickly test for new customers. You might set 
		this up as script parameter which would look like the below in 
		the object: 

			var newVsRenewal = {
				test:nlapiGetContext().getSetting('SCRIPT', 'custscript_testcustomer'),
				start:new Date(),
				...

		unsetting the script parameter would then take it out of testing
	Lines 56 through 60 - this is testing to see if a variable has been set in the
		object, if it hasn't then it should be assumed to be the scheduled 
		environment and that it needs to fetch what it should process
		To execute this in a scheduled context:

			newVsRenewal.updateRecords = [{
				customer_internalid: ###,
				name: "Test Customer",
				previous_year: YYYY,
				current_year: YYYY
			}];
			newVsRenewal.execute();
	_previousYearSales - in your script, be careful if you don't receive any results
	_getTransactionDetails - this won't work if they ever have more than 1000 
		transactions in a year! (I know it's unlikely)
	processRecords - are you updating Credit Memos? - I see Sales Orders hardcoded
		in the nlapiSubmitField
		I don't see the Running Total being updated on the records, in case you 
		wanted to have this set, too
	*/

var newVsRenewal = {
	test:119490,
	start:new Date(),
	execute:function(type) {

		log('*** START ***', {
			start:this.start,
			type:type,
			deployment:nlapiGetContext().getDeploymentId()
		}, 'AUDIT');

		if (!this.updateRecords) this.getRecordsToProcess();
		log('Records to Process', {
			'updateRecords.length':this.updateRecords.length,
			example:this.updateRecords.length > 0 ? this.updateRecords[0] : undefined
		}, 'AUDIT');

		for (var i = 0, count = this.updateRecords.length ; i < count ; i++) {
			var tempStart = new Date().getTime(), tempUsage = nlapiGetContext().getRemainingUsage();
			log('     1:2 Start Processing '+(i+1)+'/'+count, this.updateRecords[i]);

			this.processRecords(
				this.updateRecords[i].customer_internalid,
				this.updateRecords[i].previous_year,
				this.updateRecords[i].current_year
			);

			log('     2:2 Start Processing '+(i+1)+'/'+count, {
				elapsedSeconds:((new Date().getTime()-tempStart)/1000).toFixed(2),
				usage:tempUsage-nlapiGetContext().getRemainingUsage()
			});

			yield();
		}

		log('--- END ---', {
			elapsedSeconds:((new Date().getTime()-start.getTime())/1000).toFixed(2),
			usage:10000-nlapiGetContext().getRemainingUsage()
		}, 'AUDIT');
	},
	getRecordsToProcess:function() {
		this.updateRecords = [], initialIndex = 0;
		do {
			var filters = []; //define filters of the search
				filters.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', initialIndex));
				filters.push(new nlobjSearchFilter('type', null, 'anyof', ['SalesOrd', 'CustCred']));
				filters.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
				filters.push(new nlobjSearchFilter('status', null, 'noneof', 'SalesOrd:C'));
				if (!this.test) {
					filters.push(new nlobjSearchFilter('lastmodifieddate', null,'on','yesterday'));
				} else {
					filters.push(new nlobjSearchFilter('internalidnumber', 'customer', 'equalto', this.test));
				}
			var columns = [];
				columns.push(new nlobjSearchColumn('internalid', 'customer', 'group').setSort()); //0
				columns.push(new nlobjSearchColumn('name', null, 'group')); //1
				columns.push(new nlobjSearchColumn('formulanumeric', null, 'group').setFormula("TO_CHAR({saleseffectivedate},'YYYY')-1")); //2
				columns.push(new nlobjSearchColumn('formulanumeric', null, 'group').setFormula("TO_CHAR({saleseffectivedate},'YYYY')")); //3
			var results = nlapiSearchRecord('transaction', null, filters, columns) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				this.updateRecords.push({
					customer_internalid: results[i].getValue(columns[0]),
					name: results[i].getText(columns[1]),
					previous_year: parseFloat(results[i].getValue(columns[2]) || 0),
					current_year: parseFloat(results[i].getValue(columns[3]) || 0)	
				});
			}

			if (results.length === 1000) {
				initialIndex = results[999].getValue(columns[0]);
			} else {
				initialIndex = null;
			}

		} while(initialIndex > 0);
	},
	processRecords:function(customerID, previousYear, currentYear) {
		var runningTotal = 0;

		var previousYearSales = this._previousYearSales(customerID, previousYear);
		log('     1:2 Previous Year Sales', previousYearSales);

		this._getTransactionDetails(customerID, currentYear);

		for (var i = 0, count = this.transactionDetails.length ; i < count ; i++) {
			
			var temp = {
				updated:false,
				type: this.transactionDetails[i].getRecordType(),
				id: this.transactionDetails[i].getId(),
				salesEffectiveDate: this.transactionDetails[i].getValue('saleseffectivedate'),
				currentNewSales: parseFloat(this.transactionDetails[i].getValue('custbody_new_sales') || 0),
				currentRenewalSales: parseFloat(this.transactionDetails[i].getValue('custbody_renewal_sales') || 0),
				subtotal: parseFloat(this.transactionDetails[i].getValue('formulanumeric') || 0),
				renewalSales: 0,
				renewalTemp: null,
				newSales: 0
			};

			runningTotal += parseFloat(temp.subtotal.toFixed(2));

			if (runningTotal <= previousYearSales) {
				temp.renewalSales = temp.subtotal;
			} else {
				temp.renewalTemp = previousYearSales - (runningTotal - temp.subtotal);
				if (renewalTemp > 0) {
					temp.renewalSales = parseFloat(temp.renewalTemp.toFixed(2));
					temp.newSales = parseFloat((temp.subtotal - temp.renewalSales).toFixed(2));
				} else {
					temp.newSales = temp.subtotal;
				}
			}

			temp.fields = [], temp.values = [];
			if (temp.renewalSales != temp.currentRenewalSales || temp.newSales != temp.currentNewSales) {
				temp.fields.push('custbody_renewal_sales'), temp.fields.push('custbody_new_sales');
				temp.values.push(temp.renewalSales), temp.values.push(temp.newSales);
				temp.updated = true;
				nlapiSubmitField(temp.type, temp.id, temp.fields, temp.values);
			}

			log('     2:2 '+(i+1)+'/'+count, temp);

			yield();
		}
	},
	_previousYearSales:function(customerID, previousYear) {
		var filters = [];
			filters.push(new nlobjSearchFilter('type', null, 'anyof', ['SalesOrd', 'CustCred']));
			filters.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
			filters.push(new nlobjSearchFilter('status', null, 'noneof', 'SalesOrd:C'));
			filters.push(new nlobjSearchFilter('internalidnumber', 'customer', 'equalto', customerID));
			filters.push(new nlobjSearchFilter('formulanumeric', null, 'equalto', previousYear).setFormula("TO_CHAR({saleseffectivedate},'YYYY')"));
		var columns = [];
			columns.push(new nlobjSearchColumn('formulanumeric', null, 'sum').setFormula("{total}-NVL({taxtotal},0)")); //0
		var results = nlapiSearchRecord('transaction', null, filters, columns) || [];
		return results.length > 0 ? parseFloat(results[0].getValue(columns[0])) : 0;
	},
	_getTransactionDetails:function(customerID, currentYear) {
		var filters = [];
			filters.push(new nlobjSearchFilter('type', null, 'anyof', ['SalesOrd', 'CustCred']));
			filters.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
			filters.push(new nlobjSearchFilter('status', null, 'noneof', 'SalesOrd:C'));
			filters.push(new nlobjSearchFilter('internalidnumber', 'customer', 'equalto', customerID));
			filters.push(new nlobjSearchFilter('formulanumeric', null, 'equalto', currentYear).setFormula("TO_CHAR({saleseffectivedate},'YYYY')"));
		var columns = [];
			columns.push(new nlobjSearchColumn('saleseffectivedate').setSort()); //0
			columns.push(new nlobjSearchColumn('internalid').setSort()); //1
			columns.push(new nlobjSearchColumn('formulanumeric').setFormula("{total}-NVL({taxtotal},0)")); //2
			columns.push(new nlobjSearchColumn('custbody_new_sales')); //3
			columns.push(new nlobjSearchColumn('custbody_renewal_sales')); //4
		this.transactionDetails = nlapiSearchRecord('transaction', null, filters, columns) || [];
	}
};