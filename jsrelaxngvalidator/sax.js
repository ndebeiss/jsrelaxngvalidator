/*
Copyright or © or Copr. Nicolas Debeissat

nicolas.debeissat@gmail.com (http://debeissat.nicolas.free.fr/)

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

function SAXParser(contentHandler) {
    this.contentHandler = contentHandler;
    this.index = -1;
    this.doctypeDeclared = false;


    /** Scanner states  */
    this.STATE_XML_DECL                  =  0;
    this.STATE_PROLOG                    =  1;
    this.STATE_ROOT_ELEMENT              =  2;
    this.STATE_CONTENT                   =  3;
    this.STATE_TRAILING_MISC             =  4;

    this.state = this.STATE_XML_DECL;
    
    this.WARNING = "W";
    this.ERROR = "E";
    this.FATAL = "F";
    
    this.elementsStack;
    /* for each depth, a map of namespaces */
    this.namespaces;
    
    
    this.parse = function(xml) {
        this.xml = xml;
        this.length = xml.length;
        this.index = 0;
        this.char = this.xml.charAt(this.index);
        this.doctypeDeclared = false;
        this.state = this.STATE_XML_DECL;
        this.elementsStack = new Array();
        this.namespaces = new Array();
        this.contentHandler.startDocument();
        try {
            while (this.index < this.length) {
                this.next();
            }
            throw new EndOfInputException();
        } catch(e) {
            if (e instanceof SAXException) {
                this.contentHandler.fatalError(e);
            } else if (e instanceof EndOfInputException) {
                if (this.elementsStack.length > 0) {
                    this.fireError("the markup " + this.elementsStack.pop() + " has not been closed", this.FATAL);
                } else {
                    this.contentHandler.endDocument();
                }
            }
        }
    };
    
    this.next = function() {
        this.skipWhiteSpaces();
        if (this.char == '>') {
            this.nextChar();
        } else if (this.char == '<') {
            this.nextChar();
            this.scanLT();
        } else if (this.elementsStack.length > 0) {
            this.scanText();
        //if elementsStack is empty it is text misplaced
        } else {
            this.fireError("can not have text at root level of the XML", this.FATAL);
        }
    };
    
    
    
    // [1] document ::= prolog element Misc*
    //
    // [22] prolog ::= XMLDecl? Misc* (doctypedecl Misc*)?
    // [23] XMLDecl ::= '<?xml' VersionInfo EncodingDecl? SDDecl? S? '?>'
    // [24] VersionInfo ::= S 'version' Eq (' VersionNum ' | " VersionNum ")
    //
    // The beginning of XMLDecl simplifies to:
    //    '<?xml' S ...
    //
    // [27] Misc ::= Comment | PI |  S
    // [15] Comment ::= '<!--' ((Char - '-') | ('-' (Char - '-')))* '-->'
    // [16] PI ::= '<?' PITarget (S (Char* - (Char* '?>' Char*)))? '?>'
    // [17] PITarget ::= Name - (('X' | 'x') ('M' | 'm') ('L' | 'l'))
    //
    // [28] doctypedecl ::= '<!DOCTYPE' S Name (S ExternalID)? S?
    //                      ('[' (markupdecl | PEReference | S)* ']' S?)? '>'
    //
    //White Space
    // [3] S ::=(#x20 | #x9 | #xD | #xA)+
    this.scanLT = function() {
        if (this.state == this.STATE_XML_DECL) {
            if (!this.scanXMLDeclOrTextDecl()) {
                this.state = this.STATE_PROLOG;
                this.scanLT();
            } else {
                //if it was a XMLDecl (only one XMLDecl is permitted)
                this.state = this.STATE_PROLOG;
            }
        } else if (this.state == this.STATE_PROLOG) {
            if (this.char == '!') {
                this.nextChar(true);
                if (!this.scanComment()) {
                    if (this.doctypeDeclared) {
                        this.fireError("can not have two doctype declaration", this.FATAL);
                    } else if (this.scanDoctypeDecl()) {
                        // only one doctype declaration is allowed
                        this.doctypeDeclared = true;
                    } else {
                        this.fireError("neither comment nor doctype declaration after &lt;!", this.FATAL);
                    }
                }
            } else if (this.char == '?') {
                this.nextChar(true);
                this.scanPI();
            } else {
                this.state = this.STATE_ROOT_ELEMENT;
                //does not go to next char exiting the method
                this.scanLT();
            }
        } else if (this.state == this.STATE_ROOT_ELEMENT) {
            if (this.scanMarkup()) {
                this.state = this.STATE_CONTENT;
            } else {
                this.state = this.STATE_TRAILING_MISC;
            }
        } else if (this.state == this.STATE_CONTENT) {
            if (this.char == '!') {
                this.nextChar();
                if (!this.scanComment()) {
                    if (!this.scanCData()) {
                        this.fireError("neither comment nor CDATA after &lt;!", this.FATAL);
                    }
                }
            } else if (this.char == '?') {
                this.nextChar();
                this.scanPI();
            } else if (this.char == '/') {
                this.nextChar();
                if (this.scanEndingTag()) {
                    if (this.elementsStack.length == 0) {
                        this.state = this.STATE_TRAILING_MISC;
                    }
                }
            } else {
                if (!this.scanMarkup()) {
                    this.fireError("not a valid markup", this.FATAL);
                }
            }
        } else if (this.state == this.STATE_TRAILING_MISC) {
            if (this.char == '!') {
                this.nextChar();
                if (!this.scanComment()) {
                    this.fireError("end of document, only comment or processing instruction are allowed", this.FATAL);
                }
            } else if (this.char == '?') {
                this.nextChar();
                if (!this.scanPI()) {
                    this.fireError("end of document, only comment or processing instruction are allowed", this.FATAL);
                }
            }
        }
    };
    
    
    // 14]   	CharData ::= [^<&]* - ([^<&]* ']]>' [^<&]*)
    this.scanText = function() {
        if (this.char == '&') {
            this.nextChar();
            if (this.char == '#') {
                this.nextChar();
                this.scanCharRef();
            } else {
                this.scanEntityRef();
            }
        } else {
            var start = this.index;
            var ch = this.nextRegExp(/[<&]/);
            var length = this.index - start;
            this.contentHandler.characters(ch, start, length);
        }
    };
    
    
    // [15] Comment ::= '<!--' ((Char - '-') | ('-' (Char - '-')))* '-->'
    this.scanComment = function() {
        if (this.char == '-') {
            this.nextChar();
            if (this.char == '-') {
                this.nextRegExp(/--/);
                //goes to second '-'
                this.nextChar(true);
                this.nextChar(true);
                //must be '>'
                if (this.char == '>') {
                    this.nextChar(true);
                    return true;
                } else {
                    this.fireError("end of comment not valid, must be --&gt;", this.FATAL);
                }
            } else {
                this.fireError("beginning comment markup is invalid, must be &lt;!--", this.FATAL);
            }
        } else {
            // can be a doctype
            return false;
        }
    };
        
        
    // [23] XMLDecl ::= '<?xml' VersionInfo EncodingDecl? SDDecl? S? '?>'
    // [24] VersionInfo ::= S 'version' Eq (' VersionNum ' | " VersionNum ")
    // [80] EncodingDecl ::= S 'encoding' Eq ('"' EncName '"' |  "'" EncName "'" )
    // [81] EncName ::= [A-Za-z] ([A-Za-z0-9._] | '-')*
    // [32] SDDecl ::= S 'standalone' Eq (("'" ('yes' | 'no') "'")
    //                 | ('"' ('yes' | 'no') '"'))
    //
    // [77] TextDecl ::= '<?xml' VersionInfo? EncodingDecl S? '?>'
    this.scanXMLDeclOrTextDecl = function() {
        if (this.xml.substr(this.index, 5) == '?xml ') {
            this.nextGT();
            return true;
        } else {
            return false;
        }	
    };
    
    
    // [16] PI ::= '<?' PITarget (S (Char* - (Char* '?>' Char*)))? '?>'
    // [17] PITarget ::= Name - (('X' | 'x') ('M' | 'm') ('L' | 'l'))
    this.scanPI = function() {
        this.contentHandler.processingInstruction(this.nextName(), "");
        this.nextGT();
        return true;
    };
    
    
    // [28] doctypedecl ::= '<!DOCTYPE' S Name (S ExternalID)? S?
    //                      ('[' (markupdecl | PEReference | S)* ']' S?)? '>'
    this.scanDoctypeDecl = function() {
        if (this.xml.substr(this.index, 7) == 'DOCTYPE') {
            this.nextGT();
            return true;
        } else {
            this.fireError("invalid doctype declaration, must be &lt;!DOCTYPE", this.FATAL);
        }
    };
    
    
    // [39] element ::= EmptyElemTag | STag content ETag
    // [44] EmptyElemTag ::= '<' Name (S Attribute)* S? '/>'
    // [40] STag ::= '<' Name (S Attribute)* S? '>'
    // [41] Attribute ::= Name Eq AttValue
    // [10] AttValue ::= '"' ([^<&"] | Reference)* '"' | "'" ([^<&'] | Reference)* "'"
    // [67] Reference ::= EntityRef | CharRef
    // [68] EntityRef ::= '&' Name ';'
    // [66] CharRef ::= '&#' [0-9]+ ';' | '&#x' [0-9a-fA-F]+ ';'
    // [43] content ::= (element | CharData | Reference | CDSect | PI | Comment)*
    // [42] ETag ::= '</' Name S? '>'
    //[4]  NameChar ::= Letter | Digit | '.' | '-' | '_' | ':' | CombiningChar | Extender
    //[5]  Name ::= Letter | '_' | ':') (NameChar)*
    this.scanMarkup = function() {
        var qName = this.getQName();
        this.elementsStack.push(qName.qName);
        this.scanElement(qName);
        return true;
    };	
    
    this.getQName = function() {
        var name = this.nextName();
        var prefix = "";
        var localName = name;
        if (name.indexOf(':') != -1) {
            var splitResult = name.split(':');
            prefix = splitResult[0];
            localName = splitResult[1];
        }
        return new sax_QName(prefix, localName);
    };
    
    this.scanElement = function(qName) {
        var namespacesDeclared = new Array();
        var atts = this.scanAttributes(namespacesDeclared);
        this.namespaces.push(namespacesDeclared);
        var namespaceURI = this.getNamespaceURI(qName.prefix);
        this.contentHandler.startElement(namespaceURI, qName.localName, qName.qName, atts);
        this.skipWhiteSpaces();
        if (this.char == '/') {
            this.nextChar(true);
            if (this.char == '>') {
                this.elementsStack.pop();
                this.endMarkup(namespaceURI, qName);
            } else {
                this.fireError("invalid empty markup, must finish with /&gt;", this.FATAL);
            }
        }
    };
    
    this.getNamespaceURI = function(prefix) {
        for (var i in this.namespaces) {
            var namespaceURI = this.namespaces[i][prefix];
            if (namespaceURI) {
                return namespaceURI;
            }
        }
        if (prefix == '') {
            return "";
        }
        this.fireError("prefix " + prefix + " not known in namespaces map", this.FATAL);
    };
    
    this.scanAttributes = function(namespacesDeclared) {
        var atts = new Array();
        this.scanAttribute(atts, namespacesDeclared);
        return new sax_Attributes(atts);
    };
    
    this.scanAttribute = function(atts, namespacesDeclared) {
        this.skipWhiteSpaces();
        if (this.char != '>' && this.char != '/') {
            var attQName = this.getQName();
            this.skipWhiteSpaces();
            if (this.char == '=') {
                this.nextChar();
                // xmlns:bch="http://benchmark"
                if (attQName.prefix == 'xmlns') {
                    namespacesDeclared[attQName.localName] = this.scanAttValue();
                    this.contentHandler.startPrefixMapping(attQName.localName, namespacesDeclared[attQName.localName]);
                } else if (attQName.qName == 'xmlns') {
                    namespacesDeclared[""] = this.scanAttValue();
                    this.contentHandler.startPrefixMapping("", namespacesDeclared[""]);
                } else {
                    var namespaceURI = this.getNamespaceURI(attQName.prefix);
                    var value = this.scanAttValue();
                    var att = new sax_Attribute(attQName, namespaceURI, value);
                    atts.push(att);
                }
                this.scanAttribute(atts, namespacesDeclared);
            } else {
                this.fireError("invalid attribute, must contain = between name and value", this.FATAL);
            }
        }
    };
    
    // [10] AttValue ::= '"' ([^<&"] | Reference)* '"' | "'" ([^<&'] | Reference)* "'"
    this.scanAttValue = function() {
        if (this.char == '"' || this.char == "'") {
            try {
                var attValue = this.quoteContent();
            //adding a message in that case
            } catch(e) {
                if (e instanceof EndOfInputException) {
                    this.fireError("document incomplete, attribute value declaration must end with a quote", this.FATAL);
                } else {
                    throw e;
                }
            }
            return attValue;
        } else {
            this.fireError("invalid attribute value declaration, must begin with a quote", this.FATAL);
        }
    };
    
    // [18]   	CDSect	   ::=   	 CDStart  CData  CDEnd
    // [19]   	CDStart	   ::=   	'<![CDATA['
    // [20]   	CData	   ::=   	(Char* - (Char* ']]>' Char*))
    // [21]   	CDEnd	   ::=   	']]>'
    this.scanCData = function() {
        if (this.xml.substr(this.index, 7) == '[CDATA[') {
            this.index += 7;
            this.nextRegExp(/]]>/);
            //goes after final '>'
            this.index += 3;
            this.char = this.xml.charAt(this.index);
            return true;
        } else {
            return false;
        }
    };
    
    // [66] CharRef ::= '&#' [0-9]+ ';' | '&#x' [0-9a-fA-F]+ ';'
    this.scanCharRef = function() {
        var oldIndex = this.index;
        if (this.char == 'x') {
            this.nextChar(true);
            while (this.char != ';') {
                if (!/[0-9a-fA-F]/.test(this.char)) {
                    this.fireError("invalid char reference beginning with x, must contain alphanumeric characters only", this.ERROR);
                }
                this.nextChar(true);
            }
        } else {
            this.nextChar(true);
            while (this.char != ';') {
                if (!/\d/.test(this.char)) {
                    this.fireError("invalid char reference, must contain numeric characters only", this.ERROR);
                }
                this.nextChar(true);
            }
        }
        this.contentHandler.characters(this.xml.substring(oldIndex, this.index), oldIndex, this.index - oldIndex);
        return true;
    };
    
    //[68]  EntityRef ::= '&' Name ';'
    this.scanEntityRef = function() {
        var ref = this.nextRegExp(/;/);
        try {
            var attValue = this.quoteContent();
        //adding a message in that case
        } catch(e) {
            if (e instanceof EndOfInputException) {
                this.fireError("document incomplete, entity reference must end with ;", this.FATAL);
            } else {
                throw e;
            }
        }
        return true;
    };
    
    // [42] ETag ::= '</' Name S? '>'
    this.scanEndingTag = function() {
        var qName = this.getQName();
        var namespaceURI = this.getNamespaceURI(qName.prefix);
        if (qName.qName == this.elementsStack.pop()) {
            this.skipWhiteSpaces();
            if (this.char == '>') {
                this.endMarkup(namespaceURI, qName);
                this.nextChar(true);
                return true;
            } else {
                this.fireError("invalid ending markup, does not finish with &gt;", this.FATAL);
            }
        } else {
            this.fireError("invalid ending markup, markup name does not match current one", this.FATAL);
        }
    };
    
    
    this.endMarkup = function(namespaceURI, qName) {
        this.contentHandler.endElement(namespaceURI, qName.localName, qName.qName);
        var namespacesRemoved = this.namespaces.pop();
        for (var i in namespacesRemoved) {
            this.contentHandler.endPrefixMapping(i);
        }
    };
    
    
    /*
    if dontSkipWhiteSpace is not passed, then it is false so skipWhiteSpaces is default
    if end of document, char is  ''
    */
    this.nextChar = function(dontSkipWhiteSpace) {
        this.index++;
        this.char = this.xml.charAt(this.index);
        if (!dontSkipWhiteSpace) {
            this.skipWhiteSpaces();
        }
        if (this.index >= this.length) {
            throw new EndOfInputException();
        }
    };
    
    this.skipWhiteSpaces = function() {
        while (/[\t\n\r ]/.test(this.char)) {
            this.index++;
            if (this.index >= this.length) {
                throw new EndOfInputException();
            }
            this.char = this.xml.charAt(this.index);
        }
    };
    
    
    /*
    goes to next reg exp and return content, from current char to the char before reg exp
    if next reg exp is not found return false, must differenciate from ''
    */
    this.nextRegExp = function(regExp) {
        var oldIndex = this.index;
        var inc = this.xml.substr(this.index).search(regExp);
        if (inc == -1) {
            throw new EndOfInputException();
        } else {
            this.index += inc;
            this.char = this.xml.charAt(this.index);
            return this.xml.substring(oldIndex, this.index);
        }
    };
    
    /*
    [4]   	NameChar	   ::=   	 Letter | Digit | '.' | '-' | '_' | ':' | CombiningChar | Extender
    [5]   	Name	   ::=   	(Letter | '_' | ':') (NameChar)*
    */
    this.nextName = function() {
        return this.nextRegExp(/[^\w\.\-_:]/);
    };
    
    
    this.nextGT = function() {
        var content = this.nextRegExp(/>/);
        this.index++;
        this.char = this.xml.charAt(this.index);
        return content;
    };
    
    /*
    goes after ' or " and return content
    current char is opening ' or "
    */
    this.quoteContent = function() {
        this.index++;
        var content = this.nextRegExp(/["']/);
        this.index++;
        this.char = this.xml.charAt(this.index);
        return content;
    };

    this.fireError = function(message, gravity) {
        var saxException = new SAXException(message, this.char, this.index);
        if (gravity == this.WARNING) {
            this.contentHandler.warning(saxException);
        } else if (gravity == this.ERROR) {
            this.contentHandler.error(saxException);
        } else if (gravity == this.FATAL) {
            throw(saxException);
        }
    };
    
}

function sax_QName(prefix, localName) {
    this.prefix = prefix;
    this.localName = localName;
    if (prefix != '') {
        this.qName = prefix + ":" + localName;
    } else {
        this.qName = localName;
    }
    
    this.equals = function(qName) {
        return this.qName == qName.qName;
    }
}


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
function sax_Attributes(attsArray) {
    this.attsArray = attsArray;
    
    this.getIndex = function(arg1, arg2) {
        if (arg2 == undefined) {
            return this.getIndexByQname(arg1);
        } else {
            return this.getIndexByUri(arg1, arg2);
        }
    }
    this.getIndexByQname = function(qName) {
        for (var i in attsArray) {
            if (attsArray[i].qName.equals(qName)) {
                return i;
            }
        }
        return -1;
    }
    this.getIndexByUri = function(uri, localName) {
        for (var i in attsArray) {
            if (attsArray[i].namespaceURI == uri && attsArray[i].qName.localName == localName) {
                return i;
            }
        }
        return -1;
    }
    this.getLength = function() {
        return attsArray.length;
    }
    this.getLocalName = function(index) {
        return attsArray[index].qName.localName;
    }
    this.getQName = function(index) {
        return attsArray[index].qName.qName;
    }
    //not supported
    this.getType = function(arg1, arg2) {
        return "CDATA";
    }
    this.getURI = function(index) {
        return attsArray[index].namespaceURI;
    }
    this.getValue = function(arg1, arg2) {
        if (arg2 == undefined) {
            if (typeof arg1 == "string") {
                return this.getValueByQName(arg1);
            } else {
                return this.getValueByIndex(arg1);
            }
        } else {
            return this.getValueByUri(arg1, arg2);
        }
    }
    this.getValueByIndex = function(index) {
        return attsArray[index].value;
    }
    this.getValueByQName = function(qName) {
        for (var i in attsArray) {
            if (attsArray[i].qName.equals(qName)) {
                return attsArray[i].value;
            }
        }
    }
    this.getValueByUri = function(uri, localName) {
        for (var i in attsArray) {
            if (attsArray[i].namespaceURI == uri && attsArray[i].qName.localName == localName) {
                return attsArray[i].value;
            }
        }
    }
    
}

function sax_Attribute(qName, namespaceURI, value) {
    this.qName = qName;
    this.namespaceURI = namespaceURI;
    this.value = value;
}

function SAXException(message, char, index, exception) {
    this.message = message;
    this.char = char;
    this.index = index;
    this.exception = exception;
}

function EndOfInputException() {}
