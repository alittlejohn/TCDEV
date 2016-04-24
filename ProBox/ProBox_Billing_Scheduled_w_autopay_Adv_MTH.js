// -------------------------------------------------------
// ProBox_Billing_Schedule_w_autopay_Adv_MTH.js
// 
//  DESC: This script is responsible for Advanced billing
//        on contracts with two scenarios:
//         
//        #1 : bill today last month
//        #2 : if today is end of the month, bill rest of 
//             the days leftover from last month
//
//  Tags: #Case 7681
// -------------------------------------------------------

// get today's date last month
var today = nlapiDateToString( new Date() );
var todayLastMonth = getDayLastMonth( today );

// other global vars
var global_context = nlapiGetContext();
var global_start_time = new Date();
var context = nlapiGetContext();
var clientID = context.getCompany();
var environment = context.getEnvironment();
var scriptID = context.getScriptId();
var deploymentID = context.getDeploymentId();

// for scenario #2
var isEndOfMonth = moment(new Date()).endOf('month').format('MM/DD/YYYY') === moment(new Date()).format('MM/DD/YYYY');

var test = scheduled();

/* END AUTO-PAY */
function scheduled() {

    var billing_frequency = 2;

    var test_contract = ['115626','131043','131045','131047'];

    // Scenario #1 - Bill last month's "Today"
    var results1 = get_results(billing_frequency, todayLastMonth, test_contract);
    log('results1 length', results1.length);

    if(results1){

        billContract( results1 );
        log('Billing Frequency: ' + billing_frequency, 'results Scenario #1 : ' + results1);
    }

    // Scenario #2 - If there are remaining days from last month that are greater than 
    //               today's end of the month, bill them too. 
    if(isEndOfMonth){

        // get necessary last months attributes
        var lastMonth = todayLastMonth.split('/');
        var numLastMonth = lastMonth[0];

        // get last month's last day
        var lastMonthLastDayStr = moment(lastMonthDateObj).endOf('month').format('MM/DD/YYYY');
        var lastMonthAry = lastMonthLastDayStr.split('/');
        var numLastMonthLastDay = lastMonthAry[1];

        // get todays attributes
        var dateAry = today.split('/');
        var numericDay = dateAry[1];
        var numericYear = dateAry[2];

        // check to see if we have more days last month than today
        var greaterDays = (numericDay < numLastMonthLastDay ? true : false);

        // if we have days leftover, from last month, we create a new date range filter
        if(greaterDays){

            var range = [];

            var start = numLastMonth + '/' + (parseInt(numericDay)+1) + '/' + numericYear;
            range.push(start);

            var end = numLastMonth +'/' + parseInt(numLastMonthLastDay) + '/' +numericYear;
            range.push(end); 

            var filter = new nlobjSearchFilter('custbody_lastinvoicedate', null, 'within', range);
            var getResult2 = get_results(billing_frequency, todayLastMonth, test_contract, filter);

            if(getResult2){

                billContract( getResult2 );
                log('Billing Frequency: ' + billing_frequency, 'results Scenario #1 : ' + getResult2);
            }
        }
    }

    log('***END***', '*** END SCHEDULED PROCESS ***');
}

function billContract(results, dateRange){

    var title = 'billContract';

    for (var i = 0; i < results.length; i++) {

        if (!results[i].custbody_lastinvoice) {
            log('Does not have a Last Invoice', 'Will not be copying and creating a new Invoice');
            continue;
        }

        var record = nlapiCopyRecord('invoice', results[i].custbody_lastinvoice);

        /* INSERT LOGIC TO SET INVOICE's ADDRESS FIELDS FROM CONTRACT */
        var SalesOrderId = results[i].internalid;
        try {

            var salesOrder = nlapiLoadRecord('salesorder', SalesOrderId);
            var shipAddress = salesOrder.getFieldValue('shipaddress');
            var customer = salesOrder.getFieldValue('entity');

            var customerRecord = nlapiLoadRecord('customer', customer);
            var index = customerRecord.findLineItemValue('addressbook', 'addrtext', shipAddress);
            var addressId = customerRecord.getLineItemValue('addressbook', 'addressid', index);
            record.setFieldValue('shipaddresslist', addressId);

        } catch (e) {
            log('error occured while changing address', e);
        }

        /* INSERT LOGIC TO SET INVOICE's ADDRESS FIELDS FROM CONTRACT */
        record.setFieldValue('customform', 107);
        for (var ii = record.getLineItemCount('item'), count_ii = 1; ii >= count_ii; ii--) {

            var item = record.getLineItemValue('item', 'item', ii);
            var item_type = record.getLineItemValue('item', 'itemtype', ii);
            if (item_type == 'OthCharge' || item_type == 'NonInvtPart' || item_type == 'Markup') {
                var ns_class = nlapiLookupField('item', item, 'class');
                if (ns_class != 1 && item_type != 'EndGroup' && item_type != 'Group' && item_type != 'Markup') {
                    log('Removing Item: ' + item + ', Type: ' + item_type, 'Index: ' + ii);
                    record.removeLineItem('item', ii);
                }
            } else if (item_type != 'EndGroup' && item_type != 'Group') {
                log('Removing Item: ' + item + ', Type: ' + item_type, 'Index: ' + ii);
                record.removeLineItem('item', ii);
            }
        }

        record.setFieldValue('custbody_contract', results[i].internalid);

        if (results[i].auto_pay == 3) {
            record.setFieldValue('tobeemailed', 'T');
            record.setFieldValue('tobefaxed', 'F');
            record.setFieldValue('tobeprinted', 'F');
        }

        /* Validate that an Email Address exists on the Invoice when being copied */
        if (record.getFieldValue('tobeemailed') == 'T' && !record.getFieldValue('email')) {
            var cust_email = nlapiLookupField('customer', record.getFieldValue('entity'), 'email');
            if (cust_email) {
                record.setFieldValue('email', cust_email);
            } else {
                record.setFieldValue('tobeemailed', 'F');
                record.setFieldValue('tobeprinted', 'T');
            }
        }

        if (record.getFieldValue('entity') == 1437) {
            record.setFieldValue('email', '');
        }

        /* Submit Invoice record */
        try {

            record = nlapiSubmitRecord(record, false, true);
            log('Invoice Generated', record);

        } catch (e) {

            if (e instanceof nlobjError) {
                nlapiLogExecution('ERROR', 'NetSuite-Error Creating Invoice', 'Code: ' + e.getCode() + '<br>Details: ' + e.getDetails());
                nlapiSubmitField('salesorder', results[i].internalid, 'custbody_automationerror', e.getDetails());
                log('***END***');
                continue;
            } else {
                nlapiLogExecution('ERROR', 'JavaScript-Error Creating Invoice', '');
                nlapiSubmitField('salesorder', results[i].internalid, 'custbody_automationerror', 'Error creating Invoice');
                log('***END***');
                continue;
            }

        }

        /* Update the original Sales Order (Contract) with the last billing information */
        nlapiSubmitField('salesorder', results[i].internalid, ['custbody_lastinvoice', 'custbody_lastinvoicedate'], [record, today]);

        /* Create a Payment record against the Invoice if Auto-Payment is enabled */
        var auto_pay = results[i].auto_pay;
        if (auto_pay == 1 || auto_pay == 2) {
            generate_payment(record, auto_pay, results[i].internalid);
        } else {
            log('Contract not setup for Auto-Payment', 'Auto-Payment Method: ' + auto_pay);
        }

        // check the usage units and yield the script if necessary              
        checkGovernance(400, 'Yield Script vars: start '+0+' end: '+0 +' index: '+0);
    }    
    return;
}

/* Get Results */
function get_results(billing_frequency, date, test_contract, dateRange){

    log('filter values', {
        'billing_frequency': billing_frequency,
        'date': date,
        'test_contract': test_contract
    });

    var TEST_CUSTOMER = 46; // 1003 Test company
    var RENTALS_R_US = 16;
    var BLACKLIST = [RENTALS_R_US];
    var filter = [], column = [], data = [];

    //date = '12/30/2015';

    // Case 7681 : Advanced Monthly Billing
    if( billing_frequency == 2 ){

        /* Ensure that the Month Start Billing Frequency is only run if Today is the start of a Month */
        if (test_contract) filter.push(new nlobjSearchFilter('internalid', null, 'anyof', test_contract));
        filter.push(new nlobjSearchFilter('type', null, 'is', 'SalesOrd'));
        filter.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
        filter.push(new nlobjSearchFilter('internalid', 'customer', 'noneof', BLACKLIST));
        filter.push(new nlobjSearchFilter('custbody_salecontract', null, 'is', 'F'));
        filter.push(new nlobjSearchFilter('custbody_billingfrequency', null, 'is', billing_frequency));
        filter.push(new nlobjSearchFilter('custbody_offrent', null, 'notonorbefore', nlapiDateToString(new Date())));  

        // scenario 1 vs scenario 2
        if(!dateRange) filter.push(new nlobjSearchFilter('custbody_lastinvoicedate', null, 'on', date));
        if(dateRange) filter.push(dateRange);

        column.push(new nlobjSearchColumn('tranid', null, null));
        column.push(new nlobjSearchColumn('entity', null, null));
        column.push(new nlobjSearchColumn('custbody_lastinvoice', null, null));
        column.push(new nlobjSearchColumn('custbody_autopaymentmethod', null, null));
        column.push(new nlobjSearchColumn('total', null, null));
        column.push(new nlobjSearchColumn('custbody_original_invoice_date', null, null));
        column.push(new nlobjSearchColumn('custbody_lastinvoicedate', null, null));

        var results = nlapiSearchRecord('transaction', null, filter, column);
        if (!results) return false;
        
        for (var i = 0, count = results.length; i < count; i++) {

            var result = {
                'internalid': results[i].getId(),
                'tranid': results[i].getValue('tranid', null, null),
                'entity': results[i].getText('entity', null, null),
                'custbody_lastinvoice': results[i].getValue('custbody_lastinvoice', null, null),
                'custbody_original_invoice_date': results[i].getValue('custbody_original_invoice_date', null, null),
                'auto_pay': results[i].getValue('custbody_autopaymentmethod', null, null),
                'total': results[i].getValue('total', null, null),
                'last_invoice_date' : results[i].getValue('custbody_lastinvoicedate', null, null)
            };

            log((i + 1) + '/' + count, result);
            data.push(result);
        }
        return data;
    }
}

function generate_payment(invoice, auto_pay, salesorder) {

    log('--START--', 'Create Payment');
    var p = nlapiTransformRecord('invoice', invoice, 'customerpayment');
    var invoice_index = parseInt(p.findLineItemValue('apply', 'apply', 'T'), 10);
    var invoice_due = parseFloat(p.getLineItemValue('apply', 'due', invoice_index) || 0);
    var customer = p.getFieldValue('customer');
    log('Invoice Amount', invoice_due);

    /* Invoice Department/Class/Location */
    var invoice_values = nlapiLookupField('invoice', invoice, ['department', 'class', 'location']);
    log('Classifications from Invoice', invoice_values);

    /* Apply existing Deposits to Invoice (if any exist) */
    for (var i = 1, count = p.getLineItemCount('deposit'); i <= count; i++) {
        var deposit_amount = parseFloat(p.getLineItemValue('deposit', 'remaining', i) || 0);
        if (deposit_amount > 0) {
            p.setLineItemValue('deposit', 'apply', i, 'T');
            log('Applied Deposit', 'Deposit Line Index: ' + i + '<br>Deposit Amount: ' + deposit_amount);
            invoice_due = invoice_due - deposit_amount;
            log('Invoice Amount (remaining)', invoice_due);
        }
    }

    /* Create Payment for remaining Amount Due */
    if (invoice_due > 0) {
        var payment_amount = p.getFieldValue('payment');
        log('Creating Payment', 'Amount Due: ' + invoice_due + '<br>Payment Amount: ' + payment_amount);
        log('Payment Method', auto_pay == 1 ? 'Credit Card' : 'ACH');
        if (auto_pay == 1) {
            var cc_id = get_credit_card(customer);
            if (cc_id) {
                p.setFieldValue('undepfunds', 'T');
                p.setFieldValue('creditcard', cc_id);
            } else {
                log('---END---', 'Failed to Create Payment (Missing Default Credit Card)');
                nlapiSubmitField('invoice', invoice, 'custbody_automationerror', 'Failed to Create Payment (Missing Default Credit Card)');
                return;
            }
        } else {
            p.setFieldValue('account', 128);
            p.setFieldValue('paymentmethod', 7);
        }
    }

    /* Submit Payment */
    try {

        p = nlapiSubmitRecord(p, true, true);
        nlapiSubmitField('customerpayment', p, ['department', 'class', 'location'], [invoice_values.department, invoice_values['class'], invoice_values['location']]);

    } catch (e) {
        if (e instanceof nlobjError) {
            nlapiLogExecution('ERROR', 'NetSuite-Error Creating Payment', 'Code: ' + e.getCode() + '<br>Details: ' + e.getDetails());
            log('NetSuite-Error Creating Payment', 'Code: ' + e.getCode() + '<br>Details: ' + e.getDetails());
            nlapiSubmitField('invoice', invoice, 'custbody_automationerror', e.getDetails());
            log('---END---', 'Failed to Create Payment (NetSuite-Error)');
            return;
        } else {
            nlapiLogExecution('ERROR', 'JavaScript-Error Creating Payment', '');
            log('JavaScript-Error Creating Payment', '');
            nlapiSubmitField('invoice', invoice, 'custbody_automationerror', 'Error creating Payment');
            log('---END---', 'Failed to Create Payment (JavaScript-Error)');
            return;
        }
    }

    /* Update Invoice to use "Receipt" form */
        var communicated = false;
        var customer_pref = nlapiLookupField('customer', customer, ['emailtransactions', 'printtransactions', 'faxtransactions', 'email', 'fax', 'custentity_recurringbillingemails']);
        var inv = nlapiLoadRecord('invoice', invoice);
            inv.setFieldValue('customform', 119);

        if (customer_pref.emailtransactions == 'T' && (customer_pref.custentity_recurringbillingemails || customer_pref.email)) {
            inv.setFieldValue('tobeemailed', 'T');
            inv.setFieldValue('email', customer_pref.custentity_recurringbillingemails || customer_pref.email);
            communicated = true;
            log('Invoice set to "Receipt Form"', 'Emailed');
        }
        if (customer_pref.faxtransactions == 'T' && customer_pref.fax && !communicated) {
            inv.setFieldValue('tobefaxed', 'T');
            inv.setFieldValue('fax', customer_pref.fax);
            communicated = true;
            log('Invoice set to "Receipt Form"', 'Faxed');
        }
        if (!communicated) {
            inv.setFieldValue('tobeprinted', 'T');
            communicated = true;
            log('Invoice set to "Receipt Form"', 'Printed');
        }

    nlapiSubmitRecord(inv, false, true);

    log('---END---', 'Created Payment (' + JSON.stringify(p) + ')');
}

// gets today last month with param 'MM/DD/YYYY'
function getDayLastMonth(date){

  var day = date.split('/')[1];
  var d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth()-1);
    
    return (d.getMonth()+1)+'/'+day+'/'+d.getFullYear();
}

/* START AUTO-PAY */
function get_credit_card(customer) {
    var c = nlapiLoadRecord('customer', customer);
    var cc_index = parseInt(c.findLineItemValue('creditcards', 'ccdefault', 'T'), 10);
    if (cc_index > 0) return c.getLineItemValue('creditcards', 'internalid', cc_index);
    return null;
}

// check the script governance and reset recovery point
function checkGovernance(threshold, message) {

    elapsed_time_threshold = 55;
    threshold = threshold + 100 || 200;
    message = message || '';
    var points = global_context.getRemainingUsage();
    var current_time = new Date();
    var elapsed_time = ((current_time - global_start_time) / 60000).toFixed(2);

    if (points < threshold || elapsed_time >= elapsed_time_threshold) {

        var state = nlapiYieldScript();

        if (state.status == 'FAILURE') {
            nlapiLogExecution("ERROR", "Failed to yield script, exiting: Reason = " + state.reason + " / Size = " + state.size);
            throw "Failed to yield script";
        } else if (state.status == 'RESUME') {
            nlapiLogExecution("AUDIT", "Resuming script because of " + state.reason + ".  Size = " + state.size);
        }
    }
    return points;
}

/* Generic Logging Function */
function log(message, details) {
    if (typeof details == 'object') details = JSON.stringify(details);
    var context = {
        'P': nlapiGetContext().getRemainingUsage(),
        'C': nlapiGetContext().getExecutionContext(),
        'D': nlapiGetContext().getDeploymentId(),
        'U': nlapiGetUser()
    };
    message = message === undefined ? '[No Message Specified]' : message;
    details = details === undefined ? '' : details;
    nlapiLogExecution('DEBUG', message, details);
}
