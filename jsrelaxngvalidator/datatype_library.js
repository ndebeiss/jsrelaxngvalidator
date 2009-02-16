/*

Copyright or © or Copr. Nicolas Debeissat

nicolas.debeissat@gmail.com (http://debeissat.nicolas.free.fr/)

This software is a computer program whose purpose is to validate XML
against a RelaxNG schema.

This software is governed by the CeCILL license under French law and
abiding by the rules of distribution of free software.  You can  use, 
modify and/ or redistribute the software under the terms of the CeCILL
license as circulated by CEA, CNRS and INRIA at the following URL
"http://www.cecill.info". 

As a counterpart to the access to the source code and  rights to copy,
modify and redistribute granted by the license, users are provided only
with a limited warranty  and the software's author,  the holder of the
economic rights,  and the successive licensors  have only  limited
liability. 

In this respect, the user's attention is drawn to the risks associated
with loading,  using,  modifying and/or developing or reproducing the
software by the user in light of its specific status of free software,
that may mean  that it is complicated to manipulate,  and  that  also
therefore means  that it is reserved for developers  and  experienced
professionals having in-depth computer knowledge. Users are therefore
encouraged to load and test the software's suitability as regards their
requirements in conditions enabling the security of their systems and/or 
data to be ensured and,  more generally, to use and operate it in the 
same conditions as regards security. 

The fact that you are presently reading this means that you have had
knowledge of the CeCILL license and that you accept its terms.

*/

/*
implementation of datatypeLibrary="http://www.w3.org/2001/XMLSchema-datatypes"

extract from http://www.w3schools.com/Schema/schema_dtypes_string.asp :

ENTITIES  															KO
ENTITY 	 															KO
ID 	A string that represents the ID attribute in XML (only used with schema attributes)			KO
IDREF 	A string that represents the IDREF attribute in XML (only used with schema attributes)		KO
IDREFS 	 															KO
language 	A string that contains a valid language id									OK
Name 	A string that contains a valid XML name									OK
NCName																OK
NMTOKEN 	A string that represents the NMTOKEN attribute in XML (only used with schema attributes)	KO
NMTOKENS 	 														KO
normalizedString 	A string that does not contain line feeds, carriage returns, or tabs				OK
QName 	 															OK
string 	A string														OK
token 	A string that does not contain line feeds, carriage returns, tabs, leading or trailing spaces, or multiple spaces OK

extract from http://www.w3schools.com/Schema/schema_dtypes_date.asp :

date  	Defines a date value													OK
dateTime 	Defines a date and time value											OK
duration 	Defines a time interval												OK
gDay 	Defines a part of a date - the day (DD)										OK
gMonth 	Defines a part of a date - the month (MM)									OK
gMonthDay 	Defines a part of a date - the month and day (MM-DD)							OK
gYear 	Defines a part of a date - the year (YYYY)									OK
gYearMonth 	Defines a part of a date - the year and month (YYYY-MM)					OK
time 	Defines a time value													OK

extract from http://www.w3schools.com/Schema/schema_dtypes_numeric.asp :

byte  	A signed 8-bit integer													OK
decimal 	A decimal value													OK
int 	A signed 32-bit integer													OK
integer 	An integer value													OK
long 	A signed 64-bit integer													OK
negativeInteger 	An integer containing only negative values ( .., -2, -1.)						OK
nonNegativeInteger 	An integer containing only non-negative values (0, 1, 2, ..)				OK
nonPositiveInteger 	An integer containing only non-positive values (.., -2, -1, 0)				OK
positiveInteger 	An integer containing only positive values (1, 2, ..)						OK
short 	A signed 16-bit integer													OK
unsignedLong 	An unsigned 64-bit integer										OK
unsignedInt 	An unsigned 32-bit integer										OK
unsignedShort 	An unsigned 16-bit integer										OK
unsignedByte 	An unsigned 8-bit integer										OK

extract from http://www.w3schools.com/Schema/schema_dtypes_misc.asp :

anyURI  	 
base64Binary 	 
boolean 	 
double 	 
float 	 
hexBinary 	 
NOTATION 	 
QName 	 

extract from http://www.w3schools.com/Schema/schema_elements_ref.asp :

enumeration  	Defines a list of acceptable values
fractionDigits 	Specifies the maximum number of decimal places allowed. Must be equal to or greater than zero
length 	Specifies the exact number of characters or list items allowed. Must be equal to or greater than zero
maxExclusive 	Specifies the upper bounds for numeric values (the value must be less than this value)
maxInclusive 	Specifies the upper bounds for numeric values (the value must be less than or equal to this value)
maxLength 	Specifies the maximum number of characters or list items allowed. Must be equal to or greater than zero
minExclusive 	Specifies the lower bounds for numeric values (the value must be greater than this value)
minInclusive 	Specifies the lower bounds for numeric values (the value must be greater than or equal to this value)
minLength 	Specifies the minimum number of characters or list items allowed. Must be equal to or greater than zero
pattern 	Defines the exact sequence of characters that are acceptable
totalDigits 	Specifies the exact number of digits allowed. Must be greater than zero
whiteSpace 	Specifies how white space (line feeds, tabs, spaces, and carriage returns) is handled

*/
function DatatypeLibrary() {

	var languageRegExp = new RegExp("^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$");
	//http://www.w3.org/TR/xml/#NT-Name
	var nameStartChar = "A-Z_a-z\\hC0-\\hD6\\hD8-\\hF6\\hF8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
    //\\u10000-\\uEFFFF
	var nameChar = nameStartChar + "\-\.0-9\\hB7\\u0300-\\u036F\\u203F-\\u2040";
	var nameRegExp = new RegExp("^[:" + nameStartChar + "][:" + nameChar + "]*$");
	var ncNameRegExp = new RegExp("^[" + nameStartChar + "][" + nameChar + "]*$");

	var whitespaceChar = "\t\n\r";
	var normalizedStringRegExp = new RegExp("^[^" + whitespaceChar + "]*$");
	
	var qNameRegExp = new RegExp("^[" + nameStartChar + "][" + nameChar + "]*(:[" + nameStartChar + "]+)?$");
	
	var multipleSpaces = new RegExp("^[^ {2,}]$");
	
	var tokenRegExp = new RegExp("^[^" + whitespaceChar + " ].*[^" + whitespaceChar + " ]$");
	
	var year = "-?([1-9][0-9]*)?[0-9]{4}";
    var month = "[0-9]{2}";
	var dayOfMonth = "[0-9]{2}";
	var time = "[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]*)?";
	var timeZone = "(Z|[+\\-][0-9][0-9]:[0-5][0-9])?";
	
	var dateRegExp = new RegExp("^" + year + "-" + month + "-" + dayOfMonth + timeZone + "$");
	
	var dateTimeRegExp = new RegExp("^" + year + "-" + month + "-" + dayOfMonth + "T" + time + timeZone + "$");
	
	var duration = "-?P([0-9]+Y)?([0-9]+M)?([0-9]+D)?(T([0-9]+H)?([0-9]+M)?(([0-9]+(\\.[0-9]*)?|\\.[0-9]+)S)?)?";
	
	var durationRegExp = new RegExp("^" + duration + "$");
	
	var gDayRexExp = new RegExp("^" + dayOfMonth + timeZone + "$");
	
	var gMonthRexExp = new RegExp("^" + month + timeZone + "$");
	
	var gMonthDayRexExp = new RegExp("^--" + month + "-" + dayOfMonth + timeZone + "$");
	
	var gYearRegExp = new RegExp("^" + year + timeZone + "$");
	
	var gYearMonthRegExp = new RegExp("^" + year + "-" + month + timeZone + "$");
	
	var timeRegExp = new RegExp("^" + time + timeZone + "$");
	
	var LONG_MAX = 9223372036854775807;
	var LONG_MIN = -9223372036854775808;
	var INT_MAX = 2147483647;
	var INT_MIN = -2147483648;
	var SHORT_MAX = 32767;
	var SHORT_MIN = -32768;
	var BYTE_MAX = 127;
	var BYTE_MIN = -128;

	var UNSIGNED_LONG_MAX = 18446744073709551615;
	var UNSIGNED_INT_MAX = 4294967295;
	var UNSIGNED_SHORT_MAX = 65535;
	var UNSIGNED_BYTE_MAX = 255;
	
	var integer = "[\-+]?[0-9]+";
	
	var integerRexExp = new RegExp("^" + integer + "$");
	
	var decimal = "([\-+])?[0-9]+(.[0-9]+)?";
	
	var decimalRexExp = new RegExp("^" + decimal + "$");
	
	var negativeInteger = "\-[1-9][0-9]*";
	
	var negativeIntegerRexExp = new RegExp("^" + negativeInteger + "$");
	
	var nonNegativeInteger = "\+?[0-9]+";
	
	var nonNegativeIntegerRexExp = new RegExp("^" + nonNegativeInteger + "$");
	
	var nonPositiveInteger = "\-?[0-9]+";
	
	var nonPositiveIntegerRexExp = new RegExp("^" + nonPositiveInteger + "$");
	
	var positiveInteger = "\+?[1-9][0-9]*";
	
	var positiveIntegerRexExp = new RegExp("^" + positiveInteger + "$");
	
	/*
	datatypeAllows :: Datatype -> ParamList -> String -> Context -> Bool
	datatypeAllows ("",  "string") [] _ _ = True
	datatypeAllows ("",  "token") [] _ _ = True
	*/
	this.datatypeAllows = function(datatype, paramList, string, context) {
		if (datatype.uri == "http://www.w3.org/2001/XMLSchema-datatypes") {
			if (datatype.localName == "language") {
				return this.checkRegExp(languageRegExp, string, datatype);
			} else if (datatype.localName == "Name") {
				return this.checkRegExp(nameRegExp, string, datatype);
			} else if (datatype.localName == "NCName") {
				return this.checkRegExp(ncNameRegExp, string, datatype);
			} else if (datatype.localName == "normalizedString") {
				return this.checkRegExp(normalizedStringRegExp, string, datatype);
			} else if (datatype.localName == "QName") {
				return this.checkRegExp(qNameRegExp, string, datatype);
			} else if (datatype.localName == "string") {
				return new Empty();
			} else if (datatype.localName == "token") {
				var result = this.checkNegRegExp(multipleSpaces, string, datatype);
				if (result instanceof NotAllowed) {
					return result;
				}
				return this.checkRegExp(tokenRegExp, string, datatype) {
			} else if (datatype.localName == "date") {
				return this.checkRegExp(dateRegExp, string, datatype);
			} else if (datatype.localName == "dateTime") {
				return this.checkRegExp(dateTimeRegExp, string, datatype);
			} else if (datatype.localName == "duration") {
				return this.checkRegExp(durationRegExp, string, datatype);
			} else if (datatype.localName == "gDay") {
				return this.checkRegExp(gDayRegExp, string, datatype);
			} else if (datatype.localName == "gMonth") {
				return this.checkRegExp(gMonthRegExp, string, datatype);
			} else if (datatype.localName == "gMonthDay") {
				return this.checkRegExp(gMonthDayRegExp, string, datatype);
			} else if (datatype.localName == "gYear") {
				return this.checkRegExp(gYearRegExp, string, datatype);
			} else if (datatype.localName == "gYearMonth") {
				return this.checkRegExp(gYearMonthRegExp, string, datatype);
			} else if (datatype.localName == "time") {
				return this.checkRegExp(timeRegExp, string, datatype);
			} else if (datatype.localName == "byte") {
				return this.checkIntegerRange(BYTE_MIN, BYTE_MAX, string, datatype);
			} else if (datatype.localName == "decimal") {
				return this.checkRegExp(decimalRexExp, string, datatype);
			} else if (datatype.localName == "int") {
				return this.checkIntegerRange(INT_MIN, INT_MAX, string, datatype);
			} else if (datatype.localName == "integer") {
				return this.checkRegExp(integerRexExp, string, datatype);
			} else if (datatype.localName == "long") {
				return this.checkIntegerRange(LONG_MIN, LONG_MAX, string, datatype);
			} else if (datatype.localName == "negativeInteger") {
				return this.checkRegExp(negativeIntegerRexExp, string, datatype);
			} else if (datatype.localName == "nonNegativeInteger") {
				return this.checkRegExp(nonNegativeIntegerRexExp, string, datatype);
			} else if (datatype.localName == "nonPositiveInteger") {
				return this.checkRegExp(nonPositiveIntegerRexExp, string, datatype);
			} else if (datatype.localName == "positiveInteger") {
				return this.checkRegExp(positiveIntegerRexExp, string, datatype);
			} else if (datatype.localName == "short") {
				return this.checkIntegerRange(SHORT_MIN, SHORT_MAX, string, datatype);
			} else if (datatype.localName == "unsignedLong") {
				return this.checkIntegerRange(0, UNSIGNED_LONG_MAX, string, datatype);
			} else if (datatype.localName == "unsignedInt") {
				return this.checkIntegerRange(0, UNSIGNED_INT_MAX, string, datatype);
			} else if (datatype.localName == "unsignedShort") {
				return this.checkIntegerRange(0, UNSIGNED_SHORT_MAX, string, datatype);
			} else if (datatype.localName == "unsignedByte") {
				return this.checkIntegerRange(0, UNSIGNED_BYTE_MAX, string, datatype);
			} else {
				return new Empty();
			}
		} else {
			return new Empty();
		}
	}

	/*
	datatypeEqual :: Datatype -> String -> Context -> String -> Context -> Bool
	datatypeEqual ("",  "string") s1 _ s2 _ = (s1 == s2)
	datatypeEqual ("",  "token") s1 _ s2 _ = (normalizeWhitespace s1) == (normalizeWhitespace s2)
	*/
	this.datatypeEqual = function(datatype, patternString, patternContext, string, context) {
		if (datatype.uri == "") {
			if (datatype.localName == "string") {
				return string1 == string2;
			} else if (datatype.localName == "token") {
				return this.normalizeWhitespace(string1) == this.normalizeWhitespace(string2);
			}
		} else if (!datatypeLibrary) {
			return true;
		} else {
			return datatypeLibrary.datatypeEqual(datatype, string1, context1, string2, context2);
		}
	}


	this.checkRegExp = function(regExp, string, datatype) {
		if (this.checkRegExp(regExp, string)) {
			return new Empty();
		}
		return new NotAllowed("invalid " + datatype.localName, datatype, string);
	}
	
	this.checkNegRegExp = function(regExp, string, datatype) {
		if (regExp.test(string)) {
			return new NotAllowed("invalid " + datatype.localName, datatype, string);
		}
		return new Empty();
	}
	
	this.checkIntegerRange = function(min, max, string, datatype) {
		if (regExp.test(integerRexExp, string, datatype)) {
			return new NotAllowed("invalid " + datatype.localName, datatype, string);
		} else {
			var integer = parseInt(string);
			if (integer >= min && integer <= max) {
				return new Empty();
			}
			return new NotAllowed("invalid integer range, min is " + min + ", max is " + max " for datatype " + datatype.localName, datatype, string);
		}
	}







}