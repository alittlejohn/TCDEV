var timestamp = new Date().getTime();
var testData = {
	"_payment": {
		"type": {
			"value": "AuthCC"
		},
		"creditcardtype": {
			"value": "Visa"
		},
		"sourceID": {
			"value": "https://www.regonline.com/builder/site/Default.aspx?EventID=" + timestamp
		},
		"SKU": {
			"value": "SEM-L1-" + timestamp + "-SMNR"
		},
		"transactionID": {
			"value": timestamp
		},
		"date": {
			"value": "07/13/16"
		},
		"amount": {
			"value": "0.01"
		},
		"name": {
			"value": "TEST, TRUECLOUD"
		},
		"description": {
			"value": "TrueCloud Test Transaction"
		},
		"settlementTimeLocal": {
			"value": "2016-07-13T01:47:19-07:00"
		},
		"invoiceNumber": {
			"value": timestamp + "-" + timestamp
		},
		"netnewdate": {
			"value": "09/10/16"
		},
		"locationName": {
			"value": "Reebok CrossFit Velocity"
		},
		"locationAddress1": {
			"value": "Unit 4 Celtic Trade Park"
		},
		"locationAddress2": {
			"value": "Bruce Road, Fforestfach"
		},
		"postalCode": {
			"value": "SA5 4EP"
		},
		"city": {
			"value": "Swansea"
		},
		"state": {
			"value": ""
		},
		"country": {
			"value": "United Kingdom"
		},
		"currencyCode": {
			"value": "GBP"
		},
		"totalAmount": {
			"value": "0.01"
		},
		"taxAmount": {
			"value": "0.00"
		},
		"taxRate": {
			"value": "20"
		}
	}
};

var generic_project = 'GENERIC-PROJECT';

function test() {
	log('TEST START', timestamp);
	log('DATA', testData._payment);
	log('TYPEOF DATA', typeof testData._payment);
	var project = _write_generic_project(
		testData._payment,
		43,
		23,
		24
	);
	log('PROJECT ID', project);
	log('TEST END', timestamp);
}

function _write_generic_project(data, ns_class, item, department) {
	log('Create Project, Start', data);
	var start = new Date().getTime();
	try {

		/* Extract key value from the SKU
			data-element */
			var sku = data.SKU.value, skuclass, skuproject, skuitem, skudepartment;
			if (sku.split('-').length === 4) {
				sku = sku.split('-');
				skuclass = sku[1];
				skuproject = sku[2];
				skuitem = sku[0];
				skudepartment = sku[3];
			} else {
				nlapiLogExecution('AUDIT', 'Unable to deconstruct SKU', JSON.stringify({'value':sku, 'using generic project':true}));
				return generic_project;
			}
			log('SKU-elements', {'sku':sku, 'class':skuclass, 'skuproject':skuproject, 'skuitem':skuitem, 'skudepartment':skudepartment});

		/* Ensure the SKU Class matches one of 
			the following specific values 
			otherwise use the generic project */
			var valid_classes = [
				'CC',
				'KD',
				'L1',
				'T1',
				'L2',
				'DA',
				'DT',
				'EA',
				'ET',
				'FB',
				'GT',
				'GA',
				'KT',
				'KA',
				'LO',
				'MO',
				'PW',
				'R1',
				'R2',
				'SK',
				'ST',
				'WT',
				'WA',
				'AC',
				'CN'
			];
			if (valid_classes.indexOf(skuclass) == -1) {
				nlapiLogExecution('AUDIT', 'Invalid SKU-Class', JSON.stringify({'skuclass':skuclass, 'using generic project':true}));
				return generic_project;
			}

		/* Validate that all mandatory fields exist */
			var values_missing = [];
			if (!skuitem || skuitem != 'SEM') values_missing.push('item'); log('invalid item');
			if (!data.description.value) values_missing.push('companyname'); log('description');
			if (!data.netnewdate.value) values_missing.push('startdate'); log('netnewdate');
			if (!data.country.value) values_missing.push('custentity_country_project'); log('country');
			if (!skuproject) values_missing.push('custentity_integrationcode'); log('skuproject');
			if (!skuclass) values_missing.push('custentity_projectclass'); log('skuclass');
			if (department == 26) values_missing.push('custentity_project_seminar_department (generic department)'); log('custentity_project_seminar_department');
			if (!skudepartment) values_missing.push('custentity_project_seminar_department'); log('custentity_project_seminar_department');
			if (values_missing.length > 0) {
				nlapiLogExecution('AUDIT', 'Unable to create Project, missing mandatory fields', JSON.stringify({'fields missing':values_missing, 'using generic project':true}));
				return generic_project;
			}

		var r = nlapiCreateRecord('job');

			/* Create a Project Name, ensure length of
				name and replace any specific values 
				in the data */
				var companyname = data.description.value;
				var replace_values = [], replaced = false;
				for (var i = 0, count = replace_values.length ; i < count ; i++) {
					if (companyname.indexOf(replace_values[i]) != -1) {
						companyname = companyname.replace(replace_values[i], '');
						replaced = true;
					}
				}
				var maxlength = 83;
				if (companyname.length > 83) {
					companyname = companyname.slice(0, 83);
					replaced = true;
				}
				if (replaced) log('Company Name Truncation', {'companyname':companyname, 'original':data.description.value});

			r.setFieldValue('custentity_countrycustomrecord', _listelement(data.country.value || 'Not Specified', 'customrecord_country'));

			/* Determine Customer */
				var outsidecountry = false;

					//Case 8881 - Check to see if transaction is USD or not.  If not USD check to see if there is a tax rate.
					//If no tax rate, then it is considered missing data and needs to be assigned to a specific customer. 
					if (data.currencyCode.value != "USD"){
						if (data.taxRate) {
							if (parseFloat(data.taxRate.value) > 0) {
								if (r.getFieldText('custentity_countrycustomrecord') == 'United Kingdom') {
									outsidecountry = true;
									r.setFieldValue('parent', 46919);
									r.setFieldValue('currency', '2');
									r = create_address(r, 'United Kingdom', data.state.value, data.city.value, data.postalCode.value, data.locationAddress1.value, data.locationAddress2.value, data.locationName.value);
									// record, country, state, city, zip, addr1, addr2, attn
								}
								if (r.getFieldText('custentity_countrycustomrecord') == 'Germany') {
									outsidecountry = true;
									r.setFieldValue('parent', 46919);
									r.setFieldValue('currency', '4');
									r = create_address(r, 'Germany', data.state.value, data.city.value, data.postalCode.value, data.locationAddress1.value, data.locationAddress2.value, data.locationName.value);
									// record, country, state, city, zip, addr1, addr2, attn
								}
							}
						}
						else{ //This is a foriegn transaction without a taxRate. Considered missing data and needs to be set to generic_europe_customer (id 1143)
							outsidecountry = true;
							r.setFieldValue('parent', 1143); //1011 Generic Customer
							r.setFieldValue('currency', '2');
							r = create_address(r, 'United Kingdom', data.state.value, data.city.value, data.postalCode.value, data.locationAddress1.value, data.locationAddress2.value, data.locationName.value);
							// record, country, state, city, zip, addr1, addr2, attn
						}
					}
					
					//If this is a USD transaction, set to Weekend Seminar
					if (!outsidecountry) {
						r.setFieldValue('parent', generic_customer); // 1001 Weekend Seminar
					}

				log('Customer on Project determination', {
					'taxRate':data.taxRate,
					'customer':r.getFieldText('parent')
				});

			r.setFieldValue('companyname', companyname);
			r.setFieldValue('custentity_projectname', data.description.value || '');
			r.setFieldValue('startdate', change_date(data.netnewdate.value || ''));
			r.setFieldValue('custentity_countrycustomrecord', _listelement(data.country.value, 'customrecord_country'));
			r.setFieldValue('custentity_project_city', data.city.value || '');
			r.setFieldValue('custentity_statecustomrecord', _listelement(data.state.value, 'customrecord_state'));
			r.setFieldValue('custentity_integrationcode', skuproject);
			r.setFieldValue('custentity_projectclass', ns_class);
			r.setFieldValue('custentity_project_seminar_department', department);
			r.setFieldValue('entitystatus', 2);

			/* Set the NuTravel field based on custom logic */
				var nutravel_skus = ['CC', 'KD', 'L1', 'L2'];
				if (nutravel_skus.indexOf(skuclass) != -1) {
					var nutravel = '', city = false, state = false, country = false, projstart = change_date(data.netnewdate.value || '');
					if (data.city.value) {
						nutravel += data.city.value;
						city = true;
					}
					if (data.state.value) {
						if (!nutravel) {
							nutravel += data.state.value;
						} else {
							nutravel += ', ' + data.state.value;
						}
						state = true;
					}
					if (!city || !state && data.country.value) {
						if (!nutravel) {
							nutravel += data.country.value;
						} else {
							nutravel += ', ' + data.country.value;
						}
						country = true;
					}
					if (skuclass) {
						if (!nutravel) {
							nutravel += skuclass;
						} else {
							nutravel += ', ' + skuclass;
						}
					}
					if (projstart) {
						if (!nutravel) {
							nutravel += projstart;
						} else {
							nutravel += ', ' + projstart;
						}
					}
					log('nutravel', nutravel);
					r.setFieldValue('custentity_nutravelname', nutravel);
				}

			/* If the SKU Class matches any of the 
				values below, enable the subsequent
				fields */
				var nexonia_skus = ['L1', 'L2', 'CC', 'KD'];
				if (nexonia_skus.indexOf(skuclass) != -1) {
					r.setFieldValue('custentity_nexonia', 'T');
					r.setFieldValue('custentity_projectmanager', nlapiGetContext().getSetting('SCRIPT', 'custscript_projectmanager') || '');
					r.setFieldValue('custentity_financeapprover', 2872);
				} else {
					r.setFieldValue('custentity_nexonia', 'F');
					r.setFieldValue('custentity_projectmanager', '');
					r.setFieldValue('custentity_financeapprover', '');
				}

		r = nlapiSubmitRecord(r, true, true);
		log('CREATED PROJECT', {'internalid':r, 'elapsedtime(seconds)':((new Date().getTime()-start)/1000).toFixed(2)});
		return r;

	} catch (e) {
		if (e instanceof nlobjError) {
			nlapiLogExecution('ERROR', 'Write Project Error (NetSuite)', e.getDetails()+' | '+e.getStackTrace());
			return generic_project;
		} else {
			nlapiLogExecution('ERROR', 'Write Project Error (JavaScript)', e.toString());
			return generic_project;
		}
	}
}

function _listelement(value, type) {
	if (!value) return '';
	var filter = [];
		filter.push(new nlobjSearchFilter('name', null, 'is', value));
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
	var column = [];
		column.push(new nlobjSearchColumn('internalid').setSort());
	var results = nlapiSearchRecord(type, null, filter, column) || [];
	if (results.length > 0) return results[0].getId();
	var r = nlapiCreateRecord(type);
		r.setFieldValue('name', value);
	return nlapiSubmitRecord(r, true, true);
}

function create_address(record, country, state, city, zip, addr1, addr2, addressee) {
	record.selectNewLineItem('addressbook');
	record.setCurrentLineItemValue('addressbook', 'defaultshipping', 'T');
	record.setCurrentLineItemValue('addressbook', 'defaultbilling', 'T');
	record.setCurrentLineItemValue('addressbook', 'label', addressee);
	record.setCurrentLineItemValue('addressbook', 'isresidential', 'T');

	//create address subrecord
	var subrecord = record.createCurrentLineItemSubrecord('addressbook', 'addressbookaddress');

	//set subrecord fields
	subrecord.setFieldValue('country', country); //Country must be set before setting the other address fields
	subrecord.setFieldValue('addressee', addressee);
	subrecord.setFieldValue('addr1', addr1);
	subrecord.setFieldValue('addr2', addr2);
	subrecord.setFieldValue('city', city);
	subrecord.setFieldValue('dropdownstate', state);
	subrecord.setFieldValue('zip', zip);

	//commit subrecord and line item
	subrecord.commit();
	record.commitLineItem('addressbook');

	return record;
}

function change_date(data) {
	if (!data) return '';
	var date_elements = data.split('/');
	return date_elements[0]+'/'+date_elements[1]+'/20'+date_elements[2];
}

function log(t, d) {
	if (typeof d == 'object') d = JSON.stringify(d);
	nlapiLogExecution('DEBUG', t, d);
}