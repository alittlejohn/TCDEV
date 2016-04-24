/*
	Get the current Tax Rate as NetSuite
		does not update the rate in cases
		of copied transactions.

	The Tax Item should be an Internal ID
		of a Tax Group/Code. 

	Because Tax Groups and Tax Codes are 
		both valid choices in ProBox, 
		perform a lookup that catches errors
	*/
function getCurrentTaxRate(taxItem) {
	var rate, recordTypes = ['taxgroup', 'salestaxitem'];
	for (var i = 0, count = recordTypes.length ; i < count ; i++) {
		try {
			rate = nlapiLookupField(recordTypes[i], taxItem, 'rate');
			if (rate) break;
		} catch(e) {
			var error = {recordType:recordTypes[i]};
			if (e instanceof nlobjError) {
				error.details = e.getDetails(), error.type = 'NetSuite';
			} else {
				error.details = e.toString(), error.type = 'JavaScript';
			}
			nlapiLogExecution('ERROR', 'Get Current Tax Rate Error', JSON.stringify(error));
			console.error(error)
		}
	}
	return rate;
}