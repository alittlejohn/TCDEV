var scheduled = {
	customer:nlapiGetContext().getSetting('SCRIPT', 'custscript_request_internalcustomer'),
	serviceRepair:nlapiGetContext().getSetting('SCRIPT', 'custscript_srvtransaction_diagnosticfee'),
	execute:function(type) {

		this.getAssetsToService();

		this.processRequests();

		this.updateAssets();
	},
	getAssetsToService:function() {

		this.data = {}, numberOfAssets = 0;

		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('custrecord_assetequipment', null, 'noneof', ['@NONE@']));
			filter.push(new nlobjSearchFilter('custrecord_assetnextservicedate', null, 'within', 'thismonth'));
			filter.push(new nlobjSearchFilter('custrecord_assetstatus', null, 'noneof', [4]));
		var column = [];
			column.push(new nlobjSearchColumn('name'));
			column.push(new nlobjSearchColumn('custrecord_assetlocation'));
			column.push(new nlobjSearchColumn('name', 'custrecord_assetequipment'));
			column.push(new nlobjSearchColumn('custrecord_assetequipment'));
			column.push(new nlobjSearchColumn('custrecord_serviceschedule_months', 'custrecord_assetserviceschedule'));
		var results = nlapiSearchRecord('customrecord_ncfar_asset', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			var location = results[i].getValue('custrecord_assetlocation') || 'notSpecified';
			var temp = {
				id:results[i].getId(),
				name:results[i].getValue('name'),
				months:parseInt(results[i].getValue('custrecord_serviceschedule_months', 'custrecord_assetserviceschedule'), 10),
				serial:results[i].getValue('name', 'custrecord_assetequipment'),
				custrecord_service_work_equipment:results[i].getValue('custrecord_assetequipment'),
				onsite:'T',
				custrecord_service_work_repair:this.serviceRepair,
				custrecord_service_work_symptoms:'Scheduled Maintenance'
			};
			if (this.data[location]) {
				this.data[location].push(temp);
			} else {
				this.data[location] = [temp];
			}
			numberOfAssets += 1;
		}
		log('Assets to Service', {
			count:numberOfAssets
		});
	},
	processRequests:function() {
		var temp = [], indexes = [], successes = {workCreated:0, requestsCreated:0};
		for (var location in this.data) {
			for (var i = 0, count = this.data[location].length ; i < count ; i++) {
				if (temp.length < 10) {
					temp.push(this.data[location][i]);
					indexes.push(i);
				}
				if (temp.length === 10 || i + 1 === count) {
					var serviceRequest = buildServiceRequest.execute(
						{
							custrecord_servicerequest_customer:this.customer,
							custrecord_servicerequest_ponumber:'Scheduled Maintenance',
							custrecord_servicerequest_location:location == 'notSpecified' ? '' : location,
							serviceWork:temp
						},
						true,
						false
					);
					if (serviceRequest > 0) {
						successes.workCreated += temp.length;
						successes.requestsCreated += 1;
					}
					for (var ii = 0, countii = indexes.length ; ii < countii ; ii++) {
						this.data[location][indexes[ii]].serviceRequest = serviceRequest;
					}
					temp = [], indexes = [];
					yield();
				}
			}
		}
		log('Finished Processing Service Requests', successes);
	},
	updateAssets:function() {
		var today = new Date();
		for (var location in this.data) {
			for (var i = 0, count = this.data[location].length ; i < count ; i++) {
				if (this.data[location][i].serviceRequest) {
					var newMaintenance = nlapiDateToString(
						new Date(
							today.getFullYear(),
							today.getMonth() + this.data[location][i].months,
							1
						)
					);
					nlapiSubmitField(
						'customrecord_ncfar_asset',
						this.data[location][i].id,
						'custrecord_assetnextservicedate',
						newMaintenance
					);
					log('Maintenance Updated', {
						assetId:this.data[location][i].id,
						name:this.data[location][i].name,
						newMaintenance:newMaintenance
					});
					yield();
				}
			}
		}
	}
};