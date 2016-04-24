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

/* Get Results */

function get_results(billing_frequency, date, test_contract) {
    log('get_results', '*****');

    log('filter values', {
        'billing_frequency': billing_frequency,
        'date': date,
        'test_contract': test_contract
    });

    var filter = [],
        column = [],
        data = [];

    var isEndOfMonth = moment(new Date()).endOf('month').format('MM/DD/YYYY') === moment(new Date()).format('MM/DD/YYYY');

    var TEST_CUSTOMER = 46; // 1003 Test company
    var RENTALS_R_US = 16;
    var BLACKLIST = [ /*TEST_CUSTOMER,*/ RENTALS_R_US];
    /* Ensure that the Month Start Billing Frequency is only run if Today is the start of a Month */
    // contract blacklist
    var contractBlackList = ['115626','131043','131045','131047'];


    if (test_contract) filter.push(new nlobjSearchFilter('internalid', null, 'anyof', [test_contract]));
    filter.push(new nlobjSearchFilter('type', null, 'is', 'SalesOrd'));
    filter.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
    filter.push(new nlobjSearchFilter('internalid', 'customer', 'noneof', BLACKLIST));
    // contract blacklist
    filter.push(new nlobjSearchFilter('internalid', null, 'noneof', contractBlackList));
    
    filter.push(new nlobjSearchFilter('custbody_salecontract', null, 'is', 'F'));
    //  filter.push(new nlobjSearchFilter('custbody_autopaymentmethod', null, 'anyof', [1, 2, '@NONE@']));
    if (billing_frequency != 'd') {
        filter.push(new nlobjSearchFilter('custbody_billingfrequency', null, 'is', billing_frequency));
        filter.push(new nlobjSearchFilter('custbody_offrent', null, 'notonorbefore', nlapiDateToString(new Date())));
        if (date && billing_frequency == 1) {
            filter.push(new nlobjSearchFilter('custbody_lastinvoicedate', null, 'onorbefore', date));
        } else if (date && billing_frequency == 2) {
            /* # Case 7144. If its the end of the month. Grab all invoices created on days outside this months day range. */
            var date_operator = isEndOfMonth ? 'greaterthanorequalto' : 'equalto';
            filter.push(new nlobjSearchFilter('custbody_original_invoice_date', null, date_operator, [moment(new Date()).format('DD')]));
        }
    } else {
        filter.push(new nlobjSearchFilter('custbody_deferredbilling', null, 'onorbefore', nlapiDateToString(new Date())));
        filter.push(new nlobjSearchFilter('custbody_lastinvoice', null, 'is', '@NONE@'));
        filter.push(new nlobjSearchFilter('custbody_deferredbillingapproval', null, 'is', 'T'));
    }
    column.push(new nlobjSearchColumn('tranid', null, null));
    column.push(new nlobjSearchColumn('entity', null, null));
    column.push(new nlobjSearchColumn('custbody_lastinvoice', null, null));
    column.push(new nlobjSearchColumn('custbody_autopaymentmethod', null, null));
    column.push(new nlobjSearchColumn('total', null, null));
    column.push(new nlobjSearchColumn('custbody_original_invoice_date', null, null));
    var results = nlapiSearchRecord('transaction', null, filter, column);
    if (!results) return data;
    for (var i = 0, count = results.length; i < count; i++) {
        var result = {
            'internalid': results[i].getId(),
            'tranid': results[i].getValue('tranid', null, null),
            'entity': results[i].getText('entity', null, null),
            'custbody_lastinvoice': results[i].getValue('custbody_lastinvoice', null, null),
            'custbody_original_invoice_date': results[i].getValue('custbody_original_invoice_date', null, null),
            'auto_pay': results[i].getValue('custbody_autopaymentmethod', null, null),
            'total': results[i].getValue('total', null, null)
        };
        log((i + 1) + '/' + count, result);
        data.push(result);
    }

    log('get_results', '-----');

    return data;
}

/* START AUTO-PAY */

function get_credit_card(customer) {
    var c = nlapiLoadRecord('customer', customer);
    var cc_index = parseInt(c.findLineItemValue('creditcards', 'ccdefault', 'T'), 10);
    if (cc_index > 0) return c.getLineItemValue('creditcards', 'internalid', cc_index);
    return null;
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
    // p.setFieldValue('department', invoice_values.department);
    // p.setFieldValue('class', invoice_values['class']);
    // p.setFieldValue('location', invoice_values['location']);

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

/* END AUTO-PAY */

function scheduled() {
    var billing_frequency = [1, 2, 'd']; // 1 - 28 Days, 2 - Month Start, d - Deferred

    var test_contract = nlapiGetContext().getSetting('SCRIPT', 'custscript_testcontract');
    if (test_contract) nlapiLogExecution('AUDIT', 'TESTING START', 'Test Contract: ' + test_contract);

    // get Today - 28 days ago
    var last_invoice_date = nlapiDateToString(nlapiAddDays(new Date(), -28));
    var early_last_invoice_date = nlapiDateToString(nlapiAddDays(new Date(), -14));
    var today = nlapiDateToString(new Date());
    log('scheduled start', [JSON.stringify(billing_frequency), last_invoice_date, today]);

    for (var b = 0, count_b = billing_frequency.length; b < count_b; b++) {

        /* Get Results */
        var results_normal = get_results(billing_frequency[b], last_invoice_date, test_contract);
        log('results_normal length', results_normal.length);
        // var results_early = get_early_results(billing_frequency[b], early_last_invoice_date, test_contract);
        // log('results_early length', results_early.length);
        // var results = results_normal.concat(results_early);
        var results = results_normal;
        log('Billing Frequency: ' + billing_frequency[b], 'results.length: ' + results.length);

        for (var i = 0, count = results.length; i < count; i++) {
            log('**START**');
            log('Billing Frequency [' + (b + 1) + '/' + (billing_frequency.length) + '] Result [' + (i + 1) + '/' + (results.length) + ']', {
                'Billing Frequency': billing_frequency[b],
                'Sales Order': results[i].internalid,
                'Customer': results[i].entity,
                'Copying Invoice': results[i].custbody_lastinvoice
            });

            log('Last Invoice Information', {
                'last invoice amount': results[i].custbody_lastinvoice ? nlapiLookupField('invoice', results[i].custbody_lastinvoice, 'total') : undefined,
                'Invoice URL': results[i].custbody_lastinvoice ? 'https://system.na1.netsuite.com' + nlapiResolveURL('RECORD', 'invoice', results[i].custbody_lastinvoice) : undefined
            });

            /* Create Invoice */
            var record;
            if (billing_frequency[b] !== 'd') {
                if (!results[i].custbody_lastinvoice) {
                    log('Does not have a Last Invoice', 'Will not be copying and creating a new Invoice');
                    continue;
                }
                record = nlapiCopyRecord('invoice', results[i].custbody_lastinvoice);

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
            } else {
                record = nlapiTransformRecord('salesorder', results[i].internalid, 'invoice');
            }

            /* Handle Email Address logic
                Updated on 11/11/2015 as per Tasha
                */
                var preferences = nlapiLookupField('customer', record.getFieldValue('entity'), ['emailtransactions', 'faxtransactions', 'email', 'fax', 'custentity_recurringbillingemails']);
                var email = preferences.custentity_recurringbillingemails || preferences.email;
                var fax = record.getFieldValue('fax') || preferences.fax;
                var communicated;
                if (preferences.emailtransactions == 'T') {
                    if (email) {
                        record.setFieldValue('tobeemailed', 'T');
                        record.setFieldValue('email', email);
                        communicated = 'email';
                    } else {
                        record.setFieldValue('tobeprinted', 'T');
                        communicated = 'print';
                    }
                } else if (preferences.faxtransactions == 'T') {
                    if (fax) {
                        record.setFieldValue('tobefaxed', 'T');
                        record.setFieldValue('fax', email);
                        communicated = 'fax';
                    } else {
                         record.setFieldValue('tobeprinted', 'T');
                         communicated = 'print';
                    }
                } else {
                    record.setFieldValue('tobeprinted', 'T');
                    communicated = 'print';
                }
                log('Email Preferences, Invoice Creation', {
                    'emailtransactions':preferences.emailtransactions,
                    'faxtransactions':preferences.faxtransactions,
                    'email':email,
                    'fax':fax,
                    'communicationMethod':communicated
                });

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

            log('***END***');

            /* Reschedule the script if necessary */
            if (nlapiGetContext().getRemainingUsage() <= 500) {
                log('RESCHEDULING SCRIPT');
                nlapiScheduleScript(nlapiGetContext().getScriptId(), nlapiGetContext().getDeploymentId(), null);
                break;
            }
        }
    }

    if (test_contract) nlapiLogExecution('AUDIT', 'TESTING END', '');

    log('***END***', '*** END SCHEDULED PROCESS ***');
}
