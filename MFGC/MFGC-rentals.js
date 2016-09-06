/* Logging function */
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

/* Yielding function */
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

/* Get Parameters */
	function getParameters() {
		var vars = {};
		var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi,
		function(m,key,value) {
			vars[key] = value;
		});
		return vars;
	}

var rentalLibrary = {
	rentalSalesOrderForm:113,
	isRentalTransaction:function(salesOrderId) {
		if (!salesOrderId) return false;
		return nlapiLookupField('transaction', salesOrderId, 'customform') == this.rentalSalesOrderForm;
	},
	billSalesOrder:function(salesOrderId, firstBill) {

		/* Get Sales Order Configuration */
			var salesOrderFields = nlapiLookupField(
				'salesorder',
				salesOrderId,
				[
					'status',
					'paymentmethod',
					'ccnumber',
					'custbody_manualinvoicing',
					'custbody_nextrentalinvoice'
				]
			);
			log('Bill Sales Order - Sales Order Fields', {
				salesOrderId:salesOrderId,
				firstBill:firstBill,
				status:salesOrderFields.status,
				paymentMethod:salesOrderFields.paymentmethod,
				ccNumber:salesOrderFields.ccnumber
			});

		if (salesOrderFields.status == 'fullyBilled' || salesOrderFields.custbody_manualinvoicing == 'T') return;

		try {

			var record, recordType;
			if (salesOrderFields.paymentmethod) {
				record = nlapiTransformRecord('salesorder', salesOrderId, 'cashsale', {recordmode:'dynamic'});
				recordType = 'Cash Sale';
			} else {
				record = nlapiTransformRecord('salesorder', salesOrderId, 'invoice', {recordmode:'dynamic'});
				recordType = 'Invoice';
			}

			if (!firstBill) record.setFieldValue('trandate', salesOrderFields.custbody_nextrentalinvoice);

			/* Ensure all Rental-lines are only billed for a single quantity */
				for (var i = 1, count = record.getLineItemCount('item') ; i <= count ; i++) {
					if (record.getLineItemValue('item', 'custcol_rentalitem', i) == 'T') {
						record.selectLineItem('item', i);
							record.setCurrentLineItemValue('item', 'quantity', 1);
						record.commitLineItem('item');
					}
				}

			record = nlapiSubmitRecord(record, true, true);
			log('Bill Sales Order - '+recordType, {
				salesOrderId:salesOrderId,
				idCreated:record
			});

			return record;

		} catch(e) {
			var error = {salesOrderId:salesOrderId};
			if (e instanceof nlobjError) {
				error.type = 'NetSuite', error.details = e.getDetails(), error.stack = e.getStackTrace();
			} else {
				error.type = 'JavaScript', error.details = e.toString();
			}
			log('Bill Sales Order - Error', error, 'ERROR');
		}
	},
	statusField:'custrecord_asset_rentalstatus',
	available:1,
	unavailable:2,
	movementRecordId:'customrecord_rentalavailmovement',
	updateAvailability:function(assetId, status, recordType, recordId) {
		log('Update Availability', {
			assetId:assetId,
			status:status,
			recordType:recordType || nlapiGetRecordType() || nlapiGetContext().getScriptId(),
			recordId:recordId || nlapiGetRecordId() || nlapiGetContext().getDeploymentId()
		});
		var r = nlapiCreateRecord(this.movementRecordId);
			r.setFieldValue('custrecord_rentalavailmovement_asset', assetId);
			r.setFieldValue('custrecord_rentalavailmovement_status', status);
			r.setFieldValue('custrecord_rentalavailmovement_type', recordType || nlapiGetRecordType() || nlapiGetContext().getScriptId());
			r.setFieldValue('custrecord_rentalavailmovement_id', recordId || nlapiGetRecordId() || nlapiGetContext().getDeploymentId());
		r = nlapiSubmitRecord(r, true, true);
		nlapiSubmitField('customrecord_ncfar_asset', assetId, this.statusField, status);
	},
	getRentalMovement:function(assets) {

		if (!assets) return;
		
		var data = {};

		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('custrecord_rentalavailmovement_asset', null, 'anyof', typeof assets == 'object' ? assets : [assets]));
		var column = [];
			column.push(new nlobjSearchColumn('internalid').setSort(true));
			column.push(new nlobjSearchColumn('custrecord_rentalavailmovement_asset'));
			column.push(new nlobjSearchColumn('custrecord_rentalavailmovement_status'));
			column.push(new nlobjSearchColumn('custrecord_rentalavailmovement_type'));
			column.push(new nlobjSearchColumn('custrecord_rentalavailmovement_id'));
		var results = nlapiSearchRecord(this.movementRecordId, null, filter, column) || [];

		if (results.length === 0) return;

		for (var i = 0, count = results.length ; i < count ; i++) {
			var asset = results[i].getValue('custrecord_rentalavailmovement_asset');
			var temp = {
				status:results[i].getValue('custrecord_rentalavailmovement_status'),
				recordType:results[i].getValue('custrecord_rentalavailmovement_type'),
				recordId:results[i].getValue('custrecord_rentalavailmovement_id')
			};
			if (data[asset]) {
				data[asset].push(temp);
			} else {
				data[asset] = [temp];
			}
		}

		return data;
	},
	compareAvailability:function(assets, movement, recordType, recordId, currentStatus, newStatus) {
		log('** Compare Availability', {
			currenStatus:currentStatus,
			newStatus:newStatus,
			assets:assets,
			movement:movement
		});
		recordId = typeof recordId != 'object' ? [recordId] : recordId;
		for (var i = 0, count = assets.length ; i < count ; i++) {
			if (movement[assets[i]]) {
				var temp = movement[assets[i]][0];
				if (temp.recordType == recordType && recordId.indexOf(temp.recordId) !== -1) {
					if (temp.status == currentStatus) {
						this.updateAvailability(
							assets[i],
							newStatus,
							recordType,
							recordId
						);
					} else {
						log('(' + (i+1) + '/' + count + ')' + 'Latest Status does not match', {
							asset:assets[i],
							currentStatus:temp.status,
							compareStatus:currentStatus
						});
					}
				} else {
					log('(' + (i+1) + '/' + count + ')' + 'Latest Record and/or ID differs', {
						asset:assets[i],
						lastMovement:temp,
						recordType:recordType,
						recordId:recordId
					});
				}
			} else {
				log('(' + (i+1) + '/' + count + ')' + 'Unable to locate Asset', {
					asset:assets[i]
				});
			}
		}
		log('-- Compare Availability', ' ');
	},
	daily:1,
	weekly:2,
	monthly:3,
	nextBillDate:function(salesOrderId, currentDate) {
		var salesOrderFields = nlapiLookupField(
			'salesorder',
			salesOrderId,
			[
				'custbody_rentalbillingtype',
				'custbody_invoiceday'
			]
		), day, returnDate, fields = ['custbody_nextrentalinvoice', 'custbody_invoiceday'], values = [];
		if (typeof currentDate == 'string') currentDate = new Date(currentDate);
		if (salesOrderFields.custbody_rentalbillingtype == this.daily) {
			returnDate = nlapiAddDays(currentDate, 1);
		}
		if (salesOrderFields.custbody_rentalbillingtype == this.weekly) {
			returnDate = nlapiAddDays(currentDate, 7);
		}
		if (salesOrderFields.custbody_rentalbillingtype == this.monthly) {
			var day = salesOrderFields.custbody_invoiceday || currentDate.getDate();
			returnDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, day);
		}
		returnDate = nlapiDateToString(returnDate);
		values.push(returnDate), values.push(day || '');
		nlapiSubmitField('salesorder', salesOrderId, fields, values);
		log('Next Bill Date', {
			salesOrderId:salesOrderId,
			currentDate:nlapiDateToString(currentDate),
			day:day,
			returnDate:returnDate
		});
	},
	getDamages:function(salesOrder) {
		var data = [];

		var filter = [];
			filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
			filter.push(new nlobjSearchFilter('custrecord_damages_salesorder', null, 'is', salesOrder));
			filter.push(new nlobjSearchFilter('custrecord_damages_invoice', null, 'is', '@NONE@'));
		var column = [];
			column.push(new nlobjSearchColumn('custrecord_damages_item'));
			column.push(new nlobjSearchColumn('custrecord_damages_description'));
		var results = nlapiSearchRecord('customrecord_damages', null, filter, column) || [];
		for (var i = 0, count = results.length ; i < count ; i++) {
			data.push({
				item:results[i].getValue('custrecord_damages_item'),
				description:results[i].getValue('custrecord_damages_description')
			});
		}

		return data;
	}
};

/* Sales Order */
	var salesOrderClient = {
		pageInit:function() {

		},
		saveRecord:function() {
			return true;
		},
		validateField:function(type, name) {
			return true;
		},
		fieldChanged:function(type, name) {

		},
		postSourcing:function(type, name) {

		},
		lineInit:function(type) {

		},
		validateLine:function(type) {
			return true;
		},
		validateInsert:function(type) {
			return true;
		},
		validateDelete:function(type) {
			return true;
		},
		recalc:function(type) {

		}
	};

	var salesOrderUserEvent = {
		start:new Date(),
		beforeLoad:function(type, form, request) {

			if (type == 'view') {
				if (rentalLibrary.getDamages(nlapiGetRecordId()).length > 0) {
					form.addButton('custpage_damages', 'Invoice for Damages', 'window.open(\'/app/accounting/transactions/custinvc.nl?entity='+nlapiGetFieldValue('entity')+'&damages=T&salesorder='+nlapiGetRecordId()+'\', \'_self\');');
				}
			}
		},
		beforeSubmit:function(type) {
		},
		afterSubmit:function(type) {

			this.assetsOffRent();
		},
		assetsOffRent:function() {

			var offRent = nlapiGetFieldValue('custbody_assetsreturned') == 'T';
			if (!offRent) return;

			var data = this._getFulfilledAssets();
			if (data.assets.length === 0) return;

			var movement = rentalLibrary.getRentalMovement(data.assets);
			if (!movement) return;

			rentalLibrary.compareAvailability(data.assets, movement, 'itemfulfillment', data.ids, rentalLibrary.unavailable, rentalLibrary.available);
		},
		_getFulfilledAssets:function() {
			var data = {ids:[], assets:[]};
			var filter = [];
				filter.push(new nlobjSearchFilter('createdfrom', null, 'anyof', nlapiGetRecordId()));
				filter.push(new nlobjSearchFilter('type', null, 'anyof', ['ItemShip']));
				filter.push(new nlobjSearchFilter('custcol_rentalasset', null, 'noneof', ['@NONE@']));
			var column = [];
				column.push(new nlobjSearchColumn('custcol_rentalasset'));
			var results = nlapiSearchRecord('transaction', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				var id = results[i].getId(), asset = results[i].getValue('custcol_rentalasset');
				if (data.ids.indexOf(id) === -1) data.ids.push(id);
				if (data.assets.indexOf(asset) === -1) data.assets.push(asset);
			}
			return data;
		}
	};

/* Fulfillment */
	var fulfillmentClient = {
		pageInit:function() {
		},
		saveRecord:function() {

			var returnType = true;

			returnType = this.validateAssetsSelected();

			return returnType;
		},
		validateField:function(type, name) {
			return true;
		},
		fieldChanged:function(type, name) {
		},
		postSourcing:function(type, name) {
		},
		lineInit:function(type) {
		},
		validateLine:function(type) {
			return true;
		},
		validateInsert:function(type) {
			return true;
		},
		validateDelete:function(type) {
			return true;
		},
		recalc:function(type) {
		},
		validateAssetsSelected:function() {
			var assets = [];
			for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
				var fulfilled = nlapiGetLineItemValue('item', 'itemreceive', i) == 'T', rental = nlapiGetLineItemValue('item', 'custcol_rentalitem', i) == 'T';
				if (fulfilled && rental) {
					var asset = nlapiGetLineItemValue('item', 'custcol_rentalasset', i);
					if (!asset) {
						alert('Please ensure an asset is selected for each Rental Item.');
						return false
					} else if (asset && assets.indexOf(asset) > -1) {
						alert('Please ensure all assets selected are unique.');
						return false;
					} else if (asset && assets.indexOf(asset) === -1) {
						assets.push(asset);
					}
				} else if (fulfilled && !rental) {
					nlapiSelectLineItem('item', i);
						nlapiSetCurrentLineItemValue('item', 'custcol_rentalasset', '');
					nlapiCommitLineItem('item');
				}
			}
			return true;
		}
	};

	var fulfillmentUserEvent = {
		start:new Date(),
		beforeLoad:function(type, form, request) {
			if (type == 'create' || type == 'edit') {
				var field = nlapiGetLineItemField('item', 'custcol_selectrentalasset', 1);
					field.setDisplayType('inline');

				field = nlapiGetLineItemField('item', 'custcol_rentalasset', 1);
					field.setDisplayType('disabled');
			}
		},
		beforeSubmit:function(type) {
		},
		afterSubmit:function(type) {

			var salesOrderId = nlapiGetFieldValue('createdfrom');
			var rental = rentalLibrary.isRentalTransaction(salesOrderId);

			if (type != 'xedit' && rental) this.updateAssetStatuses(type);

			if (type == 'create' && rental) {
				var transactionId = rentalLibrary.billSalesOrder(salesOrderId, true);

				var salesOrderNextBillDate = nlapiLookupField('salesorder', salesOrderId, 'custbody_nextrentalinvoice');
				if (!salesOrderNextBillDate) {
					var billedDate = nlapiLookupField('transaction', transactionId, 'trandate');
					rentalLibrary.nextBillDate(salesOrderId, billedDate);
				}
			}
		},
		updateAssetStatuses:function(type) {
			var oldReferences = this._getAssetsFromRecordObject(nlapiGetOldRecord());
			var newReferences = this._getAssetsFromRecordObject(nlapiGetNewRecord());
			log('Update Asset Statuses - References', {
				type:type,
				old:oldReferences,
				new:newReferences
			});

			var updatesToProcess = this._compareAssets(type, oldReferences, newReferences);
			log('Update Asset Statuses - Updates to Process', updatesToProcess);

			for (var i = 0, count = updatesToProcess.length ; i < count ; i++) {
				rentalLibrary.updateAvailability(
					updatesToProcess[i].id,
					updatesToProcess[i].status,
					nlapiGetRecordType(),
					nlapiGetRecordId()
				);
			}
		},
		_getAssetsFromRecordObject:function(record) {
			var assets = [];
			if (record) {
				for (var i = 1, count = record.getLineItemCount('item') ; i <= count ; i++) {
					var asset = record.getLineItemValue('item', 'custcol_rentalasset', i);
					if (asset) assets.push(asset);
				}
			}
			return assets;
		},
		_compareAssets:function(type, oldReferences, newReferences) {
			var updates = [];

			for (var i = 0, count = oldReferences.length ; i < count ; i++) {
				if (newReferences.indexOf(oldReferences[i]) === -1 || type == 'delete') {
					updates.push({
						id:oldReferences[i],
						status:rentalLibrary.available
					});
				}
			}

			for (var ii = 0, countii = newReferences.length ; ii < countii ; ii++) {
				if (oldReferences.indexOf(newReferences[ii]) === -1) {
					updates.push({
						id:newReferences[ii],
						status:rentalLibrary.unavailable
					});
				}
			}

			return updates;
		}
	};

/* Invoice */
	var invoiceClient = {
		pageInit:function() {
			this.parameters = getParameters();

			if (this.parameters.damages == 'T' && this.parameters.salesorder) this.setDamages();
		},
		saveRecord:function() {
			return true;
		},
		validateField:function(type, name) {
			return true;
		},
		fieldChanged:function(type, name) {
		},
		postSourcing:function(type, name) {
		},
		lineInit:function(type) {
		},
		validateLine:function(type) {
			return true;
		},
		validateInsert:function(type) {
			return true;
		},
		validateDelete:function(type) {
			return true;
		},
		recalc:function(type) {
		},
		setDamages:function() {
			var damages = rentalLibrary.getDamages(this.parameters.salesorder);
			for (var i = 0, count = damages.length ; i < count ; i++) {
				nlapiSelectNewLineItem('item');
					nlapiSetCurrentLineItemValue('item', 'item', damages[i].item, true, true);
					nlapiSetCurrentLineItemValue('item', 'description', damages[i].description, true, true);
				nlapiCommitLineItem('item');
			}
		}
	};

	var invoiceUserEvent = {
		start:new Date(),
		beforeLoad:function(type, form, request) {
		},
		beforeSubmit:function(type) {
		},
		afterSubmit:function(type) {

			this.updateSalesOrderDates(type);
		},
		updateSalesOrderDates:function(type) {

			var salesOrderId = type != 'xedit' ? nlapiGetFieldValue('createdfrom') : nlapiLookupField(nlapiGetRecordType(), nlapiGetRecordId(), 'createdfrom');
			if (!salesOrderId) return;

			if (!rentalLibrary.isRentalTransaction(salesOrderId)) return;

			var filter = [];
				filter.push(new nlobjSearchFilter('createdfrom', null, 'anyof', [salesOrderId]));
				filter.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
			var column = [];
				column.push(new nlobjSearchColumn('trandate', null, null).setSort(true));
			var results = nlapiSearchRecord('transaction', null, filter, column) || [];
			if (results.length > 0) {
				rentalLibrary.nextBillDate(salesOrderId, results[0].getValue('trandate'));
			}
		}
	};

/* Scheduled */
	var scheduled = {
		start:new Date(),
		countOfTransactions:0,
		execute:function(type) {

			log('** Start Scheduled Process', {
				start:this.start,
				type:type
			});

			var transactions = this.getTransactions();

			var iteration = 1;
			for (var id in transactions) {
				
				var processingLog = {};

				try {

					processingLog.id = rentalLibrary.billSalesOrder(id, false);

				} catch(e) {
					if (e instanceof nlobjError) {
						processingLog.type = 'NetSuite', processingLog.details = e.getDetails(), processingLog.stack = e.getStackTrace();
					} else {
						processingLog.type = 'JavaScript', processingLog.details = e.toString();
					}
				}

				log(iteration + '/' + this.countOfTransactions, processingLog, processingLog.details ? 'ERROR' : 'DEBUG');

				iteration++;
			}

			log('** End Scheduled Process', {
				elapsedSeconds:((new Date().getTime()-this.start.getTime())/1000).toFixed(2),
				type:type
			});
		},
		getTransactions:function() {
			var data = {};

			var filter = [];
				filter.push(new nlobjSearchFilter('type', null, 'anyof', ['SalesOrd']));
				filter.push(new nlobjSearchFilter('closed', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('custbody_nextrentalinvoice', null, 'onorbefore', 'today'));
				filter.push(new nlobjSearchFilter('formulanumeric', null, 'greaterthan', 0).setFormula('NVL({quantity}, 0) - NVL({quantitybilled}, 0)'));
				filter.push(new nlobjSearchFilter('quantityshiprecv', null, 'greaterthan', 0));
				filter.push(new nlobjSearchFilter('custitem_rentalitem', 'item', 'is', 'T'));
				filter.push(new nlobjSearchFilter('custbody_manualinvoicing', null, 'is', 'F'));
				filter.push(new nlobjSearchFilter('custbody_assetsreturned', null, 'is', 'F'));
			var column = [];
				column.push(new nlobjSearchColumn('internalid').setSort());
				column.push(new nlobjSearchColumn('tranid'));
				column.push(new nlobjSearchColumn('entity'));
				column.push(new nlobjSearchColumn('item'));
				column.push(new nlobjSearchColumn('line'));
			var results = nlapiSearchRecord('transaction', null, filter, column) || [];
			for (var i = 0, count = results.length ; i < count ; i++) {
				var id = results[i].getId();
				if (data[id]) {
					data[id].lines.push({
						item:parseInt(results[i].getValue('item'), 10),
						line:parseInt(results[i].getValue('line'), 10)
					});
				} else {
					data[id] = {
						tranid:results[i].getValue('tranid'),
						entity:results[i].getValue('entity'),
						lines:[{
							item:parseInt(results[i].getValue('item'), 10),
							line:parseInt(results[i].getValue('line'), 10)
						}]
					};
					this.countOfTransactions++;
				}
			}

			return data;
		}
	};

/* Get Parameters */
	function getParameters() {
		var vars = {};
		var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi,
		function(m,key,value) {
			vars[key] = value;
		});
		console.log('Parameters', vars);
		return vars;
	}
