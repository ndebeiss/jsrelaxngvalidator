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

date  	Defines a date value
dateTime 	Defines a date and time value
duration 	Defines a time interval
gDay 	Defines a part of a date - the day (DD)
gMonth 	Defines a part of a date - the month (MM)
gMonthDay 	Defines a part of a date - the month and day (MM-DD)
gYear 	Defines a part of a date - the year (YYYY)
gYearMonth 	Defines a part of a date - the year and month (YYYY-MM)
time 	Defines a time value

extract from http://www.w3schools.com/Schema/schema_dtypes_numeric.asp :

byte  	A signed 8-bit integer
decimal 	A decimal value
int 	A signed 32-bit integer
integer 	An integer value
long 	A signed 64-bit integer
negativeInteger 	An integer containing only negative values ( .., -2, -1.)
nonNegativeInteger 	An integer containing only non-negative values (0, 1, 2, ..)
nonPositiveInteger 	An integer containing only non-positive values (.., -2, -1, 0)
positiveInteger 	An integer containing only positive values (1, 2, ..)
short 	A signed 16-bit integer
unsignedLong 	An unsigned 64-bit integer
unsignedInt 	An unsigned 32-bit integer
unsignedShort 	An unsigned 16-bit integer
unsignedByte 	An unsigned 8-bit integer

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
	
	var tokenRegExp = new RegExp("^[^" + whitespaceChar + "(  +)]$");
	
	/*
	datatypeAllows :: Datatype -> ParamList -> String -> Context -> Bool
	datatypeAllows ("",  "string") [] _ _ = True
	datatypeAllows ("",  "token") [] _ _ = True
	*/
	this.datatypeAllows = function(datatype, paramList, string, context) {
		if (datatype.uri == "http://www.w3.org/2001/XMLSchema-datatypes") {
			if (datatype.localName == "language") {
				if (this.checkRegExp(languageRegExp, string)) {
					return new Empty();
				} else {
					return new NotAllowed("invalid " + datatype.localName, datatype, string);
				}
			} else if (datatype.localName == "Name") {
				if (this.checkRegExp(nameRegExp, string)) {
					return new Empty();
				} else {
					return new NotAllowed("invalid " + datatype.localName, datatype, string);
				}
			} else if (datatype.localName == "NCName") {
				if (this.checkRegExp(ncNameRegExp, string)) {
					return new Empty();
				} else {
					return new NotAllowed("invalid " + datatype.localName, datatype, string);
				}
			} else if (datatype.localName == "normalizedString") {
				if (this.checkRegExp(normalizedStringRegExp, string)) {
					return new Empty();
				} else {
					return new NotAllowed("invalid " + datatype.localName, datatype, string);
				}
			} else if (datatype.localName == "QName") {
				if (this.checkRegExp(qNameRegExp, string)) {
					return new Empty();
				} else {
					return new NotAllowed("invalid " + datatype.localName, datatype, string);
				}
			} else if (datatype.localName == "string") {
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


	this.checkRegExp = function(regExp, string) {
		return regExp.test(string);
	}







}