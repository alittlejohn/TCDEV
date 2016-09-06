var copyPricing = {
	updatedLines:[],
	pageInit:function() {
		this.data = {
			entityUpdated:false,
			entity:nlapiGetFieldValue('entity'),
			total:nlapiGetFieldValue('total'),
			items:{}
		};
		for (var i = 1, count = nlapiGetLineItemCount('item') ; i <= count ; i++) {
			this.data.items[i + '-' + nlapiGetLineItemValue('item', 'item', i)] = {
				// Do not track price as price is often different, but does not
				// drive many changes in prices
				price:nlapiGetLineItemValue('item', 'price', i),
				rate:parseFloat(nlapiGetLineItemValue('item', 'rate', i) || 0),
				amount:parseFloat(nlapiGetLineItemValue('item', 'amount', i) || 0)
			};
		}
	},
	postSourcing:function(type, name) {
		if (name == 'entity') {
			var total = nlapiGetFieldValue('total'),
				entity = nlapiGetFieldValue('entity');
			if (entity != this.data.entity) {
				log('copyPricing postSourcing', {
					data:this.data,
					message:'Updated Customer, process update to pricing after copyPricing.recalc() executes'
				});
				this.data.entityUpdated = true;
			}
		}
	},
	recalc:function(type) {
		if (type == 'item') {
			var total = nlapiGetFieldValue('total');
			if (this.data.entityUpdated && this.data.total != total) {
				log('copyPricing recalc', {
					newTotal:total,
					oldTotal:this.data.total,
					data:this.data,
					message:'Process Line-level updates to Item-sublist'
				});
				this.data.entityUpdated = false;
				this.updateItemPricing();
			}
		}
	},
	updateItemPricing:function() {
		
		log('copyPricing updateItemPricing', '********************');
		var start = new Date().getTime();

		for (var key in this.data.items) {
			var lineId = parseInt(key.split('-')[0]),
				itemId = parseInt(key.split('-')[1]),
				changedFields = [];

		/* Compare lines and fields */
			if (nlapiGetLineItemCount('item') >= lineId) {
				if (nlapiGetLineItemValue('item', 'item', lineId) == itemId) {
					for (var field in this.data.items[key]) {
						var value = nlapiGetLineItemValue('item', field, lineId);
						if (typeof this.data.items[key][field] == 'number') value = parseFloat(value || 0);
						if (value != this.data.items[key][field]) {
							changedFields.push({
								field:field,
								oldValue:this.data.items[key][field],
								newValue:value
							});
						}
					}
				} else {
					console.warn('copyPricing updateItemPricing', {
						lineId:lineId,
						itemId:itemId,
						message:'Line/Item has been altered, cannot restore pricing'
					});
				}
			} else {
				console.warn('copyPricing updateItemPricing', {
					lineId:lineId,
					itemId:itemId,
					message:'Lines have been removed, cannot restore pricing'
				});
			}
		
		/* Update line-fields */
			if (changedFields.length > 0) {
				nlapiSelectLineItem('item', lineId);
				for (var i = 0, count = changedFields.length ; i < count ; i++) {
					nlapiSetCurrentLineItemValue('item', changedFields[i].field, this.data.items[key][changedFields[i].field]);
				}
				nlapiCommitLineItem('item');
				this.updatedLines.push(this.data.items[key]);
				log('copyPricing updateItemPricing', {
					lineId:lineId,
					itemId:itemId,
					changedFields:changedFields,
					originalItemData:this.data.items[key]
				});
			}
			
		}

		log('copyPricing updateItemPricing', {
			updatedLines:this.updatedLines,
			elapsedSeconds:((new Date().getTime()-start)/1000).toFixed(2)
		});
		log('copyPricing updateItemPricing', '********************');
	}
};