/*

	Example function call: 

		disposeAsset(nlapiGetUser(), 2143, new Date(), 92, 565, 2, -7, 2);

	Overview: this script creates a "BG - Process Instance" record
		which is a Custom Record in the Fixed Asset Module. These
		records are created and then a scheduled process executes
		based on what "type" these records are. This script creates
		versions of the record that instructs the system to perform
		disposals.

		This script is best used in User-Event or Scheduled
		environments due to the permissions required around the 
		records involved and the fact that the system needs to 
		scheduled a script.

	Note: if the asset disposal fails due to an out of balance error
		make sure to check this SuiteAnswer: 49904

	Parameters:
		user - Employee Internal ID
		asset - Fixed Asset Internal ID that is available for 
			disposal
		date - JavaScript Date-object (new Date())
		item - Item Internal ID
		customer - Customer Internal ID
		amount - Currency-value (100.00, '100.00', 100)
		tax - Tax Group/Code Internal ID, refer to Tax Setup 
			preferences as to whether a Group or Code is appropriate
		location - Location Internal ID
*/
function disposeAsset(user, asset, date, item, customer, amount, tax, location) {
	
	/* Build object to be used to set fields in 
		BG - Process Instance record */
		var fields = {
			custrecord_far_proins_processname:'Asset Disposal',
			custrecord_far_proins_functionname:'famAssetDisposal',
			custrecord_far_proins_procstatus:1,
			custrecord_fam_proins_rectotal:1,
			custrecord_far_proins_procstate:{
				asset:asset,
				date:date.getTime(),
				type:1,
				qty:1,
				item:item,
				cust:customer,
				amt:amount,
				tax:tax,
				loc:location,
				JrnPermit:4
			},
			custrecord_far_proins_procmsg:'Programatically Scheduling the Disposal',
			custrecord_far_proins_recordid:asset,
			custrecord_far_proins_procuser:user,
		};

	/* Initialize BG - Process Instance record */
		
		var record = nlapiCreateRecord('customrecord_bg_procinstance');

	/* Iterate through object to ensure it's complete
		set fields in record while iterating 
		If object is incomplete throw error */
		var missingFields = [];
		for (var field in fields) {
			if (fields[field] != undefined) {
				if (typeof fields[field] != 'object') {
					record.setFieldValue(field, fields[field]);
				} else {
					var complete = true;
					for (var subfield in fields[field]) {
						if (fields[field][subfield] === undefined) {
							missingFields.push(field+'.'+subfield);
							complete = false;
						}
					}
					if (complete) record.setFieldValue(field, JSON.stringify(fields[field]));
				}
			} else {
				missingFields.push(field);
			}
		}
		if (missingFields.length > 0) {
			nlapiLogExecution('ERROR', 'Missing Field(s) in Asset Disposal', JSON.stringify(missingFields));
			return;
		}

	/* Submit record and log Internal ID */
		record = nlapiSubmitRecord(record, true, true);
		nlapiLogExecution('AUDIT', 'Asset Disposal BG - Process Instance ID', record);

	/* Put scheduled script into queue */
		var status = nlapiScheduleScript('customscript_fam_bgp_ss', 'customdeploy_fam_bgp_ss', {custscript_fam_bgp_id:record});
		nlapiLogExecution('AUDIT', 'Status of FAM BG Processing', status);
}