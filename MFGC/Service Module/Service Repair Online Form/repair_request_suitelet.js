/* Mustache.js */
	/*!
	 * mustache.js - Logic-less {{mustache}} templates with JavaScript
	 * http://github.com/janl/mustache.js
	 */

	/*global define: false Mustache: true*/

	(function defineMustache(global, factory) {
		if (typeof exports === 'object' && exports) {
			factory(exports); // CommonJS
		} else if (typeof define === 'function' && define.amd) {
			define(['exports'], factory); // AMD
		} else {
			Mustache = {};
			factory(Mustache); // script, wsh, asp
		}
	}(this, function mustacheFactory(mustache) {

		var objectToString = Object.prototype.toString;
		var isArray = Array.isArray || function isArrayPolyfill(object) {
				return objectToString.call(object) === '[object Array]';
			};

		function isFunction(object) {
			return typeof object === 'function';
		}

		function escapeRegExp(string) {
			return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
		}

		/**
		 * Null safe way of checking whether or not an object,
		 * including its prototype, has a given property
		 */

		function hasProperty(obj, propName) {
			return obj != null && typeof obj === 'object' && (propName in obj);
		}

		// Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
		// See https://github.com/janl/mustache.js/issues/189
		var regExpTest = RegExp.prototype.test;

		function testRegExp(re, string) {
			return regExpTest.call(re, string);
		}

		var nonSpaceRe = /\S/;

		function isWhitespace(string) {
			return !testRegExp(nonSpaceRe, string);
		}

		var entityMap = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;',
			'/': '&#x2F;'
		};

		function escapeHtml(string) {
			return String(string).replace(/[&<>"'\/]/g, function fromEntityMap(s) {
				return entityMap[s];
			});
		}

		var whiteRe = /\s*/;
		var spaceRe = /\s+/;
		var equalsRe = /\s*=/;
		var curlyRe = /\s*\}/;
		var tagRe = /#|\^|\/|>|\{|&|=|!/;

		/**
		 * Breaks up the given `template` string into a tree of tokens. If the `tags`
		 * argument is given here it must be an array with two string values: the
		 * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
		 * course, the default is to use mustaches (i.e. mustache.tags).
		 *
		 * A token is an array with at least 4 elements. The first element is the
		 * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
		 * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
		 * all text that appears outside a symbol this element is "text".
		 *
		 * The second element of a token is its "value". For mustache tags this is
		 * whatever else was inside the tag besides the opening symbol. For text tokens
		 * this is the text itself.
		 *
		 * The third and fourth elements of the token are the start and end indices,
		 * respectively, of the token in the original template.
		 *
		 * Tokens that are the root node of a subtree contain two more elements: 1) an
		 * array of tokens in the subtree and 2) the index in the original template at
		 * which the closing tag for that section begins.
		 */

		function parseTemplate(template, tags) {
			if (!template)
				return [];

			var sections = []; // Stack to hold section tokens
			var tokens = []; // Buffer to hold the tokens
			var spaces = []; // Indices of whitespace tokens on the current line
			var hasTag = false; // Is there a {{tag}} on the current line?
			var nonSpace = false; // Is there a non-space char on the current line?

			// Strips all whitespace tokens array for the current line
			// if there was a {{#tag}} on it and otherwise only space.

			function stripSpace() {
				if (hasTag && !nonSpace) {
					while (spaces.length)
						delete tokens[spaces.pop()];
				} else {
					spaces = [];
				}

				hasTag = false;
				nonSpace = false;
			}

			var openingTagRe, closingTagRe, closingCurlyRe;

			function compileTags(tagsToCompile) {
				if (typeof tagsToCompile === 'string')
					tagsToCompile = tagsToCompile.split(spaceRe, 2);

				if (!isArray(tagsToCompile) || tagsToCompile.length !== 2)
					throw new Error('Invalid tags: ' + tagsToCompile);

				openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + '\\s*');
				closingTagRe = new RegExp('\\s*' + escapeRegExp(tagsToCompile[1]));
				closingCurlyRe = new RegExp('\\s*' + escapeRegExp('}' + tagsToCompile[1]));
			}

			compileTags(tags || mustache.tags);

			var scanner = new Scanner(template);

			var start, type, value, chr, token, openSection;
			while (!scanner.eos()) {
				start = scanner.pos;

				// Match any text between tags.
				value = scanner.scanUntil(openingTagRe);

				if (value) {
					for (var i = 0, valueLength = value.length; i < valueLength; ++i) {
						chr = value.charAt(i);

						if (isWhitespace(chr)) {
							spaces.push(tokens.length);
						} else {
							nonSpace = true;
						}

						tokens.push(['text', chr, start, start + 1]);
						start += 1;

						// Check for whitespace on the current line.
						if (chr === '\n')
							stripSpace();
					}
				}

				// Match the opening tag.
				if (!scanner.scan(openingTagRe))
					break;

				hasTag = true;

				// Get the tag type.
				type = scanner.scan(tagRe) || 'name';
				scanner.scan(whiteRe);

				// Get the tag value.
				if (type === '=') {
					value = scanner.scanUntil(equalsRe);
					scanner.scan(equalsRe);
					scanner.scanUntil(closingTagRe);
				} else if (type === '{') {
					value = scanner.scanUntil(closingCurlyRe);
					scanner.scan(curlyRe);
					scanner.scanUntil(closingTagRe);
					type = '&';
				} else {
					value = scanner.scanUntil(closingTagRe);
				}

				// Match the closing tag.
				if (!scanner.scan(closingTagRe))
					throw new Error('Unclosed tag at ' + scanner.pos);

				token = [type, value, start, scanner.pos];
				tokens.push(token);

				if (type === '#' || type === '^') {
					sections.push(token);
				} else if (type === '/') {
					// Check section nesting.
					openSection = sections.pop();

					if (!openSection)
						throw new Error('Unopened section "' + value + '" at ' + start);

					if (openSection[1] !== value)
						throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
				} else if (type === 'name' || type === '{' || type === '&') {
					nonSpace = true;
				} else if (type === '=') {
					// Set the tags for the next time around.
					compileTags(value);
				}
			}

			// Make sure there are no open sections when we're done.
			openSection = sections.pop();

			if (openSection)
				throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);

			return nestTokens(squashTokens(tokens));
		}

		/**
		 * Combines the values of consecutive text tokens in the given `tokens` array
		 * to a single token.
		 */

		function squashTokens(tokens) {
			var squashedTokens = [];

			var token, lastToken;
			for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
				token = tokens[i];

				if (token) {
					if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
						lastToken[1] += token[1];
						lastToken[3] = token[3];
					} else {
						squashedTokens.push(token);
						lastToken = token;
					}
				}
			}

			return squashedTokens;
		}

		/**
		 * Forms the given array of `tokens` into a nested tree structure where
		 * tokens that represent a section have two additional items: 1) an array of
		 * all tokens that appear in that section and 2) the index in the original
		 * template that represents the end of that section.
		 */

		function nestTokens(tokens) {
			var nestedTokens = [];
			var collector = nestedTokens;
			var sections = [];

			var token, section;
			for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
				token = tokens[i];

				switch (token[0]) {
					case '#':
					case '^':
						collector.push(token);
						sections.push(token);
						collector = token[4] = [];
						break;
					case '/':
						section = sections.pop();
						section[5] = token[2];
						collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
						break;
					default:
						collector.push(token);
				}
			}

			return nestedTokens;
		}

		/**
		 * A simple string scanner that is used by the template parser to find
		 * tokens in template strings.
		 */

		function Scanner(string) {
			this.string = string;
			this.tail = string;
			this.pos = 0;
		}

		/**
		 * Returns `true` if the tail is empty (end of string).
		 */
		Scanner.prototype.eos = function eos() {
			return this.tail === '';
		};

		/**
		 * Tries to match the given regular expression at the current position.
		 * Returns the matched text if it can match, the empty string otherwise.
		 */
		Scanner.prototype.scan = function scan(re) {
			var match = this.tail.match(re);

			if (!match || match.index !== 0)
				return '';

			var string = match[0];

			this.tail = this.tail.substring(string.length);
			this.pos += string.length;

			return string;
		};

		/**
		 * Skips all text until the given regular expression can be matched. Returns
		 * the skipped string, which is the entire tail if no match can be made.
		 */
		Scanner.prototype.scanUntil = function scanUntil(re) {
			var index = this.tail.search(re),
				match;

			switch (index) {
				case -1:
					match = this.tail;
					this.tail = '';
					break;
				case 0:
					match = '';
					break;
				default:
					match = this.tail.substring(0, index);
					this.tail = this.tail.substring(index);
			}

			this.pos += match.length;

			return match;
		};

		/**
		 * Represents a rendering context by wrapping a view object and
		 * maintaining a reference to the parent context.
		 */

		function Context(view, parentContext) {
			this.view = view;
			this.cache = {
				'.': this.view
			};
			this.parent = parentContext;
		}

		/**
		 * Creates a new context using the given view with this context
		 * as the parent.
		 */
		Context.prototype.push = function push(view) {
			return new Context(view, this);
		};

		/**
		 * Returns the value of the given name in this context, traversing
		 * up the context hierarchy if the value is absent in this context's view.
		 */
		Context.prototype.lookup = function lookup(name) {
			var cache = this.cache;

			var value;
			if (cache.hasOwnProperty(name)) {
				value = cache[name];
			} else {
				var context = this,
					names, index, lookupHit = false;

				while (context) {
					if (name.indexOf('.') > 0) {
						value = context.view;
						names = name.split('.');
						index = 0;

						/**
						 * Using the dot notion path in `name`, we descend through the
						 * nested objects.
						 *
						 * To be certain that the lookup has been successful, we have to
						 * check if the last object in the path actually has the property
						 * we are looking for. We store the result in `lookupHit`.
						 *
						 * This is specially necessary for when the value has been set to
						 * `undefined` and we want to avoid looking up parent contexts.
						 **/
						while (value != null && index < names.length) {
							if (index === names.length - 1)
								lookupHit = hasProperty(value, names[index]);

							value = value[names[index++]];
						}
					} else {
						value = context.view[name];
						lookupHit = hasProperty(context.view, name);
					}

					if (lookupHit)
						break;

					context = context.parent;
				}

				cache[name] = value;
			}

			if (isFunction(value))
				value = value.call(this.view);

			return value;
		};

		/**
		 * A Writer knows how to take a stream of tokens and render them to a
		 * string, given a context. It also maintains a cache of templates to
		 * avoid the need to parse the same template twice.
		 */

		function Writer() {
			this.cache = {};
		}

		/**
		 * Clears all cached templates in this writer.
		 */
		Writer.prototype.clearCache = function clearCache() {
			this.cache = {};
		};

		/**
		 * Parses and caches the given `template` and returns the array of tokens
		 * that is generated from the parse.
		 */
		Writer.prototype.parse = function parse(template, tags) {
			var cache = this.cache;
			var tokens = cache[template];

			if (tokens == null)
				tokens = cache[template] = parseTemplate(template, tags);

			return tokens;
		};

		/**
		 * High-level method that is used to render the given `template` with
		 * the given `view`.
		 *
		 * The optional `partials` argument may be an object that contains the
		 * names and templates of partials that are used in the template. It may
		 * also be a function that is used to load partial templates on the fly
		 * that takes a single argument: the name of the partial.
		 */
		Writer.prototype.render = function render(template, view, partials) {
			var tokens = this.parse(template);
			var context = (view instanceof Context) ? view : new Context(view);
			return this.renderTokens(tokens, context, partials, template);
		};

		/**
		 * Low-level method that renders the given array of `tokens` using
		 * the given `context` and `partials`.
		 *
		 * Note: The `originalTemplate` is only ever used to extract the portion
		 * of the original template that was contained in a higher-order section.
		 * If the template doesn't use higher-order sections, this argument may
		 * be omitted.
		 */
		Writer.prototype.renderTokens = function renderTokens(tokens, context, partials, originalTemplate) {
			var buffer = '';

			var token, symbol, value;
			for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
				value = undefined;
				token = tokens[i];
				symbol = token[0];

				if (symbol === '#') value = this.renderSection(token, context, partials, originalTemplate);
				else if (symbol === '^') value = this.renderInverted(token, context, partials, originalTemplate);
				else if (symbol === '>') value = this.renderPartial(token, context, partials, originalTemplate);
				else if (symbol === '&') value = this.unescapedValue(token, context);
				else if (symbol === 'name') value = this.escapedValue(token, context);
				else if (symbol === 'text') value = this.rawValue(token);

				if (value !== undefined)
					buffer += value;
			}

			return buffer;
		};

		Writer.prototype.renderSection = function renderSection(token, context, partials, originalTemplate) {
			var self = this;
			var buffer = '';
			var value = context.lookup(token[1]);

			// This function is used to render an arbitrary template
			// in the current context by higher-order sections.

			function subRender(template) {
				return self.render(template, context, partials);
			}

			if (!value) return;

			if (isArray(value)) {
				for (var j = 0, valueLength = value.length; j < valueLength; ++j) {
					buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate);
				}
			} else if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
				buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate);
			} else if (isFunction(value)) {
				if (typeof originalTemplate !== 'string')
					throw new Error('Cannot use higher-order sections without the original template');

				// Extract the portion of the original template that the section contains.
				value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

				if (value != null)
					buffer += value;
			} else {
				buffer += this.renderTokens(token[4], context, partials, originalTemplate);
			}
			return buffer;
		};

		Writer.prototype.renderInverted = function renderInverted(token, context, partials, originalTemplate) {
			var value = context.lookup(token[1]);

			// Use JavaScript's definition of falsy. Include empty arrays.
			// See https://github.com/janl/mustache.js/issues/186
			if (!value || (isArray(value) && value.length === 0))
				return this.renderTokens(token[4], context, partials, originalTemplate);
		};

		Writer.prototype.renderPartial = function renderPartial(token, context, partials) {
			if (!partials) return;

			var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
			if (value != null)
				return this.renderTokens(this.parse(value), context, partials, value);
		};

		Writer.prototype.unescapedValue = function unescapedValue(token, context) {
			var value = context.lookup(token[1]);
			if (value != null)
				return value;
		};

		Writer.prototype.escapedValue = function escapedValue(token, context) {
			var value = context.lookup(token[1]);
			if (value != null)
				return mustache.escape(value);
		};

		Writer.prototype.rawValue = function rawValue(token) {
			return token[1];
		};

		mustache.name = 'mustache.js';
		mustache.version = '2.1.1';
		mustache.tags = ['{{', '}}'];

		// All high-level mustache.* functions use this writer.
		var defaultWriter = new Writer();

		/**
		 * Clears all cached templates in the default writer.
		 */
		mustache.clearCache = function clearCache() {
			return defaultWriter.clearCache();
		};

		/**
		 * Parses and caches the given template in the default writer and returns the
		 * array of tokens it contains. Doing this ahead of time avoids the need to
		 * parse templates on the fly as they are rendered.
		 */
		mustache.parse = function parse(template, tags) {
			return defaultWriter.parse(template, tags);
		};

		/**
		 * Renders the `template` with the given `view` and `partials` using the
		 * default writer.
		 */
		mustache.render = function render(template, view, partials) {
			return defaultWriter.render(template, view, partials);
		};

		// This is here for backwards compatibility with 0.4.x.,
		/*eslint-disable */ // eslint wants camel cased function name
		mustache.to_html = function to_html(template, view, partials, send) {
			/*eslint-enable*/

			var result = mustache.render(template, view, partials);

			if (isFunction(send)) {
				send(result);
			} else {
				return result;
			}
		};

		// Export the escaping function so that the user may override it.
		// See https://github.com/janl/mustache.js/issues/244
		mustache.escape = escapeHtml;

		// Export these mainly for testing, but also for advanced usage.
		mustache.Scanner = Scanner;
		mustache.Context = Context;
		mustache.Writer = Writer;
	}));

/* Misc. functions */
	/* Generic Logging function 
	t - title of the log
	d - description/contents of the log
	l - level of the log
	if a console object is present the system will print
	to the console in the browser

	RETURN: undefined
	*/
	function log(t, d, l) {
		var level = 'DEBUG';
		if (l) {
			if (l == 2 || l == 'a') level = 'AUDIT';
			if (l == 3 || l == 'e') level = 'ERROR';
		}
		if (typeof t == 'object') t = JSON.stringify(t);
		if (typeof d == 'object') d = JSON.stringify(d);
		nlapiLogExecution(level, t, d);
	}

	/* Error writing function 
		t - title of the error
		d - description of the error
		hard - throws a formal error
		record - record-type to write error back to
		internalid - record internalid to write error back to
		field - field on record to write error back to

		RETURN: undefined
	*/
	function error(t, d, hard, record, internalid, field) {
		if (typeof t == 'object') t = JSON.stringify(t);
		if (typeof d == 'object') d = JSON.stringify(d);
		if (record && internalid && field) nlapiSubmitField(record, internalid, field, d);
		log(t, d, 3);
		if (hard) throw nlapiCreateError(t, d, true);
	}

	/* Get Index from Array
		o - object, should be an array
		v - value to find in o
			value can be either a single value or it can
			be an array of values
		k - key to search for v in o
			value can be either a single value or it can 
			be an array of values

		RETURN: 
			false - invalid inputs
			null - no match based on inputs
			integer (including 0) - index of first matching
			index in the array
	*/
	function _index(o, v, k) {
		log('_index', {'object':o, 'values':v, 'keys':k});
		if (!o || !v) return false;
		if (o.constructor.toString().indexOf('Array') > -1) {
			for (var i = 0, count = o.length ; i < count ; i++) {
				if (typeof v != 'object') {
					if (k) {
						if (o[i][k] == v) return i;
					} else {
						if (o[i] == v) return i;
					}
				} else {
					var match = true;
					for (var ii = 0, count_ii = v.length ; ii < count_ii ; ii++) {
						if (o[i][k[ii]] != v[ii]) match = false;
					}
					if (match) return i;
				}
			}
		} else {
			return false;
		}
		return null;
	}

	/* Get Parameters from a NetSuite nlobjRequest
		object
		request - an nlobjRequest (SuiteLets, User-Events)

		RETURN: a key-value pair of parameters */
	function _params(request) {
		var params = request.getAllParameters(),
		p_data = {};
		for (var param in params) {
			if (param !== 'script' && param !== 'deploy' && param !== 'callback' && param !== 'compid' && param != '_' && param != 'h') p_data[param] = params[param];
		}
		return p_data;
	}

	/* Get Parameters from window object
		RETURN: a key-value pair of parameters */
	function _params_window(){
		var vars = [], hash;
		var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
		for(var i = 0; i < hashes.length; i++){
			hash = hashes[i].split('=');
			vars.push(hash[0]);
			vars[hash[0]] = hash[1];
		}
		return vars;
	}

// var service_request_form = 42182;

function repair_request_suitelet(request, response) {
	var start = new Date().getTime();
	log('**START**', '*****');
	var data = [], abort=false;
	var callback = request.getParameter('callback') || false;

	/* Extract routing-function */
	var params = request.getAllParameters(),
	p_data = {};
	for (var param in params) {
		if (param !== 'script' && param !== 'deploy' && param !== 'callback' && param !== 'compid' && param != '_' && param != 'h') p_data[param] = params[param];
	}
	log('parameters', p_data);	

	try {
		var method = request.getMethod();
		log('method', method);

		if (method == 'GET') {
			if (p_data['action'] == 'get_customer') {
				var data = get_customer(p_data['email']);
				response.write(JSON.stringify(data));
			}

			if (p_data['action'] == 'get_repair_locations') {
				var data = get_repair_locations();
				response.write(JSON.stringify(data));
			}
		} else {
			create_service_request(request);
		}

	} catch(e) {
		if (e instanceof nlobjError) {
			data['error'] = 'Error: '+e.getDetails()+'('+e.getStackTrace()+')';
			nlapiLogExecution('ERROR', 'NetSuite-related Error Encountered', data['error']);
		} else {
			data['error'] = JSON.stringify(e);
			nlapiLogExecution('ERROR', 'JavaScript-related Error Encountered', data['error']);
		}		
	}

	log('***END***', 'Elapsed Time: '+((new Date().getTime()-start)/1000));
}

function create_service_request(request) {
	var params = _params(request);
	log('parameters', params);

	/* Get and/or create Prospect/Customer */
	var customer = params['customer'];
	if (!customer) customer = create_customer(params);
	log('Customer', customer);

	/* Create Service Request
		data-object's structure
			custrecord_servicerequest_customer 			mandatory
			custrecord_servicerequest_ponumber
			custrecord_servicerequest_comments
			custrecord_servicerequest_address1
			custrecord_servicerequest_address2
			custrecord_servicerequest_city
			custrecord_servicerequest_state
			custrecord_servicerequest_zip
			serviceWork [{
				serial 								mandatory
				custrecord_service_work_equipment 			-
				onsite								-
				custrecord_service_work_repair			mandatory
				custrecord_service_work_symptoms 			mandatory
			}]

		example:
			{
				custrecord_servicerequest_customer:123,
				custrecord_servicerequest_ponumber:'test',
				serviceWork:[{
					serial:'ABC123',
					custrecord_service_work_equipment:456,
					onsite:true, 
					custrecord_service_work_repair:789,
					custrecord_service_work_symptoms:'does not work'
				}, {
					serial:'DEF456',
					onsite:'T',
					custrecord_service_work_repair:789,
					custrecord_service_work_symptoms:'also does not work'
				}]
			}
		*/
		buildServiceRequest.execute(
			data,
			true, // Send Email
			true // Web Request
		);

	/* Misc */
		//var casenumber = nlapiLookupField('supportcase',r,'number');
		//var mdata = {'case' : casenumber};
		//var template = nlapiLoadFile('42844').getValue();  // Confirmation form
		//Mustache.parse(template);
		//template = Mustache.render(template, mdata);

		//response.write(template);
}

function get_customer(email) {
	log('get_customer');
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F')); 
		filter.push(new nlobjSearchFilter('email', null, 'is', email));
	var columns = [];
		columns.push(new nlobjSearchColumn('email'));
		columns.push(new nlobjSearchColumn('firstname'));
		columns.push(new nlobjSearchColumn('lastname'));
		columns.push(new nlobjSearchColumn('phone'));
		columns.push(new nlobjSearchColumn('companyname'));
		columns.push(new nlobjSearchColumn('shipaddress1'));
		columns.push(new nlobjSearchColumn('shipaddress2'));
		columns.push(new nlobjSearchColumn('shipcity'));
		columns.push(new nlobjSearchColumn('shipstate'));
		columns.push(new nlobjSearchColumn('shipzip'));		
		columns.push(new nlobjSearchColumn('billaddress1'));
		columns.push(new nlobjSearchColumn('billaddress2'));
		columns.push(new nlobjSearchColumn('billcity'));
		columns.push(new nlobjSearchColumn('billstate'));
		columns.push(new nlobjSearchColumn('billzipcode'));		

	var results = nlapiSearchRecord('customer', null, filter, columns);

    log('results', results);
    if (results) {

		data.push({
			'internalid': results[0].getValue('id'),
			'entityid': parseInt(results[0].getValue('entityid')),
			'email': results[0].getValue('email'),
			'firstname': results[0].getValue('firstname'),
			'lastname': results[0].getValue('lastname'),
			'phone': results[0].getValue('phone'),
			'companyname': results[0].getValue('companyname'),
			'addrs1': results[0].getValue('billaddress1') ? results[0].getValue('billaddress1') : results[0].getValue('shipaddress1'),
			'addrs2': results[0].getValue('billaddress1') ? results[0].getValue('billaddress2') : results[0].getValue('shipaddress2'),
			'city': results[0].getValue('billaddress1') ? results[0].getValue('billcity') : results[0].getValue('shipcity'),
			'state': results[0].getValue('billaddress1') ? results[0].getValue('billstate') : results[0].getValue('shipstate'),
			'zip': results[0].getValue('billaddress1') ? results[0].getValue('billzipcode') : results[0].getValue('shipzip'),
		});
	}
	return data;
}

function create_customer(parameters) {

	var customer_data = get_customer(parameters.email);
	log('Customer Lookup', (customer_data.length == 0) ? 'No Match Found' : 'Match Found: '+ customer_data);
	if (customer_data.length > 0) return customer_data;

	var r = nlapiCreateRecord('prospect');
	if (parameters.companyname == '') {
		r.setFieldValue('isperson', 'T');

	} else {
		r.setFieldValue('isperson', 'F')
	}
	r.setFieldValue('firstname', parameters.fname);
	r.setFieldValue('lastname', parameters.lname)	
	r.setFieldValue('companyname', parameters.companyname);
	r.setFieldValue('phone', parameters.phone);
	r.setFieldValue('email', parameters.email);
	r.setFieldValue('stage', 'PROSPECT');
	//r.setFieldValue('entityclass', 'PROSPECT-In Discussion');

	/* Set Shipping Address */
	r.selectNewLineItem('addressbook');
	r.setCurrentLineItemValue('addressbook', 'defaultshipping', 'T');
	r.setCurrentLineItemValue('addressbook', 'defaultbilling', 'F');
	r.setCurrentLineItemValue('addressbook', 'label', parameters.address1 || 'Shipping Address');
	if (parameters.companyname == '') {
		r.setCurrentLineItemValue('addressbook', 'isresidential', 'T');	
	} else {
		r.setCurrentLineItemValue('addressbook', 'isresidential', 'F');
	}
	
	var shipping = r.createCurrentLineItemSubrecord('addressbook', 'addressbookaddress');
		shipping.setFieldValue('country', 'US');
//		shipping.setFieldValue('addressee', parameters.addressee || '');
		shipping.setFieldValue('addrphone', parameters.phone || '');
		shipping.setFieldValue('addr1', parameters.address1 || '');
		shipping.setFieldValue('addr2', parameters.address2 || '');
		shipping.setFieldValue('city', parameters.city || '');
		shipping.setFieldValue('state', parameters.state || '');
		shipping.setFieldValue('zip', parameters.zip || '');
		shipping.commit();
		r.commitLineItem('addressbook');
		log('Shipping Address Set');

	/* Set Billing Address */
	r.selectNewLineItem('addressbook');
	r.setCurrentLineItemValue('addressbook', 'defaultshipping', 'F');
	r.setCurrentLineItemValue('addressbook', 'defaultbilling', 'T');
	r.setCurrentLineItemValue('addressbook', 'label', parameters.address1 || 'Billing Address');
	if (parameters.companyname == '') {
		r.setCurrentLineItemValue('addressbook', 'isresidential', 'T');	
	} else {
		r.setCurrentLineItemValue('addressbook', 'isresidential', 'F');
	}
	var billing = r.createCurrentLineItemSubrecord('addressbook', 'addressbookaddress');
		billing.setFieldValue('country', 'US');
//		billing.setFieldValue('addressee', parameters.baddressee || '');
		billing.setFieldValue('addrphone', parameters.phone || '');
		billing.setFieldValue('addr1', parameters.address1 || '');
		billing.setFieldValue('addr2', parameters.address2 || '');
		billing.setFieldValue('city', parameters.city || '');
		billing.setFieldValue('state', parameters.state || '');
		billing.setFieldValue('zip', parameters.zip || '');
	billing.commit();
	r.commitLineItem('addressbook');
	log('Billing Address Set');

	r = nlapiSubmitRecord(r, true, true);
	log('Created Customer', r);
	return r;
}

function get_repair_locations() {
	log('get_repair_locations');
	var data = [];
	var filter = [];
		filter.push(new nlobjSearchFilter('isinactive', null, 'is', 'F')); 
	var columns = [];
		columns.push(new nlobjSearchColumn('internalid'));
		columns.push(new nlobjSearchColumn('name'));
		columns.push(new nlobjSearchColumn('address','address')); 
	var results = nlapiSearchRecord('location', null, filter, columns);

 	if (results) {
 		for (var i=0; i<results.length; i++) {
 			data.push({
 				'id' : results[i].getValue('internalid'),
 				'name': results[i].getValue('name'),
 				'address': results[i].getValue('address', 'address'),
 				'distance' : ''
 			});
 		}
 	}
 	return data;
}

function write_form() {
	var html = nlapiLoadFile(service_request_form).getValue();
	response.write(html);
}
