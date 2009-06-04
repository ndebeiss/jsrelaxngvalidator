/*
Copyright or © or Copr. Nicolas Debeissat, Brett Zamir

nicolas.debeissat@gmail.com (http://debeissat.nicolas.free.fr/) brettz9@yahoo.com

This software is a computer program whose purpose is to parse XML
files respecting SAX2 specifications.

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

(function () { // Begin namespace

/*
 int 	getIndex(java.lang.String qName)
          Look up the index of an attribute by XML qualified (prefixed) name.
 int 	getIndex(java.lang.String uri, java.lang.String localName)
          Look up the index of an attribute by Namespace name.
 int 	getLength()
          Return the number of attributes in the list.
 java.lang.String 	getLocalName(int index)
          Look up an attribute's local name by index.
 java.lang.String 	getQName(int index)
          Look up an attribute's XML qualified (prefixed) name by index.
 java.lang.String 	getType(int index)
          Look up an attribute's type by index.
 java.lang.String 	getType(java.lang.String qName)
          Look up an attribute's type by XML qualified (prefixed) name.
 java.lang.String 	getType(java.lang.String uri, java.lang.String localName)
          Look up an attribute's type by Namespace name.
 java.lang.String 	getURI(int index)
          Look up an attribute's Namespace URI by index.
 java.lang.String 	getValue(int index)
          Look up an attribute's value by index.
 java.lang.String 	getValue(java.lang.String qName)
          Look up an attribute's value by XML qualified (prefixed) name.
 java.lang.String 	getValue(java.lang.String uri, java.lang.String localName)
          Look up an attribute's value by Namespace name.
 */

// Private helpers for AttributesImpl (private static treated as private instance below)
function _getIndexByQName(qName) {
    var i = this.attsArray.length;
    while (i--) {
        if (this.attsArray[i].qName === qName) {
            return i;
        }
    }
    return -1;
}
function _getIndexByURI(uri, localName) {
    var i = this.attsArray.length;
    while (i--) {
        if (this.attsArray[i].namespaceURI === uri && this.attsArray[i].localName === localName) {
            return i;
        }
    }
    return -1;
}
function _getValueByIndex(index) {
    return this.attsArray[index] ? this.attsArray[index].value : null;
}
function _getValueByQName(qName) {
    var i = this.attsArray.length;
    while (i--) {
        if (this.attsArray[i].qName.equals(qName)) {
            return this.attsArray[i].value;
        }
    }
    return null;
}
function _getValueByURI(uri, localName) {
    var i = this.attsArray.length;
    while (i--) {
        if (this.attsArray[i].namespaceURI === uri && this.attsArray[i].localName === localName) {
            return this.attsArray[i].value;
        }
    }
    return null;
}

function Sax_Attribute(namespaceURI, prefix, localName, qName, type, value) {
    this.namespaceURI = namespaceURI;
    //avoiding error, the empty prefix of attribute must be null
    if (prefix === undefined || prefix === "") {
        this.prefix = null;
    } else {
        this.prefix = prefix;
    }
    this.localName = localName;
    this.qName = qName;
    this.type = type;
    this.value = value;
}

// INCOMPLETE
// http://www.saxproject.org/apidoc/org/xml/sax/helpers/AttributesImpl.html
function AttributesImpl(attsArray) {
    if (attsArray) {
        this.attsArray = attsArray;
    } else {
        this.attsArray = [];
    }
}

// INTERFACE: Attributes: http://www.saxproject.org/apidoc/org/xml/sax/Attributes.html
AttributesImpl.prototype.getIndex = function(arg1, arg2) {
    if (arg2 === undefined) {
        return _getIndexByQName.call(this, arg1);
    } else {
        return _getIndexByURI.call(this, arg1, arg2);
    }
};
AttributesImpl.prototype.getLength = function() {
    return this.attsArray.length;
};
//in order not to parse qname several times, add that convenience method
AttributesImpl.prototype.getPrefix = function(index) {
    return this.attsArray[index].prefix;
};
AttributesImpl.prototype.getLocalName = function(index) {
    return this.attsArray[index].localName;
};
AttributesImpl.prototype.getQName = function(index) {
    return this.attsArray[index].qName;
};
//not supported
AttributesImpl.prototype.getType = function(arg1, arg2) { // Should allow 1-2 arguments of different types: idnex or qName or uri+localName
    // Besides CDATA (default when not supported), could return "ID", "IDREF", "IDREFS", "NMTOKEN", "NMTOKENS", "ENTITY", "ENTITIES", or "NOTATION" (always in upper case).
    // "For an enumerated attribute that is not a notation, the parser will report the type as 'NMTOKEN'."
    // If uri and localName passed, should return the "attribute type as a string, or null if the attribute is not in the list or if Namespace processing is not being performed."
    // If qName passed, should return the "attribute type as a string, or null if the attribute is not in the list or if qualified names are not available."
    return "CDATA";
};
AttributesImpl.prototype.getURI = function(index) {
    return this.attsArray[index].namespaceURI;
};
AttributesImpl.prototype.getValue = function(arg1, arg2) {
    if (arg2 === undefined) {
        if (typeof arg1 === "string") {
            return _getValueByQName.call(this, arg1);
        } else {
            return _getValueByIndex.call(this, arg1);
        }
    } else {
        return _getValueByURI.call(this, arg1, arg2);
    }
};
// Other AttributesImpl methods
AttributesImpl.prototype.addAttribute = function (uri, localName, qName, type, value) {
    var prefix = null;
    if (localName.length !== qName.length) {
        prefix = qName.split(":")[0];
    }
    this.attsArray.push(new Sax_Attribute(uri, prefix, localName, qName, type, value));
};
//in order not to parse qname several times, add that convenience method
AttributesImpl.prototype.addAttribute = function (uri, prefix, localName, qName, type, value) {
    this.attsArray.push(new Sax_Attribute(uri, prefix, localName, qName, type, value));
};
AttributesImpl.prototype.clear = function () {
    this.attsArray = [];
};
AttributesImpl.prototype.removeAttribute = function (index) {
    this.attsArray.splice(index, 1);
};
//not sure those two functions should be available
AttributesImpl.prototype.setAttribute = function (index, uri, localName, qName, type, value) {};
AttributesImpl.prototype.setAttributes = function (atts) {};

AttributesImpl.prototype.setLocalName = function (index, localName) {
    this.attsArray[index].localName = localName;
};
AttributesImpl.prototype.setQName = function (index, qName) {
    var att = this.attsArray[index];
    att.qName = qName;
    if (name.indexOf(":") !== -1) {
        var splitResult = qName.split(":");
        att.prefix = splitResult[0];
        att.localName = splitResult[1];
    } else {
        att.prefix = null;
        att.localName = qName;
    }
};
AttributesImpl.prototype.setType = function (index, type) {
    this.attsArray[index].type = type;
};
AttributesImpl.prototype.setURI = function (index, uri) {
    this.attsArray[index].namespaceURI = uri;
};
AttributesImpl.prototype.setValue = function (index, value) {
    this.attsArray[index].value = value;
};


/*
Attributes2Impl()
          Construct a new, empty Attributes2Impl object.
Attributes2Impl(Attributes atts)
          Copy an existing Attributes or Attributes2 object.
*/
// http://www.saxproject.org/apidoc/org/xml/sax/ext/Attributes2Impl.html
// When implemented, use this attribute class if this.features['http://xml.org/sax/features/use-attributes2'] is true
function Attributes2Impl (atts) {
    if (atts) {}
    throw 'Attributes2Impl is presently unimplemented';
}
Attributes2Impl.prototype = new AttributesImpl();

// INTERFACE: Attributes2: http://www.saxproject.org/apidoc/org/xml/sax/ext/Attributes2.html
/*
 boolean 	isDeclared(int index)
          Returns false unless the attribute was declared in the DTD.
 boolean 	isDeclared(java.lang.String qName)
          Returns false unless the attribute was declared in the DTD.
 boolean 	isDeclared(java.lang.String uri, java.lang.String localName)
          Returns false unless the attribute was declared in the DTD.
 boolean 	isSpecified(int index)
          Returns true unless the attribute value was provided by DTD defaulting.
 boolean 	isSpecified(java.lang.String qName)
          Returns true unless the attribute value was provided by DTD defaulting.
 boolean 	isSpecified(java.lang.String uri, java.lang.String localName)
          Returns true unless the attribute value was provided by DTD defaulting.
*/
Attributes2Impl.prototype.isDeclared = function (indexOrQNameOrURI, localName) {
};
Attributes2Impl.prototype.isSpecified = function (indexOrQNameOrURI, localName) {
};
// Other Attributes2Impl methods
/*
 void 	addAttribute(java.lang.String uri, java.lang.String localName, java.lang.String qName, java.lang.String type, java.lang.String value)
          Add an attribute to the end of the list, setting its "specified" flag to true.
void 	removeAttribute(int index)
          Remove an attribute from the list.
 void 	setAttributes(Attributes atts)
          Copy an entire Attributes object.
 void 	setDeclared(int index, boolean value)
          Assign a value to the "declared" flag of a specific attribute.
 void 	setSpecified(int index, boolean value)
          Assign a value to the "specified" flag of a specific attribute.
 **/
Attributes2Impl.prototype.addAttribute = function (uri, localName, qName, type, value) {
};
Attributes2Impl.prototype.removeAttribute = function (index) {
};
Attributes2Impl.prototype.setAttributes = function (atts) {
};
Attributes2Impl.prototype.setDeclared = function (index, value) {
};
Attributes2Impl.prototype.setSpecified = function (index, value) {
};

this.AttributesImpl = AttributesImpl;

}()); // end namespace