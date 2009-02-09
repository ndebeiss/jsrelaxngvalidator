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

function SAXParser(eventHandler) {
	this.eventHandler = eventHandler;
	this.index = -1;
	this.char = '';
	this.xml = "";
	this.doctypeDeclared = false;


    /** Scanner states  */
	this.STATE_XML_DECL                  =  0;
	this.STATE_START_OF_MARKUP           =  1;
	this.STATE_COMMENT                   =  2;
	this.STATE_PI                        =  3;
	this.STATE_DOCTYPE                   =  4;
	this.STATE_PROLOG                    =  5;
	this.STATE_ROOT_ELEMENT              =  6;
	this.STATE_CONTENT                   =  7;
	this.STATE_REFERENCE                 =  8;
	this.STATE_ATTRIBUTE_LIST            =  9;
	this.STATE_ATTRIBUTE_NAME            = 10;
	this.STATE_ATTRIBUTE_VALUE           = 11;
	this.STATE_TRAILING_MISC             = 12;
	this.STATE_END_OF_INPUT              = 13;
	this.STATE_ERROR_FIRED               = 14;
	this.STATE_EXTERNAL_ERROR_FIRED      = 15;

	this.state = this.STATE_XML_DECL;
	
	this.elementsStack;
	/* for each depth, a map of namespaces */
	this.namespaces;
	
	
	this.parse = function(xml) {
		this.index = -1;
		this.char = '';
		this.xml = xml;
		this.doctypeDeclared = false;
		this.state = this.STATE_XML_DECL;
		this.elementsStack = new Array();
		this.namespaces = new Array();
		this.eventHandler.startDocument();
		while (this.state != this.STATE_ERROR_FIRED && this.state != this.STATE_EXTERNAL_ERROR_FIRED && this.state != this.STATE_END_OF_INPUT) {
			this.next();
		}
		if (this.state == this.STATE_END_OF_INPUT) {
			if (this.elementsStack.length > 0) {
				this.fireError("the markup " + this.elementsStack.pop() + " has not been closed");
			} else {
				this.eventHandler.endDocument();
			}
		}
	};
	
	this.next = function() {
		this.nextChar();
		if (this.state == this.STATE_END_OF_INPUT) {
			return;
		} else if (this.char == '<') {
			this.nextChar();
			this.scanLT();
		} else if (this.elementsStack.length > 0) {
			this.scanText();
		//if elementsStack.length it can be endOfInput otherwise it is text misplaced
		} else if (this.state != this.STATE_END_OF_INPUT) {
			this.fireError("can not have text at root level of the XML");
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
			if (!this.scanXMLDeclOrTextDecl() && this.state != this.STATE_ERROR_FIRED) {
				this.state = this.STATE_PROLOG;
				this.scanLT();
			} else {
				//if it was a XMLDecl (only one XMLDecl is permitted)
				this.state = this.STATE_PROLOG;
			}
		} else if (this.state == this.STATE_PROLOG) {
			if (this.char == '!') {
				this.nextChar();
				if (!this.scanComment() && this.state != this.STATE_ERROR_FIRED) {
					if (this.doctypeDeclared) {
						this.fireError("can not have two document type declaration");
					} else if (this.scanDoctypeDecl()) {
						// only one doctype declaration is allowed
						this.doctypeDeclared = true;
					}
				}
			} else if (this.char == '?') {
				this.nextChar();
				this.scanPI();
			} else {
				this.state = this.STATE_ROOT_ELEMENT;
				this.scanLT();
			}
		} else if (this.state == this.STATE_ROOT_ELEMENT) {
			if (this.scanMarkup()) {
				this.state = this.STATE_CONTENT;
			}
		} else if (this.state == this.STATE_CONTENT) {
			if (this.char == '!') {
				this.nextChar();
				if (!this.scanComment() && this.state != this.STATE_ERROR_FIRED) {
					if (!this.scanCData() && this.state != this.STATE_ERROR_FIRED) {
						this.fireError("neither comment nor CDATA after markup &lt;!");
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
				if (!this.scanMarkup() && this.state != this.STATE_ERROR_FIRED) {
					this.fireError("not a valid markup");
				}
			}
		} else if (this.state == this.STATE_TRAILING_MISC) {
			if (this.char == '!') {
				this.nextChar();
				if (!this.scanComment() && this.state != this.STATE_ERROR_FIRED) {
					this.fireError("end of document, only comment or processing instruction is allowed");
				}
			} else if (this.char == '?') {
				this.nextChar();
				if (!this.scanPI() && this.state != this.STATE_ERROR_FIRED) {
					this.fireError("end of document, only comment or processing instruction is allowed");
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
				if (!this.scanCharRef() && this.state != this.STATE_ERROR_FIRED) {
					this.fireError("invalid char reference");
				}
			} else {
				if (!this.scanEntityRef() && this.state != this.STATE_ERROR_FIRED) {
					this.fireError("invalid entity reference");
				}
			}
		} else {
			var start = this.index;
			var ch = this.nextRegExp(/[^<&][<&]/);
			if (this.state == this.STATE_END_OF_INPUT) {
				this.fireError("document incomplete, finishing in a text node");
			} else {
				var length = this.index - start;
				this.eventHandler.characters(ch,start,length);
			}
		}
	};
	
	
	// [15] Comment ::= '<!--' ((Char - '-') | ('-' (Char - '-')))* '-->'
	this.scanComment = function() {
		if (this.char == '-') {
			this.nextChar();
			if (this.char == '-') {
				this.nextRegExp(/--/);
				if (this.state == this.STATE_END_OF_INPUT) {
					this.fireError("document incomplete, finishing in a comment");
					return false;
				}
				//goes to second '-'
				this.nextChar();
				this.nextChar(true);
				//must be '>'
				if (this.char == '>') {
					return true;
				} else {
					this.fireError("end of comment not valid, must be --&gt;");
					return false;
				}
			} else {
				this.fireError("beginning comment markup is invalid, must be &lt;!--");
				return false;
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
		if (this.xml.substr(this.index,5) == '?xml ') {
			this.nextGT();
			if (this.state == this.STATE_END_OF_INPUT) {
				this.fireError("document incomplete, finishing in a XML declaraction");
				return false;
			}
			return true;
		} else {
			return false;
		}	
	};
	
	
	// [16] PI ::= '<?' PITarget (S (Char* - (Char* '?>' Char*)))? '?>'
    // [17] PITarget ::= Name - (('X' | 'x') ('M' | 'm') ('L' | 'l'))
	this.scanPI = function() {
		this.eventHandler.processingInstruction(this.nextName(),"");
		this.nextGT();
		if (this.state == this.STATE_END_OF_INPUT) {
			this.fireError("document incomplete, finishing in a processing instruction");
			return false;
		}
		return true;
	};
	
	
	// [28] doctypedecl ::= '<!DOCTYPE' S Name (S ExternalID)? S?
    //                      ('[' (markupdecl | PEReference | S)* ']' S?)? '>'
	this.scanDoctypeDecl = function() {
		if (this.xml.substr(this.index,7) == 'DOCTYPE') {
			this.nextGT();
			if (this.state == this.STATE_END_OF_INPUT) {
				this.fireError("document incomplete, finishing in a doctype declaration");
				return false;
			}
			return true;
		} else {
			this.fireError("invalid doctype declaration, must be &lt;!DOCTYPE");
			return false;
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
		if (this.state == this.STATE_ERROR_FIRED) {
			return false;
		}
		this.elementsStack.push(qName.qName);
		this.scanElement(qName);
		if (this.state == this.STATE_ERROR_FIRED || this.state == this.STATE_EXTERNAL_ERROR_FIRED) {
			return false;
		}
		return true;
	};	
	
	this.getQName = function() {
		var name = this.nextName();
		if (this.state == this.STATE_END_OF_INPUT) {
			this.fireError("document incomplete, finishing in a markup declaration");
			return;
		}
		var prefix = "";
		var localName = name;
		if (name.indexOf(':') != -1) {
			var splitResult = name.split(':');
			prefix = splitResult[0];
			localName = splitResult[1];
		}
		return new qName(prefix,localName);
	};
	
	this.scanElement = function(qName) {
		var namespacesDeclared = new Array();
		var atts = this.scanAttributes(namespacesDeclared);
		if (this.state != this.STATE_ERROR_FIRED) {
			this.namespaces.push(namespacesDeclared);
			var namespaceURI = this.getNamespaceURI(qName.prefix);
			if (this.state != this.STATE_ERROR_FIRED) {
				this.eventHandler.startElement(namespaceURI,qName.localName,qName.qName,atts);
				if (this.state != this.STATE_EXTERNAL_ERROR_FIRED) {
					this.skipWhiteSpaces();
					if (this.char == '/') {
						this.nextChar(true);
						if (this.char == '>') {
							this.elementsStack.pop();
							this.endMarkup(namespaceURI,qName);
						} else {
							this.fireError("invalid empty markup, must finish with /&gt;");
						}
					}
				}
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
		this.fireError("prefix " + prefix + " not known in namespaces map");
	};
	
	this.scanAttributes = function(namespacesDeclared) {
		var atts = new Array();
		this.scanAttribute(atts,namespacesDeclared);
		return atts;
	};
	
	this.scanAttribute = function(atts,namespacesDeclared) {
		this.skipWhiteSpaces();
		if (this.char != '>' && this.char != '/') {
			var attQName = this.getQName();
			if (this.state != this.STATE_ERROR_FIRED) {
				this.skipWhiteSpaces();
				if (this.char == '=') {
					this.nextChar();
					// xmlns:bch="http://benchmark"
					if (attQName.prefix == 'xmlns') {
						namespacesDeclared[attQName.localName] = this.scanAttValue();
						this.eventHandler.startPrefixMapping(attQName.localName,namespacesDeclared[attQName.localName]);
					} else if (attQName.qName == 'xmlns') {
						namespacesDeclared[""] = this.scanAttValue();
						this.eventHandler.startPrefixMapping("",namespacesDeclared[""]);
					} else {
						atts[attQName.qName] = this.scanAttValue();
					}
					if (this.state != this.STATE_ERROR_FIRED) {
						this.scanAttribute(atts,namespacesDeclared);
					}
				} else {
					this.fireError("invalid attribute, must contain = between name and value");
				}
			}
		}
	};
	
	// [10] AttValue ::= '"' ([^<&"] | Reference)* '"' | "'" ([^<&'] | Reference)* "'"
	this.scanAttValue = function() {
		if (this.char == '"' || this.char == "'") {
			var attValue = this.quoteContent();
			if (this.state == this.STATE_END_OF_INPUT) { 
				this.fireError("document incomplete, attribute value declaration must end with a quote");
			} else {
				return attValue;
			}
		} else {
			this.fireError("invalid attribute value declaration, must begin with a quote");
		}
	};
	
	// [18]   	CDSect	   ::=   	 CDStart  CData  CDEnd
	// [19]   	CDStart	   ::=   	'<![CDATA['
	// [20]   	CData	   ::=   	(Char* - (Char* ']]>' Char*))
	// [21]   	CDEnd	   ::=   	']]>'
	this.scanCData = function() {
		if (this.xml.substr(this.index,7) == '[CDATA[') {
			this.index += 7;
			this.nextRegExp(/]]>/);
			if (this.state == this.STATE_END_OF_INPUT) { 
				this.fireError("document incomplete, CDATA section must finish with ]]&gt;");
				return false;
			}
			//goes to final '>'
			this.index += 2;
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
			this.nextChar();
			while (this.char != ';') {
				this.index++;
				this.char = this.xml.charAt(this.index);
				if (!/[0-9a-fA-F]/.test(this.char)) {
					this.fireError("invalid char reference beginning with x, must contain alphanumeric characters only");
					return false;
				}
			}
		} else {
			while (this.char != ';') {
				this.index++;
				this.char = this.xml.charAt(this.index);
				if (!/\d/.test(this.char)) {
					this.fireError("invalid char reference, must contain numeric characters only");
					return false;
				}
			}
		}
		this.eventHandler.characters(this.xml.substring(oldIndex,this.index),oldIndex,this.index - oldIndex);
		return true;
	};
	
	//[68]  EntityRef ::= '&' Name ';'
	this.scanEntityRef = function() {
		var ref = this.nextRegExp(/;/);
		if (this.state == this.STATE_END_OF_INPUT) { 
			this.fireError("document incomplete, entity reference must end with ;");
			return false;
		}
		return true;
	};
	
	// [42] ETag ::= '</' Name S? '>'
	this.scanEndingTag = function() {
		var qName = this.getQName();
		if (this.state == this.STATE_ERROR_FIRED) { 
			return false;
		}
		var namespaceURI = this.getNamespaceURI(qName.prefix);
		if (qName.qName == this.elementsStack.pop()) {
			this.skipWhiteSpaces();
			if (this.char == '>') {
				this.endMarkup(namespaceURI,qName);
				return true;
			} else {
				this.fireError("invalid ending markup, does not finish with &gt;");
				return false;
			}
		} else {
			this.fireError("invalid ending markup, markup name does not match current one");
			return false;
		}
	};
	
	
	this.endMarkup = function(namespaceURI,qName) {
		this.eventHandler.endElement(namespaceURI,qName.localName,qName.qName);
		var namespacesRemoved = this.namespaces.pop();
		for (var i in namespacesRemoved) {
			this.eventHandler.endPrefixMapping(i);
		}
	};
	
	
	/*
	if dontSkipWhiteSpace is not passed, then it is false so skipWhiteSpaces is default
	if end of document char is  ''
	*/
	this.nextChar = function(dontSkipWhiteSpace) {
		this.index++;
		if (dontSkipWhiteSpace) {
			this.char = this.xml.charAt(this.index);
		} else {
			this.skipWhiteSpaces();
		}
		if (this.index > this.xml.length - 2) {
			this.state = this.STATE_END_OF_INPUT;
		}
	};
	
	this.skipWhiteSpaces = function() {
		var inc = this.xml.substr(this.index).search(/\S/);
		if (inc == -1) {
			this.index = this.xml.length;
		} else {
			this.index += inc;
		}
		this.char = this.xml.charAt(this.index);
	};
	
	
	/*
	goes to next reg exp and return content, from current char to the char before reg exp
	if next reg exp is not found return false, must differenciate from ''
	*/
	this.nextRegExp = function(regExp) {
		var oldIndex = this.index;
		var inc = this.xml.substr(this.index).search(regExp);
		if (inc == -1) {
			this.index = this.xml.length;
			this.char = '';
			this.state = this.STATE_END_OF_INPUT;
			return '';
		} else {
			this.index += inc;
			this.char = this.xml.charAt(this.index);
			return this.xml.substring(oldIndex,this.index);
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
		return this.nextRegExp(/>/);
	};
	
	/*
	goes after ' or " and return content
	current char is opening ' or "
	*/
	this.quoteContent = function() {
		this.index ++;
		var content = this.nextRegExp(/["']/);
		this.index ++;
		this.char = this.xml.charAt(this.index);
		return content;
	};
	
	
	this.isWhiteSpace = function() {
		return (/[\t\n\r ]/.test(this.char));
	};


	this.fireError = function(message) {
		this.eventHandler.error(this.char,this.index,message);
		this.state = this.STATE_ERROR_FIRED;
	};
	
}

function qName(prefix,localName) {
	this.prefix = prefix;
	this.localName = localName;
	if (prefix != '') {
		this.qName = prefix + ":" + localName;
	} else {
		this.qName = localName;
	}
}
