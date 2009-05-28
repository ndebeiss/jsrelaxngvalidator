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

anyURI  	 															does not do any validation
base64Binary 	 														OK
boolean 	 															OK
double 	 															OK
float 	                                                                                                                                                                            same as double
hexBinary 	 															OK
NOTATION 	                                                                                                                                                     same as QName 
QName 	                                                                                                                                                                OK

extract from http://www.w3schools.com/Schema/schema_elements_ref.asp :

enumeration  	Defines a list of acceptable values
fractionDigits 	Specifies the maximum number of decimal places allowed. Must be equal to or greater than zero                OK
length 	Specifies the exact number of characters or list items allowed. Must be equal to or greater than zero                  OK but not for list and only length of string
maxExclusive 	Specifies the upper bounds for numeric values (the value must be less than this value)                                  OK
maxInclusive 	Specifies the upper bounds for numeric values (the value must be less than or equal to this value)              OK
maxLength 	Specifies the maximum number of characters or list items allowed. Must be equal to or greater than zero             OK
minExclusive 	Specifies the lower bounds for numeric values (the value must be greater than this value)                            OK
minInclusive 	Specifies the lower bounds for numeric values (the value must be greater than or equal to this value)           OK
minLength 	Specifies the minimum number of characters or list items allowed. Must be equal to or greater than zero                 OK
pattern 	Defines the exact sequence of characters that are acceptable                                                                                    OK
totalDigits 	Specifies the exact number of digits allowed. Must be greater than zero                                                                   OK
whiteSpace 	Specifies how white space (line feeds, tabs, spaces, and carriage returns) is handled                                   KO

*/
function DatatypeLibrary() {

    var languageRegExp = new RegExp("^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$");
    var nameStartChar = "A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u0200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\ud800-\udb7f\udc00-\udfff";
    var nameChar = nameStartChar + "\-\\.0-9\u00B7\u0300-\u036F\u203F-\u2040-";
    var nameRegExp = new RegExp("^[:" + nameStartChar + "][:" + nameChar + "]*$");
    var ncNameRegExp = new RegExp("^[" + nameStartChar + "][" + nameChar + "]*$");

    var whitespaceChar = "\t\n\r";
    var normalizedStringRegExp = new RegExp("^[^" + whitespaceChar + "]*$");
    
    var qNameRegExp = new RegExp("^[" + nameStartChar + "][" + nameChar + "]*(:[" + nameStartChar + "]+)?$");
    
    var tokenRegExp = new RegExp("^([^" + whitespaceChar + " ](?!.*  )([^" + whitespaceChar + "]*[^" + whitespaceChar + " ])?)?$");
    
    var year = "-?([1-9][0-9]*)?[0-9]{4}";
    var month = "[0-9]{2}";
    var dayOfMonth = "[0-9]{2}";
    var time = "[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]*)?";
    var timeZone = "(Z|[\-\+][0-9][0-9]:[0-5][0-9])?";
    
    var dateRegExp = new RegExp("^" + year + "-" + month + "-" + dayOfMonth + timeZone + "$");
    
    var dateTimeRegExp = new RegExp("^" + year + "-" + month + "-" + dayOfMonth + "T" + time + timeZone + "$");
    
    var durationRegExp = new RegExp("^" + "-?P(?!$)([0-9]+Y)?([0-9]+M)?([0-9]+D)?(T(?!$)([0-9]+H)?([0-9]+M)?([0-9]+(\\.[0-9]+)?S)?)?$");
    
    var gDayRegExp = new RegExp("^" + "---" + dayOfMonth + timeZone + "$");
    
    var gMonthRegExp = new RegExp("^" + "--" + month + timeZone + "$");
    
    var gMonthDayRegExp = new RegExp("^" + "--" + month + "-" + dayOfMonth + timeZone + "$");
    
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
    
    var integer = "[\-\+]?[0-9]+";
    
    var integerRegExp = new RegExp("^" + integer + "$");
    
    var decimal = "[\-\+]?(?!$)[0-9]*(\\.[0-9]*)?";
    
    var decimalRegExp = new RegExp("^" + decimal + "$");
    
    /*
    Base64Binary  ::=  ((B64S B64S B64S B64S)*
                     ((B64S B64S B64S B64) |
                      (B64S B64S B16S '=') |
                      (B64S B04S '=' #x20? '=')))?

B64S         ::= B64 #x20?

B16S         ::= B16 #x20?

B04S         ::= B04 #x20?

B04         ::=  [AQgw]
B16         ::=  [AEIMQUYcgkosw048]
B64         ::=  [A-Za-z0-9+/] 
*/
    var b64 = "[A-Za-z0-9+/]";
    var b16 = "[AEIMQUYcgkosw048]";
    var b04 = "[AQgw]";
    var b04S = "(" + b04 + " ?)";
    var b16S = "(" + b16 + " ?)";
    var b64S = "(" + b64 + " ?)";
    
    var base64BinaryRegExp = new RegExp("^((" + b64S + "{4})*((" + b64S + "{3}" + b64 + ")|(" + b64S + "{2}" + b16S + "=)|(" + b64S + b04S + "= ?=)))?$");
    
    var booleanRegExp = new RegExp("(^true$)|(^false$)|(^0$)|(^1$)", "i");
    
    var doubleRegExp = new RegExp("(^-?INF$)|(^NaN$)|(^" + decimal + "([Ee]" + integer + ")?$)");
    
    var hexBinaryRegExp = new RegExp("^" + "[0-9a-fA-F]*" + "$");
    
    var fractionDigits = "\\.[0-9]";
    
    var PRESERVE = "preserve";
    var REPLACE = "replace";
    var COLLAPSE = "collapse";
    
    /*
    datatypeAllows :: Datatype -> ParamList -> String -> Context -> Bool
    datatypeAllows ("",  "string") [] _ _ = True
    datatypeAllows ("",  "token") [] _ _ = True
    */
    this.datatypeAllows = function(datatype, paramList, string, context) {
        if (datatype.uri == "http://www.w3.org/2001/XMLSchema-datatypes") {
            /*
            
            Date and duration checks
            
            */
            if (datatype.localName == "date") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(dateRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "dateTime") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(dateTimeRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "gDay") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(gDayRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "gMonth") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(gMonthRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "gMonthDay") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(gMonthDayRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "gYear") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(gYearRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "gYearMonth") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(gYearMonthRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "time") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(timeRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "duration") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(durationRegExp, value, datatype, paramList);
            /*
            
            primitive types
        
            */
            } else if (datatype.localName == "boolean") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(booleanRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "base64Binary") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(base64BinaryRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "hexBinary") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(hexBinaryRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "float") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(doubleRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "double") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(doubleRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "anyURI") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkParams(value, datatype, paramList);
                
            } else if (datatype.localName == "QName" || datatype.localName == "NOTATION") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                var result = this.checkRegExpAndParams(qNameRegExp, value, datatype, paramList);
                if (result instanceof NotAllowed) {
                    return result;
                }
                return this.checkPrefixDeclared(value, context, datatype);
            /*
            
            types derived from string
            
            */
            } else if (datatype.localName == "string") {
                var value = this.whitespace(string, PRESERVE, paramList);
                return this.checkParams(value, datatype, paramList);
                
            } else if (datatype.localName == "normalizedString") {
                var value = this.whitespace(string, PRESERVE, paramList);
                return this.checkRegExpAndParams(normalizedStringRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "token") {
                var value = this.whitespace(string, PRESERVE, paramList);
                return this.checkRegExpAndParams(tokenRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "language") {
                var value = this.whitespace(string, PRESERVE, paramList);
                return this.checkRegExpAndParams(languageRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "Name") {
                var value = this.whitespace(string, PRESERVE, paramList);
                return this.checkRegExpAndParams(nameRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "NCName") {
                var value = this.whitespace(string, PRESERVE, paramList);
                return this.checkRegExpAndParams(ncNameRegExp, value, datatype, paramList);
            /*
            
            types derived from decimal
            
            */
            } else if (datatype.localName == "decimal") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(decimalRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "integer") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkRegExpAndParams(integerRegExp, value, datatype, paramList);
                
            } else if (datatype.localName == "long") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(LONG_MIN, LONG_MAX, value, datatype, paramList);
                
            } else if (datatype.localName == "int") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(INT_MIN, INT_MAX, value, datatype, paramList);
                
            } else if (datatype.localName == "short") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(SHORT_MIN, SHORT_MAX, value, datatype, paramList);
                
            } else if (datatype.localName == "byte") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(BYTE_MIN, BYTE_MAX, value, datatype, paramList);
            /*
            
            integer types
            
            */
            } else if (datatype.localName == "negativeInteger") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(undefined, -1, value, datatype, paramList);
                
            } else if (datatype.localName == "nonPositiveInteger") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(undefined, 0, value, datatype, paramList);
                
            } else if (datatype.localName == "nonNegativeInteger") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(0, undefined, value, datatype, paramList);
                
            } else if (datatype.localName == "positiveInteger") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(1, undefined, value, datatype, paramList);
            /*
            
            signed or unsigned numbers
            
            */
            } else if (datatype.localName == "unsignedLong") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(0, UNSIGNED_LONG_MAX, value, datatype, paramList);
                
            } else if (datatype.localName == "unsignedInt") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(0, UNSIGNED_INT_MAX, value, datatype, paramList);
                
            } else if (datatype.localName == "unsignedShort") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(0, UNSIGNED_SHORT_MAX, value, datatype, paramList);
                
            } else if (datatype.localName == "unsignedByte") {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkIntegerRange(0, UNSIGNED_BYTE_MAX, value, datatype, paramList);
                
            } else {
                var value = this.whitespace(string, COLLAPSE, paramList);
                return this.checkParams(value, datatype, paramList);
            }
        } else {
            var value = this.whitespace(string, COLLAPSE, paramList);
            return this.checkParams(value, datatype, paramList);
        }
    };

    /*
    datatypeEqual :: Datatype -> String -> Context -> String -> Context -> Bool
    datatypeEqual ("",  "string") s1 _ s2 _ = (s1 == s2)
    datatypeEqual ("",  "token") s1 _ s2 _ = (normalizeWhitespace s1) == (normalizeWhitespace s2)
    */
    this.datatypeEqual = function(datatype, patternString, patternContext, string, context) {
        if (datatype.uri == "http://www.w3.org/2001/XMLSchema-datatypes") {
            if (datatype.localName == "boolean") {
                var value = this.whitespace(string, COLLAPSE);
                var patternValue = this.whitespace(patternString, COLLAPSE);
                if (value.toLowerCase() == patternValue.toLowerCase()) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else if (datatype.localName == "float" || datatype.localName == "double" || datatype.localName == "decimal") {
                var value = parseFloat(string);
                var patternValue = parseFloat(patternString);
                if (value == patternValue) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else if (datatype.localName == "integer" || datatype.localName == "long" || datatype.localName == "int" || datatype.localName == "short" || datatype.localName == "byte" || datatype.localName == "negativeInteger" || datatype.localName == "nonPositiveInteger" || datatype.localName == "nonNegativeInteger" || datatype.localName == "positiveInteger" || datatype.localName == "unsignedLong" || datatype.localName == "unsignedInt" || datatype.localName == "unsignedShort" || datatype.localName == "unsignedByte") {
                var value = parseInt(string);
                var patternValue = parseInt(patternString);
                if (value == patternValue) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else if (datatype.localName == "anyURI" || datatype.localName == "QName" || datatype.localName == "NOTATION") {
                var value = this.whitespace(string, COLLAPSE);
                var patternValue = this.whitespace(patternString, COLLAPSE);
                if (value == patternValue) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else if (datatype.localName == "string" || datatype.localName == "normalizedString" || datatype.localName == "token" || datatype.localName == "language" || datatype.localName == "Name" || datatype.localName == "NCName") {
                var value = this.whitespace(string, PRESERVE);
                var patternValue = this.whitespace(patternString, PRESERVE);
                if (value == patternValue) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else if (datatype.localName == "base64Binary") {
                var value = string.replace(/ /g, "");
                var patternValue = patternString.replace(/ /g, "");
                if (value == patternValue) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else if (datatype.localName == "hexBinary") {
                var value = this.whitespace(string, COLLAPSE);
                var patternValue = this.whitespace(patternString, COLLAPSE);
                //canonical representation of hexBinary prohibites lower case
                if (value.toUpperCase() == patternValue.toUpperCase()) {
                    return new Empty();
                } else {
                    return new NotAllowed("invalid value, expected is " + patternValue, datatype, string);
                }
                
            } else {
                return new Empty();
            }
        } else {
            return new Empty();
        }
    };
    
    this.whitespace = function(string, wsDefault, paramList) {
        var wsParam = wsDefault;
        if (paramList) {
            for (var i in paramList) {
                var param = paramList[i];
                if (param.localName == "whiteSpace") {
                    wsParam = param.string;
                }
            }
        }
        if (wsParam == REPLACE) {
            return string.replace(/[\t\n\r]/g, " ");
        } else if (wsParam == COLLAPSE) {
            var value = string.replace(/[\t\n\r ]+/g, " ");
            //removes leading and trailing space
            return value.replace(/^ /, "").replace(/ $/, "");
        }
        return string;
    };
    
    this.checkIntegerRange = function(min, max, string, datatype, paramList) {
        var checkInteger = this.checkRegExp(integerRegExp, string, datatype);
        if (checkInteger instanceof NotAllowed) {
            return checkInteger;
        }
        var intValue = parseInt(string);
        //min can be undefined if condition is just inferior
        if (min != undefined) {
            if (intValue < min) {
                return new NotAllowed("integer value is too small, minimum is " + min + " for datatype " + datatype.localName, datatype, string);
            }
        }
        if (max != undefined) {
            if (intValue > max) {
                return new NotAllowed("integer value is too big, maximum is " + max + " for datatype " + datatype.localName, datatype, string);
            }
        }
        return this.checkParams(string, datatype, paramList);
    };
    
    this.checkRegExpAndParams = function(regExp, string, datatype, paramList) {
        var check = this.checkRegExp(regExp, string, datatype);
        if (check instanceof NotAllowed) {
            return check;
        }
        return this.checkParams(string, datatype, paramList);
    };

    this.checkRegExp = function(regExp, string, datatype) {
        if (regExp.test(string)) {
            return new Empty();
        }
        return new NotAllowed("invalid " + datatype.localName, datatype, string);
    };
    
    /*
            negation of checkRegExp
            */
    this.checkExclusiveRegExp = function(regExp, string, datatype) {
        if (regExp.test(string)) {
            return new NotAllowed("invalid " + datatype.localName, datatype, string);
        }
        return new Empty();
    };
    
    this.checkPrefixDeclared = function(string, context, datatype) {
        if (string.match(":")) {
            var prefix = string.split(":")[0];
            if (context.map[prefix] == undefined) {
                return new NotAllowed("prefix " + prefix + " not declared", datatype, string);
            }
        }
        return new Empty();
    };
    
        
    this.checkParams = function(string, datatype, paramList) {
        var enumeration = new Array();
        for (var i in paramList) {
            var param = paramList[i];
            //gathers enumerations before triggering it
            if (param.localName == "enumeration") {
                enumeration.push(param.string);
            } else if (param.localName != "whiteSpace") {
                var check = this.checkParam(string, param, datatype);
                if (check instanceof NotAllowed) {
                    return check;
                }
            }
        }
        if (enumeration.length > 0) {
            var check = this.checkEnumeration(string, enumeration, datatype);
            if (check instanceof NotAllowed) {
                return check;
            }
        }
        return new Empty();
    };
    
    this.checkParam = function(string, param, datatype) {
        if (param.localName == "length") {
            var number = parseInt(param.string);
            if (string.length != number) {
                return new NotAllowed("invalid number of characters, expected : " + number + ", found : " + string.length, datatype, string);
            }
        } else if (param.localName == "minLength") {
            var number = parseInt(param.string);
            if (string.length < number) {
                return new NotAllowed("string too small, " + param.localName + " is : " + number + ", found : " + string.length, datatype, string);
            }
        } else if (param.localName == "maxLength") {
            var number = parseInt(param.string);
            if (string.length > number) {
                return new NotAllowed("string too long, " + param.localName + " is : " + number + ", found : " + string.length, datatype, string);
            }
        } else if (param.localName == "minInclusive") {
            var number = parseFloat(param.string);
            var value = parseFloat(string);
            if (value < number) {
                return new NotAllowed("value too small, " + param.localName + " is : " + number + ", found : " + value, datatype, string);
            }
        } else if (param.localName == "minExclusive") {
            var number = parseFloat(param.string);
            var value = parseFloat(string);
            if (value <= number) {
                return new NotAllowed("value too small, " + param.localName + " is : " + number + ", found : " + value, datatype, string);
            }
        } else if (param.localName == "maxInclusive") {
            var number = parseFloat(param.string);
            var value = parseFloat(string);
            if (value > number) {
                return new NotAllowed("value too big, " + param.localName + " is : " + number + ", found : " + value, datatype, string);
            }
        } else if (param.localName == "maxExclusive") {
            var number = parseFloat(param.string);
            var value = parseFloat(string);
            if (value >= number) {
                return new NotAllowed("value too big, " + param.localName + " is : " + number + ", found : " + value, datatype, string);
            }
        } else if (param.localName == "totalDigits") {
            var number = parseInt(param.string);
            var length = string.replace(/\./, "").length;
            if (length != number) {
                return new NotAllowed("invalid number of digits, " + param.localName + " is : " + number + ", found : " + length, datatype, string);
            }
        } else if (param.localName == "fractionDigits") {
            var number = parseInt(param.string);
            var regExp = new RegExp(fractionDigits + "{" + number + "}$");
            var check = this.checkRegExp(regExp, string, datatype);
            //adds an error message
            if (check instanceof NotAllowed) {
                return new NotAllowed("invalid number of fraction digits, expected : " + number, check, string);
            }
        } else if (param.localName == "pattern") {
            var escaped = param.string.replace(/\\/gm, "\\\\");
            var regExp = new RegExp("^" + escaped + "$");
            var check = this.checkRegExp(regExp, string, datatype);
            //adds an error message
            if (check instanceof NotAllowed) {
                return new NotAllowed("value : " + string + " does not respect pattern : " + param.string, check, string);
            }
        }
        return new Empty();
    };
    
    this.checkEnumeration = function(string, enumeration, datatype) {
        for (var i in enumeration) {
            var value = enumeration[i];
            var escaped = escapeRegExp(value);
            var regExp = new RegExp("^" + escaped + "$");
            var check = this.checkRegExp(regExp, string, datatype);
            if (check instanceof Empty) {
                return check;
            }
        }
        var msg = "invalid value : " + string + ", must be one of : [" + enumeration[0];
        for (var i = 1 ; i < enumeration.length ; i++) {
            var value = enumeration[i];
            msg += "," + value;
        }
        msg += "]";
        return new NotAllowed(msg, datatype, string);
    };
    
};