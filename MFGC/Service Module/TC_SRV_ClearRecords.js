var records = ['customrecord_servicework', 'customrecord_servicerequest'];
for (var i = 0, count = /*records.length*/1 ; i < count ; i++) {
	var results = nlapiSearchRecord(records[i], null, null, [new nlobjSearchColumn('internalid')]) || [];
	for (var ii = 0, countii = results.length ; ii < countii ; ii++) {
		nlapiDeleteRecord(records[i], results[ii].getId());
		console.log('Deleted Record', records[i], results[ii].getId(), nlapiGetContext().getRemainingUsage());
	}
}