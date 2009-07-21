/*global window, AttributesImpl, SAXParseException, SAXParser */
/*
Copyright or © or Copr. Nicolas Debeissat, Brett Zamir

nicolas.debeissat@gmail.com (http://debeissat.nicolas.free.fr/) brettz9@yahoo.com

This software is a computer program whose purpose is to parse XML
files respecting SAX2 specifications.

This software is governed by the CeCILL license under French law and
abiding by the rules of distribution of free software. You can use,
modify and/ or redistribute the software under the terms of the CeCILL
license as circulated by CEA, CNRS and INRIA at the following URL
"http://www.cecill.info".

As a counterpart to the access to the source code and rights to copy,
modify and redistribute granted by the license, users are provided only
with a limited warranty and the software's author, the holder of the
economic rights, and the successive licensors have only limited
liability.

In this respect, the user's attention is drawn to the risks associated
with loading, using, modifying and/or developing or reproducing the
software by the user in light of its specific status of free software,
that may mean that it is complicated to manipulate, and that also
therefore means that it is reserved for developers and experienced
professionals having in-depth computer knowledge. Users are therefore
encouraged to load and test the software's suitability as regards their
requirements in conditions enabling the security of their systems and/or
data to be ensured and, more generally, to use and operate it in the
same conditions as regards security.

The fact that you are presently reading this means that you have had
knowledge of the CeCILL license and that you accept its terms.

*/

/*
This is the private API for SAX parsing
*/
(function () { // Begin namespace

/* Scanner states */
var STATE_XML_DECL                  =  0;
var STATE_PROLOG                    =  1;
var STATE_EXT_ENT                   =  2;
var STATE_PROLOG_DOCTYPE_DECLARED   =  3;
var STATE_ROOT_ELEMENT              =  4;
var STATE_CONTENT                   =  5;
var STATE_TRAILING_MISC             =  6;

var XML_VERSIONS = ['1.0', '1.1']; // All existing versions of XML; will check this.features['http://xml.org/sax/features/xml-1.1'] if parser supports XML 1.1
var XML_VERSION = /^1\.\d+$/;
var ENCODING = /^[A-Za-z]([A-Za-z0-9._]|-)*$/;
var STANDALONE = /^yes$|^no$/;

/* XML Name regular expressions */
// Should disallow independent high or low surrogates or inversed surrogate pairs and also have option to reject private use characters; but strict mode will need to check for sequence of 2 characters if a surrogate is found
var NAME_START_CHAR = ":A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u0200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\ud800-\udb7f\udc00-\udfff"; // The last two ranges are for surrogates that comprise #x10000-#xEFFFF
var NOT_START_CHAR = new RegExp("[^" + NAME_START_CHAR + "]");
var NAME_END_CHAR = ".0-9\u00B7\u0300-\u036F\u203F-\u2040-"; // Don't need escaping since to be put in a character class
var NOT_START_OR_END_CHAR = new RegExp("[^" + NAME_START_CHAR + NAME_END_CHAR + "]");

//[2]   	Char	   ::=   	#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
//for performance reason I will not be conformant in applying this within the class (see CHAR_DATA_REGEXP)
var CHAR = "\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\ud800-\udb7f\udc00-\udfff";
var NOT_CHAR = '[^'+CHAR+']';
var NOT_A_CHAR = new RegExp(NOT_CHAR);
var NOT_A_CHAR_ERROR_CB = function () {
    return this.saxParser.fireError("invalid XML character, decimal code number '"+this.ch.charCodeAt(0)+"'", SAXParser.FATAL);
};
var NOT_A_CHAR_CB_OBJ = {pattern:NOT_A_CHAR, cb:NOT_A_CHAR_ERROR_CB};

var WS_CHARS = '\\t\\n\\r ';
var WS_CHAR = '['+WS_CHARS+']'; // \s is too inclusive
var WS = new RegExp(WS_CHAR);
var NON_WS = new RegExp('[^'+WS_CHARS+']');
//in the case of XML declaration document has not yet been processed, token is on <
var XML_DECL_BEGIN = new RegExp("<\\?xml"+WS_CHAR);
// in the case of detection of double XML declation, token in after <
var XML_DECL_BEGIN_FALSE = new RegExp("\\?xml("+WS_CHAR+'|\\?)', 'i');

var NOT_REPLACED_ENTITIES = /^amp$|^lt$|^gt$|^quot$/;
var APOS_ENTITY = /^apos$/;


// CUSTOM EXCEPTION CLASSES
// Our own exception class; should this perhaps extend SAXParseException?
function EndOfInputException() {}

EndOfInputException.prototype.toString = function() {
    return "EndOfInputException";
};

function InternalEntityNotFoundException (entityName) {
    this.entityName = entityName;
}
InternalEntityNotFoundException.prototype.toString = function() {
    return "InternalEntityNotFoundException";
};
InternalEntityNotFoundException.prototype = new SAXParseException();
InternalEntityNotFoundException.constructor = InternalEntityNotFoundException;

// CUSTOM HELPER CLASSES
/*
in case of attributes, empty prefix will be null because default namespace is null for attributes
in case of elements, empty prefix will be "".
*/
function Sax_QName(prefix, localName) {
    this.prefix = prefix;
    this.localName = localName;
    if (prefix) {
        this.qName = prefix + ":" + localName;
    } else {
        this.qName = localName;
    }
}
Sax_QName.prototype.equals = function(qName) {
    return this.qName === qName.qName;
};

/*
Class for storing publicId and systemId
*/
function ExternalId() {
    this.publicId = null;
    this.systemId = null;
}
ExternalId.prototype.toString = function() {
    return "ExternalId";
};

function SAXScanner(saxParser, saxEvents) {
    this.saxParser = saxParser;
    this.saxEvents = saxEvents;
}
SAXScanner.prototype.toString = function() {
    return "SAXScanner";
};

// BEGIN CUSTOM API (could make all but parseString() private)
SAXScanner.prototype.parseString = function(xml) { // We implement our own for now, but should probably call the standard parse() which requires an InputSource object (or systemId string)
    this.xml = xml;
    this.length = xml.length;
    this.index = 0;
    this.ch = this.xml.charAt(this.index);
    this.state = STATE_XML_DECL;
    this.elementsStack = [];
    this.namespaceSupport.reset();

    /* map between entity names and values */
    this.entities = {};
    /* map between parameter entity names and values
            the parameter entites are used inside the DTD */
    this.parameterEntities = {};
    /* map between external entity names and URIs  */
    this.externalEntities = {};
    /* As an attribute is declared for an element, that should
                contain a map between element name and a map between
                attributes name and types ( 3 level tree) */
    this.attributesType = {};
    /* on each depth, a relative base URI, empty if no xml:base found, is recorded */
    this.relativeBaseUris = [];
    this.saxEvents.startDocument();
    //if all whitespaces, w3c test case xmlconf/xmltest/not-wf/sa/050.xml
    if (!(NON_WS.test(this.xml))) {
        this.saxParser.fireError("empty document", SAXParser.FATAL);
    }
    try {
        // We must test for the XML Declaration before processing any whitespace
        this.startParsing();
        this.state = STATE_PROLOG;
        while (this.index < this.length) {
            this.next();
        }
        throw new EndOfInputException();
    } catch(e) {
        if (e instanceof SAXParseException) {
            this.saxEvents.fatalError(e);
        } else if (e instanceof EndOfInputException) {
            if (this.elementsStack.length > 0) {
                this.saxParser.fireError("the markup " + this.elementsStack.pop() + " has not been closed", SAXParser.FATAL);
            } else {
                try {
                    //maybe validation exceptions
                    this.saxEvents.endDocument();
                } catch(e2) {
                    throw e2;
                }
            }
        } else {
            throw e;
        }
    }
};


/*
scan XML declaration, test first character of document, and if right goes to character after <
*/
SAXScanner.prototype.startParsing = function() {
    //if no XML declaration, then white spaces are allowed at beginning of XML
    if (!this.scanXMLDeclOrTextDecl()) {
        this.skipWhiteSpaces();
    }
    if (this.ch !== "<") {
        this.saxParser.fireError("Invalid first character in document, external entity or external subset : [" + this.ch + "]", SAXParser.FATAL);
    }
};

SAXScanner.prototype.next = function() {
    this.skipWhiteSpaces();
    if (this.ch === "<") {
        this.nextChar(true);
        this.scanMarkup();
    } else if (this.elementsStack.length > 0) {
        this.scanText();
    //if elementsStack is empty it is text misplaced
    } else {
        this.saxParser.fireError("can not have text at root level of the XML", SAXParser.FATAL);
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
SAXScanner.prototype.scanMarkup = function() {
    if (this.state === STATE_PROLOG) {
        if (this.ch === "!") {
            this.nextChar(true);
            if (!this.scanComment()) {
                //there is no other choice but, in case exception is not FATAL,
                // and in order to have equivalent behaviours between scan()
                if (this.scanDoctypeDecl()) {
                    this.state = STATE_PROLOG_DOCTYPE_DECLARED;
                }
            }
        } else if (this.ch === "?") {
            //in case it is not a valid processing instruction
            //scanPI will throw the exception itself, with a better message
            this.scanPI();
        } else {
            this.state = STATE_ROOT_ELEMENT;
            //does not go to next char exiting the method
            this.scanMarkup();
        }
    } else if (this.state === STATE_PROLOG_DOCTYPE_DECLARED) {
        if (this.ch === "!") {
            this.nextChar(true);
            if (!this.scanComment()) {
                if (this.isFollowedBy("DOCTYPE")) {
                    this.saxParser.fireError("can not have two doctype declarations", SAXParser.FATAL);
                } else {
                    this.saxParser.fireError("invalid declaration, only a comment is allowed here after &lt;!", SAXParser.FATAL);
                }
            }
        } else if (this.ch === "?") {
            //in case it is not a valid processing instruction
            //scanPI will throw the exception itself, with a better message
            this.scanPI();
        } else {
            this.state = STATE_ROOT_ELEMENT;
            //does not go to next char exiting the method
            this.scanMarkup();
        }
    } else if (this.state === STATE_ROOT_ELEMENT) {
        if (this.scanElement()) {
            //there may be just a root empty markup (already closed)
            if (this.elementsStack.length > 0) {
                this.state = STATE_CONTENT;
            } else {
                this.state = STATE_TRAILING_MISC;
            }
        } else {
            this.saxParser.fireError("document is empty, no root element detected", SAXParser.FATAL);
        }
    } else if (this.state === STATE_CONTENT) {
        if (this.ch === "!") {
            this.nextChar(true);
            if (!this.scanComment()) {
                if (!this.scanCData()) {
                    this.saxParser.fireError("neither comment nor CDATA after &lt;!", SAXParser.FATAL);
                }
            }
        } else if (this.ch === "?") {
            //in case it is not a valid processing instruction
            //scanPI will throw the exception itself, with a better message
            this.scanPI();
        } else if (this.ch === "/") {
            this.nextChar(true);
            if (this.scanEndingTag()) {
                if (this.elementsStack.length === 0) {
                    this.state = STATE_TRAILING_MISC;
                }
            }
        } else {
            if (!this.scanElement()) {
                this.saxParser.fireError("not valid markup", SAXParser.FATAL);
            }
        }
    } else if (this.state === STATE_TRAILING_MISC) {
        if (this.ch === "!") {
            this.nextChar(true);
            if (!this.scanComment()) {
                this.saxParser.fireError("end of document, only comments or processing instructions are allowed", SAXParser.FATAL);
            }
        } else if (this.ch === "?") {
            if (!this.scanPI()) {
                this.saxParser.fireError("end of document, only comment or processing instruction are allowed", SAXParser.FATAL);
            }
        } else if (this.ch === "/") {
            this.saxParser.fireError("invalid ending tag at root of the document", SAXParser.FATAL);
        } else {
            this.saxParser.fireError("only one document element is allowed", SAXParser.FATAL);
        }
    }
};

//  what I understand from there : http://www.w3.org/TR/REC-xml/#dt-chardata is that & is allowed
// in character data only if it is an entity reference
SAXScanner.prototype.scanText = function() {
    var start = this.index;
    var content = this.scanCharData();
    //in case of external entity, the process is reinitialized??
    var entityStart;
    try {
        //if found a "&"
        while (this.ch === "&") {
            entityStart = this.index;
            this.nextChar(true);
            var ref = this.scanRef();
            content += ref;
            content += this.scanCharData();
        }
    } catch (e) {
        if (e instanceof InternalEntityNotFoundException) {
            // at this place in XML, that entity ref may be an external entity
            var externalId = this.externalEntities[e.entityName];
            if (externalId === undefined) {
                this.saxParser.fireError("entity : [" + e.entityName + "] not declared as an internal entity or as an external one", SAXParser.ERROR);
            } else {
                this.includeEntity(e.entityName, entityStart, externalId);
            }
        } else {
            throw e;
        }
    }
    //in all cases report the text found, a text found before external entity if present
    var length = this.index - start;
    this.saxEvents.characters(content, start, length);
};

// 14]   	CharData ::= [^<&]* - ([^<&]* ']]>' [^<&]*)
SAXScanner.prototype.scanCharData = function() {
    var content = this.nextCharRegExp(this.CHAR_DATA_REGEXP, NOT_A_CHAR_CB_OBJ);
    //if found a "]", must ensure that it is not followed by "]>"
    while (this.ch === "]") {
        this.nextChar(true);
        if (this.isFollowedBy("]>")) {
            this.saxParser.fireError("Text may not contain a literal ']]&gt;' sequence", SAXParser.ERROR);
        }
        content += "]" + this.nextCharRegExp(this.CHAR_DATA_REGEXP, NOT_A_CHAR_CB_OBJ);
    }
    return content;
};


SAXScanner.prototype.getRelativeBaseUri = function() {
    var returned = this.saxParser.baseURI;
    var i = this.relativeBaseUris.length;
    while (i--) {
        returned += this.relativeBaseUris[i];
    }
    return returned;
};

/*
 entity is replaced and its replacement is parsed, see http://www.w3.org/TR/REC-xml/#included
 entityName is used for SAX compliance with resolveEntity and recursion detection
 */
SAXScanner.prototype.includeEntity = function(entityName, entityStartIndex, replacement) {
    //if it is an externalId, have to include the external content
    if (replacement instanceof ExternalId) {
        try {
            //it seems externalEntity does not take in account xml:base, see xmlconf.xml
            var externalEntity = this.saxEvents.resolveEntity(entityName, replacement.publicId, this.saxParser.baseURI, replacement.systemId);
            //if not only whitespace
            if (externalEntity !== undefined && NON_WS.test(externalEntity)) {
                //check for no recursion
                if (new RegExp("&" + entityName + ";").test(externalEntity)) {
                    this.saxParser.fireError("Recursion detected : [" + entityName + "] contains a reference to itself", SAXParser.FATAL);
                }
                //there may be another xml declaration at beginning of external entity
                this.includeText(entityStartIndex, externalEntity);
                var oldState = this.state;
                this.state = STATE_EXT_ENT;
                this.startParsing();
                this.state = oldState;
            }
        } catch(e) {
            this.saxParser.fireError("issue at resolving entity : [" + entityName + "], publicId : [" + replacement.publicId + "], uri : [" + this.saxParser.baseURI + "], systemId : [" + replacement.systemId + "], got exception : [" + e.toString() + "]", SAXParser.ERROR);
            //removes the entity
            this.xml = this.xml.substring(0, entityStartIndex).concat(this.xml.substr(this.index));
            this.length = this.xml.length;
            this.index = entityStartIndex;
            this.ch = this.xml.charAt(this.index);
        }
    } else {
        this.includeText(entityStartIndex, replacement);
    }
};

SAXScanner.prototype.includeText = function(entityStartIndex, replacement) {
    // entity is replaced and its replacement is parsed, see http://www.w3.org/TR/REC-xml/#included
    this.xml = this.xml.substring(0, entityStartIndex).concat(replacement, this.xml.substr(this.index));
    this.length = this.xml.length;
    this.index = entityStartIndex;
    this.ch = this.xml.charAt(this.index);
};

/*
current char is after '&'
may return undefined if entity has not been found (if external for example)
*/
SAXScanner.prototype.scanRef = function() {
    var ref;
    if (this.ch === "#") {
        this.nextChar(true);
        ref = this.scanCharRef();
    } else {
        ref = this.scanEntityRef();
    }
    return ref;
};


// [15] Comment ::= '<!--' ((Char - '-') | ('-' (Char - '-')))* '-->'
SAXScanner.prototype.scanComment = function() {
    if (this.ch === "-") {
        this.nextChar(true);
        if (this.ch === "-") {
            //do not skip white space at beginning of comment
            this.nextChar(true);
            var start = this.index;
            var comment = this.nextCharRegExp(new RegExp(NOT_CHAR+'|-'), NOT_A_CHAR_CB_OBJ);
            while (this.ch === "-") {
                this.nextChar(true);
                if (this.isFollowedBy("->")) {
                    break;
                }
                else if (this.isFollowedBy("-")) {
                    return this.saxParser.fireError("end of comment not valid, must be --&gt;", SAXParser.FATAL);
                }
                comment += "-" + this.nextCharRegExp(new RegExp(NOT_CHAR+'|-'), NOT_A_CHAR_CB_OBJ);
            }
            var length = comment.length;
            this.saxEvents.comment(comment, start, length);// Brett (test for support and change start/length?)
            //this.nextChar(true);
            return true;
        } else {
            return this.saxParser.fireError("beginning comment markup is invalid, must be &lt;!--", SAXParser.FATAL);
        }
    } else {
        // can be a doctype
        return false;
    }
};


SAXScanner.prototype.setEncoding = function (encoding) {
    if (this.locator) {
        this.locator.setEncoding(this.encoding || encoding); // Higher priority is given to any encoding set on an InputSource (passed in during parse())
    }
};

SAXScanner.prototype.setXMLVersion = function (version) {
   if (version) {
        if (XML_VERSIONS.indexOf(version) === -1) {
            this.saxParser.fireError("The specified XML Version is not a presently valid XML version number", SAXParser.FATAL); // e.g. 1.5
        } else if (version === '1.1' && this.saxParser.features['http://xml.org/sax/features/xml-1.1'] === false) {
            this.saxParser.fireError("The XML text specifies version 1.1, but this parser does not support this version.", SAXParser.FATAL);
        }
        this.saxParser.properties['http://xml.org/sax/properties/document-xml-version'] = version;
        if (this.locator) {
            this.locator.setXMLVersion(version);
        }
    }
};

SAXScanner.prototype.scanXMLDeclOrTextDeclAttribute = function (allowableAtts, allowableValues, requireWS) {
    if (this.ch === "?") {
        return false;
    }
    if (requireWS && !WS.test(this.ch)) {
        return this.saxParser.fireError('The XML Declaration or Text Declaration must possess a space between the version/encoding/standalone information.', SAXParser.FATAL);
    }
    this.skipWhiteSpaces();
    var attName = this.scanName();
    var attPos = allowableAtts.indexOf(attName);
    if (attPos === -1) {
        if (['version', 'encoding', 'standalone'].indexOf(attName) !== -1) {
            return this.saxParser.fireError('The attribute name "'+attName+'" was not expected at this position in an XML or text declaration. It was expected to be: '+allowableAtts.join(', '), SAXParser.FATAL);
        }
        return this.saxParser.fireError('The attribute name "'+attName+'" does not match the allowable names in an XML or text declaration: '+allowableAtts.join(', '), SAXParser.FATAL);
    }
    this.skipWhiteSpaces();
    if (this.ch === "=") {
        this.nextChar();
        if (this.ch === '"' || this.ch === "'") {
            var quote = this.ch;
            try {
                this.nextChar(true);
                var attValue = this.nextRegExp("[" + quote + "]");
                if (!allowableValues[attPos].test(attValue)) {
                    return this.saxParser.fireError('The attribute value "'+attValue+'" does not match the allowable values in an XML or text declaration: '+allowableValues[attPos], SAXParser.FATAL);
                }
                //current char is ending quote
                this.nextChar(true);
            //adding a message in that case
            } catch(e) {
                if (e instanceof EndOfInputException) {
                    return this.saxParser.fireError("document incomplete, attribute value declaration must end with a quote", SAXParser.FATAL);
                } else {
                    throw e;
                }
            }
        } else {
            return this.saxParser.fireError("invalid declaration attribute value declaration, must begin with a quote", SAXParser.FATAL);
        }
    } else {
        return this.saxParser.fireError("invalid declaration attribute, must contain = between name and value", SAXParser.FATAL);
    }
    return [attName, attValue];
};

/*
 [23] XMLDecl ::= '<?xml' VersionInfo EncodingDecl? SDDecl? S? '?>'
 [24] VersionInfo ::= S 'version' Eq (' VersionNum ' | " VersionNum ")
 [80] EncodingDecl ::= S 'encoding' Eq ('"' EncName '"' |  "'" EncName "'" )
 [81] EncName ::= [A-Za-z] ([A-Za-z0-9._] | '-')*
 [32] SDDecl ::= S 'standalone' Eq (("'" ('yes' | 'no') "'")
                 | ('"' ('yes' | 'no') '"'))
 [77] TextDecl ::= '<?xml' VersionInfo? EncodingDecl S? '?>'
 current character is "<", at return current char is after ending ">"
 */
SAXScanner.prototype.scanXMLDeclOrTextDecl = function() {
    // Fix: need to have conditions to trigger STATE_EXT_ENT somehow
    // allow scanning of text declaration/external XML entity?
    var version = null;
    var encoding = 'UTF-8'; // As the default with no declaration is UTF-8, we assume it is such, unless the
    // encoding is indicated explicitly, in which case we will trust that. We are therefore not able to discern
    // UTF-16 represented without an explicit declaration nor report any inconsistencies between header encoding,
    // byte-order mark, or explicit encoding information, unless it is reported on InputSource (see next note).

    // If we were processing individual bytes (e.g., if we represented XML as an array of bytes), we
    //    could detect the encoding ourselves, including byte-order mark (and also allow checking
    //    against any header encoding), but since JavaScript converts pages for us into UTF-16 (two bytes per
    //    character), we cannot use the same approach unless we allow the InputSource with the InputStream (byteStream)
    //    constructor in Java SAX2; instead we take an approach more similar to the StringReader (Reader characterStream
    //    constructor), though we haven't fully implemented that API at present: http://java.sun.com/j2se/1.4.2/docs/api/java/io/StringReader.html
    // This script will therefore not detect an inconsistency between the encoding of the original document (since
    //    we don't know what it is) and the encoding indicated in its (optional) XML Declaration/Text Declaration

    if ((XML_DECL_BEGIN).test(this.xml.substr(this.index, 6))) {
        this.nextNChar(6);
        var standalone = false;
        if (this.state === STATE_XML_DECL) {
            var versionArr = this.scanXMLDeclOrTextDeclAttribute(['version'], [XML_VERSION]);
            if (!versionArr) {
                return this.saxParser.fireError("An XML Declaration must have version information", SAXParser.FATAL);
            }
            version = versionArr[1];
            this.setXMLVersion(version);
            var encodingOrStandalone = this.scanXMLDeclOrTextDeclAttribute(['encoding', 'standalone'], [ENCODING, STANDALONE], true);
            if (encodingOrStandalone) {
                if (encodingOrStandalone[0] === 'encoding') {
                    encoding = encodingOrStandalone[1];
                    this.setEncoding(encoding);
                    
                    var standaloneArr = this.scanXMLDeclOrTextDeclAttribute(['standalone'], [STANDALONE], true);
                    if (standaloneArr && standaloneArr === 'yes') {
                        standalone = true;
                    }
                }
            }
            this.saxParser.features['http://xml.org/sax/features/is-standalone'] = standalone;
        } else { // STATE_EXT_ENT
            var versionOrEncodingArr = this.scanXMLDeclOrTextDeclAttribute(['version', 'encoding'], [XML_VERSION, ENCODING]);
            if (versionOrEncodingArr[0] === 'version') {
                version = versionOrEncodingArr[1];
                this.setXMLVersion(version);
                versionOrEncodingArr = this.scanXMLDeclOrTextDeclAttribute(['encoding'], [ENCODING], true);
            }
            if (!versionOrEncodingArr) {
                return this.saxParser.fireError("A text declaration must possess explicit encoding information", SAXParser.FATAL);
            }
            encoding = versionOrEncodingArr[1];
            this.setEncoding(encoding);
        }

        this.skipWhiteSpaces();
        if (this.ch !== "?") {
            return this.saxParser.fireError("invalid markup, '"+this.ch+"', in XML or text declaration where '?' expected", SAXParser.FATAL);
        }
        this.nextChar(true);
        if (this.ch !== ">") {
            return this.saxParser.fireError("invalid markup inside XML or text declaration; must end with &gt;", SAXParser.FATAL);
        } else {
            this.nextChar();
        }
        return true;
    } else {
        if (this.state === STATE_XML_DECL) {
            this.setXMLVersion('1.0'); // Assumed when no declaration present
            if (this.locator) {
                this.locator.setEncoding(encoding);
            }
            this.saxParser.features['http://xml.org/sax/features/is-standalone'] = false;
        }
        return false;
    }
};


// [16] PI ::= '<?' PITarget (S (Char* - (Char* '?>' Char*)))? '?>'
// [17] PITarget ::= Name - (('X' | 'x') ('M' | 'm') ('L' | 'l'))
SAXScanner.prototype.scanPI = function() {
    if ((XML_DECL_BEGIN_FALSE).test(this.xml.substr(this.index, 5))) {
        return this.saxParser.fireError("XML Declaration cannot occur past the very beginning of the document.", SAXParser.FATAL);
    }
    this.nextChar(true);
    this.saxEvents.processingInstruction(this.scanName(), this.nextEndPI());
    return true;
};


//[28]   	doctypedecl	   ::=   	'<!DOCTYPE' S  Name (S  ExternalID)? S? ('[' intSubset ']' S?)? '>'
SAXScanner.prototype.scanDoctypeDecl = function() {
    if (this.isFollowedBy("DOCTYPE")) {
        this.nextChar();
        var name = this.nextCharRegExp(/[ \[>]/);
        this.skipWhiteSpaces();
        var externalId = new ExternalId();
        //if there is an externalId
        this.scanExternalId(externalId);
        this.saxEvents.startDTD(name, externalId.publicId, externalId.systemId);
        if (this.ch === "[") {
            this.nextChar();
            while (this.ch !== "]") {
                this.scanDoctypeDeclIntSubset();
            }
            this.nextChar();
        }
        //extract of specs : if both the external and internal subsets are used, the internal subset MUST be considered to occur before the external subset
        if (externalId.systemId !== null) {
            //in case of restricted uri error
            try {
                var extSubset = SAXParser.loadFile(this.saxParser.baseURI + externalId.systemId);
                this.scanExtSubset(extSubset);
            } catch(e) {
                this.saxParser.fireError("exception : [" + e.toString() + "] trying to load external subset : [" + this.saxParser.baseURI + externalId.systemId + "]", SAXParser.WARNING);
            }
        }
        if (this.ch !== ">") {
            return this.saxParser.fireError("invalid content in doctype declaration", SAXParser.FATAL);
        } else {
            this.nextChar();
        }
        this.saxEvents.endDTD();
        return true;
    } else {
        return this.saxParser.fireError("invalid doctype declaration, must be &lt;!DOCTYPE", SAXParser.FATAL);
    }
};

/*
[30]   	extSubset	   ::=   	 TextDecl? extSubsetDecl
[31]   	extSubsetDecl	   ::=   	( markupdecl | conditionalSect | DeclSep)*
*/
SAXScanner.prototype.scanExtSubset = function(extSubset) {
    if (NON_WS.test(extSubset)) {
        //restart the index
        var currentIndex = this.index;
        var currentXml = this.xml;
        this.xml = extSubset;
        this.length = this.xml.length;
        this.index = 0;
        this.ch = this.xml.charAt(this.index);
        this.startParsing();
        //current char is first <
        try {
            //should also support conditionalSect
            this.scanDoctypeDeclIntSubset();
        } catch(e) {
            if (!(e instanceof EndOfInputException)) {
                throw e;
            }
        }
        this.xml = currentXml;
        this.length = this.xml.length;
        this.index = currentIndex;
        this.ch = this.xml.charAt(this.index);
    }
};

//[75]   	ExternalID	   ::=   	'SYSTEM' S  SystemLiteral
//			| 'PUBLIC' S PubidLiteral S SystemLiteral
SAXScanner.prototype.scanExternalId = function(externalId) {
    if (this.isFollowedBy("SYSTEM")) {
        this.nextChar();
        externalId.systemId = this.scanSystemLiteral();
        this.skipWhiteSpaces();
        return true;
    } else if (this.isFollowedBy("PUBLIC")) {
        this.nextChar();
        externalId.publicId = this.scanPubIdLiteral();
        this.nextChar();
        externalId.systemId = this.scanSystemLiteral();
        this.skipWhiteSpaces();
        return true;
    }
    return false;
};

//current char should be the quote
//[11]   	SystemLiteral	   ::=   	('"' [^"]* '"') | ("'" [^']* "'")
SAXScanner.prototype.scanSystemLiteral = function(externalId) {
    if (this.ch !== "'" && this.ch !== '"') {
        return this.saxParser.fireError("invalid sytem Id declaration, should begin with a quote", SAXParser.FATAL);
    }
    return this.quoteContent();
};

//current char should be the quote
//[12]   	PubidLiteral	   ::=   	'"' PubidChar* '"' | "'" (PubidChar - "'")* "'"
//[13]   	PubidChar	   ::=   	#x20 | #xD | #xA | [a-zA-Z0-9] | [-'()+,./:=?;!*#@$_%]
SAXScanner.prototype.scanPubIdLiteral = function(externalId) {
    if (this.ch !== "'" && this.ch !== '"') {
        return this.saxParser.fireError("invalid Public Id declaration, should begin with a quote", SAXParser.FATAL);
    }
    return this.quoteContent();
};

/*
Parameter entity references are recognized anywhere in the DTD (internal and external subsets and external parameter entities),
except in literals, processing instructions, comments, and the contents of ignored conditional sections
current char is %
*/
SAXScanner.prototype.includeParameterEntity = function() {
    var entityStart = this.index;
    this.nextChar(true);
    var entityName = this.nextCharRegExp(/;/);
    // if % found here, include and parse replacement
    var replacement = this.scanPeRef(entityName);
    //current char is ending quote
    this.nextChar(true);
    // entity is replaced and its replacement is parsed, see http://www.w3.org/TR/REC-xml/#included
    this.includeEntity(entityName, entityStart, replacement);
    //white spaces are not significant here
    this.skipWhiteSpaces();
};

/*
actual char is non whitespace char after '['
[28a]   	DeclSep	   ::=   	 PEReference | S
[28b]   	intSubset	   ::=   	(markupdecl | DeclSep)*
[29]   	markupdecl	   ::=   	 elementdecl | AttlistDecl | EntityDecl | NotationDecl | PI | Comment
*/
SAXScanner.prototype.scanDoctypeDeclIntSubset = function() {
    if (this.ch === "<") {
        this.nextChar(true);
        if (this.ch === "?") {
            if (!this.scanPI()) {
                this.saxParser.fireError("invalid processing instruction inside doctype declaration", SAXParser.FATAL);
            }
        } else if (this.ch === "!") {
            this.nextChar(true);
            if (!this.scanComment()) {
                if (!this.scanEntityDecl() && !this.scanElementDecl() &&
                        !this.scanAttlistDecl() && !this.scanNotationDecl()) {
                    //no present support for other declarations
                    this.nextCharRegExp(/>/);
                }
                this.skipWhiteSpaces();
                if (this.ch !== ">") {
                    this.saxParser.fireError("invalid markup declaration inside doctype declaration, must end with &gt;", SAXParser.FATAL);
                }
                this.nextChar();
            } else {
                //if comment, must go over the whitespaces as they are not significative in doctype internal subset declaration
                this.skipWhiteSpaces();
            }
        }
    /*
    Reference in DTD	 Included as PE
*/
    } else if (this.ch === "%") {
        this.includeParameterEntity();
    } else {
        this.saxParser.fireError("invalid character in internal subset of doctype declaration : [" + this.ch + "]", SAXParser.FATAL);
    }
};

/*
[70]   	EntityDecl	   ::=   	 GEDecl  | PEDecl
[71]   	          GEDecl	   ::=   	'<!ENTITY' S  Name  S  EntityDef  S? '>'
[72]   	PEDecl	   ::=   	'<!ENTITY' S '%' S Name S PEDef S? '>'
[73]   	EntityDef	   ::=   	 EntityValue  | (ExternalID  NDataDecl?)
[74]   	PEDef	   ::=   	EntityValue | ExternalID
[75]   	ExternalID	   ::=   	'SYSTEM' S  SystemLiteral
			| 'PUBLIC' S PubidLiteral S SystemLiteral
[76]   	NDataDecl	   ::=   	S 'NDATA' S Name
*/
SAXScanner.prototype.scanEntityDecl = function() {
    var entityName, externalId, entityValue;
    if (this.isFollowedBy("ENTITY")) {
        this.nextChar();
        if (this.ch === "%") {
            this.nextChar();
            entityName = this.scanName();
            this.nextChar();
            //if already declared, not effective
            if (!this.entities[entityName]) {
                externalId = new ExternalId();
                if (!this.scanExternalId(externalId)) {
                    entityValue = this.scanEntityValue();
                    this.parameterEntities[entityName] = entityValue;
                    this.saxEvents.internalEntityDecl("%" + entityName, entityValue);
                } else {
                    this.parameterEntities[entityName] = externalId;
                }
            }
        } else {
            entityName = this.scanName();
            this.nextChar();
            //if already declared, not effective
            if (!this.entities[entityName]) {
                externalId = new ExternalId();
                if (this.scanExternalId(externalId)) {
                    if (this.isFollowedBy("NDATA")) {
                        this.nextChar();
                        var ndataName = this.scanName();
                        this.saxEvents.unparsedEntityDecl(entityName, externalId.publicId, externalId.systemId, ndataName);
                    }
                    this.externalEntities[entityName] = externalId;
                } else {
                    entityValue = this.scanEntityValue();
                    this.entities[entityName] = entityValue;
                    this.saxEvents.internalEntityDecl(entityName, entityValue);
                }
            }
        }
        return true;
    }
    return false;
};

/*
[9]   	EntityValue	   ::=   	'"' ([^%&"] | PEReference | Reference)* '"'
			|  "'" ([^%&'] | PEReference | Reference)* "'"
[68]   	EntityRef	   ::=   	'&' Name ';'
[69]   	PEReference	   ::=   	'%' Name ';'
*/
SAXScanner.prototype.scanEntityValue = function() {
    if (this.ch === '"' || this.ch === "'") {
        var quote = this.ch;
        this.nextChar(true);
        var entityValue = this.nextCharRegExp(new RegExp("[" + quote + "%]"));
        //if found a "%" must replace it, EntityRef are not replaced here.
        while (this.ch === "%") {
            this.nextChar(true);
            var ref = this.scanPeRef();
            entityValue += ref;
            entityValue += this.nextCharRegExp(new RegExp("[" + quote + "%]"));
        }
        //current char is ending quote
        this.nextChar();
        return entityValue;
    } else {
        return this.saxParser.fireError("invalid entity value declaration, must begin with a quote", SAXParser.ERROR);
    }
};

/*
[69]   	PEReference	   ::=   	'%' Name ';'
for use in scanDoctypeDeclIntSubset where we need the original entityName, it may have already been parsed
*/
SAXScanner.prototype.scanPeRef = function(entityName) {
    try {
        if (entityName === undefined) {
            entityName = this.nextCharRegExp(/;/);
        }
        //tries to replace it by its value if declared internally in doctype declaration
        var replacement = this.parameterEntities[entityName];
        if (replacement) {
            return replacement;
        }
        this.saxParser.fireError("parameter entity reference : [" + entityName + "] has not been declared, no replacement found", SAXParser.ERROR);
        return "";
    //adding a message in that case
    } catch(e) {
        if (e instanceof EndOfInputException) {
            return this.saxParser.fireError("document incomplete, parameter entity reference must end with ;", SAXParser.FATAL);
        } else {
            throw e;
        }
    }
};

/*
[45]   	elementdecl	   ::=   	'<!ELEMENT' S  Name  S  contentspec  S? '>'
[46]   	contentspec	   ::=   	'EMPTY' | 'ANY' | Mixed | children
[51]    	Mixed	   ::=   	'(' S? '#PCDATA' (S? '|' S? Name)* S? ')*'
			| '(' S? '#PCDATA' S? ')'
[47]   	children	   ::=   	(choice | seq) ('?' | '*' | '+')?
*/
SAXScanner.prototype.scanElementDecl = function() {
    if (this.isFollowedBy("ELEMENT")) {
        this.nextChar();
        var name = this.scanName();
        this.nextChar();
        /*
        The content model will consist of the string "EMPTY", the string "ANY", or a parenthesised group, optionally followed by an occurrence indicator. The model will be normalized so that all parameter entities are fully resolved and all whitespace is removed,and will include the enclosing parentheses. Other normalization (such as removing redundant parentheses or simplifying occurrence indicators) is at the discretion of the parser.
        */
        var model = this.nextCharRegExp(/>/);
        this.saxEvents.elementDecl(name, model);
        return true;
    }
    return false;
};

/*
[52]   	AttlistDecl	   ::=   	'<!ATTLIST' S  Name  AttDef* S? '>'
*/
SAXScanner.prototype.scanAttlistDecl = function() {
    if (this.isFollowedBy("ATTLIST")) {
        this.nextChar();
        var eName = this.scanName();
        //initializes the attributesType map
        this.attributesType[eName] = {};
        this.nextChar();
        while (this.ch !== ">") {
            this.scanAttDef(eName);
        }
        return true;
    }
    return false;
};

/*
[53]   	AttDef	   ::=   	S Name S AttType S DefaultDecl
[60]   	DefaultDecl	   ::=   	'#REQUIRED' | '#IMPLIED'
			| (('#FIXED' S)? AttValue)
[10]    	AttValue	   ::=   	'"' ([^<&"] | Reference)* '"'
                                |  "'" ([^<&'] | Reference)* "'"
*/
SAXScanner.prototype.scanAttDef = function(eName) {
    var aName = this.scanName();
    this.skipWhiteSpaces();
    var type = this.scanAttType();
    //stores the declared type of that attribute for method getType() of AttributesImpl
    this.attributesType[eName][aName] = type;
    this.skipWhiteSpaces();
    //DefaultDecl
    var mode = null;
    if (this.ch === "#") {
        mode = this.nextCharRegExp(new RegExp(WS_CHAR+"|>"));
        this.skipWhiteSpaces();
    }
    var attValue = null;
    if (mode === null || mode === "#FIXED") {
        //attValue
        //here % is included and parsed
        if (this.ch === "%") {
            this.includeParameterEntity();
        }
        if (this.ch === '"' || this.ch === "'") {
            var quote = this.ch;
            this.nextChar(true);
            attValue = this.nextCharRegExp(new RegExp("[" + quote + "<%]"));
            //if found a "%" must replace it, PeRef are replaced here but not EntityRef
            // Included in Literal here (not parsed as the literal can not be terminated by quote)
            while (this.ch === "%") {
                this.nextChar(true);
                var ref = this.scanPeRef();
                attValue += ref;
                attValue += this.nextCharRegExp(new RegExp("[" + quote + "<%]"));
            }
            if (this.ch === "<") {
                this.saxParser.fireError("invalid attribute value, must not contain &lt;", SAXParser.FATAL);
            }
            //current char is ending quote
            this.nextChar();
        }
    }
    this.saxEvents.attributeDecl(eName, aName, type, mode, attValue);
};

/*
[54]   	AttType	   ::=   	 StringType | TokenizedType | EnumeratedType
[55]   	StringType	   ::=   	'CDATA'
[56]   	TokenizedType	   ::=   	'ID'	[VC: ID]
			| 'IDREF'	[VC: IDREF]
			| 'IDREFS'	[VC: IDREF]
			| 'ENTITY'	[VC: Entity Name]
			| 'ENTITIES'	[VC: Entity Name]
			| 'NMTOKEN'	[VC: Name Token]
			| 'NMTOKENS'	[VC: Name Token]
[57]   	EnumeratedType	   ::=   	 NotationType | Enumeration
[58]   	NotationType	   ::=   	'NOTATION' S '(' S? Name (S? '|' S? Name)* S? ')'
[59]   	Enumeration	   ::=   	'(' S? Nmtoken (S? '|' S? Nmtoken)* S? ')'
[7]   	           Nmtoken	   ::=   	(NameChar)+
*/
SAXScanner.prototype.scanAttType = function() {
    var type;
    //Enumeration
    if (this.ch === "(") {
        this.nextChar();
        type = this.nextCharRegExp(NOT_START_OR_END_CHAR);
        //removes whitespaces between NOTATION, does not support the invalidity of whitespaces inside Name
        while (WS.test(this.ch)) {
            this.skipWhiteSpaces();
            type += this.nextCharRegExp(NOT_START_OR_END_CHAR);
        }
        if (this.ch !== ")") {
            this.saxParser.fireError("Invalid character : [" + this.ch + "] in ATTLIST enumeration", SAXParser.ERROR);
            type += this.ch + this.nextCharRegExp(WS);
        }
        this.nextChar();
    //NotationType
    } else if (this.isFollowedBy("NOTATION")) {
        this.skipWhiteSpaces();
        if (this.ch === "(") {
            this.nextChar();
            type = this.scanName();
            this.skipWhiteSpaces();
            if (this.ch !== ")") {
                this.saxParser.fireError("Invalid character : [" + this.ch + "] in ATTLIST enumeration", SAXParser.ERROR);
            }
            this.nextChar();
        } else {
            this.saxParser.fireError("Invalid NOTATION, must be followed by '('", SAXParser.ERROR);
            this.nextCharRegExp(/>/);
        }
    // StringType | TokenizedType
    } else {
        type = this.nextCharRegExp(WS);
        if (!/^CDATA$|^ID$|^IDREF$|^IDREFS$|^ENTITY$|^ENTITIES$|^NMTOKEN$|^NMTOKENS$/.test(type)) {
            this.saxParser.fireError("Invalid type : [" + type + "] defined in ATTLIST", SAXParser.ERROR);
        }
    }
    return type;
};

/*
[82]   	NotationDecl	   ::=   	'<!NOTATION' S  Name  S (ExternalID | PublicID) S? '>'
[83]   	PublicID	   ::=   	'PUBLIC' S  PubidLiteral
*/
SAXScanner.prototype.scanNotationDecl = function() {
    if (this.isFollowedBy("NOTATION")) {
        this.skipWhiteSpaces();
        var name = this.scanName();
        this.skipWhiteSpaces();
        var externalId = new ExternalId();
        // here there may be only PubidLiteral after PUBLIC so can not use directly scanExternalId
        if (this.isFollowedBy("PUBLIC")) {
            this.skipWhiteSpaces();
            externalId.publicId = this.scanPubIdLiteral();
            this.skipWhiteSpaces();
            if (this.ch !== ">") {
                externalId.systemId = this.scanSystemLiteral();
                this.skipWhiteSpaces();
            }
        } else {
            this.scanExternalId(externalId);
        }
        this.saxEvents.notationDecl(name, externalId.publicId, externalId.systemId);
        return true;
    }
    return false;
};

/*
if called from an element parsing defaultPrefix would be ""
if called from an attribute parsing defaultPrefix would be null

[39] element ::= EmptyElemTag | STag content ETag
[44] EmptyElemTag ::= '<' Name (S Attribute)* S? '/>'
[40] STag ::= '<' Name (S Attribute)* S? '>'
[41] Attribute ::= Name Eq AttValue
[10] AttValue ::= '"' ([^<&"] | Reference)* '"' | "'" ([^<&'] | Reference)* "'"
[67] Reference ::= EntityRef | CharRef
[68] EntityRef ::= '&' Name ';'
[66] CharRef ::= '&#' [0-9]+ ';' | '&#x' [0-9a-fA-F]+ ';'
[43] content ::= (element | CharData | Reference | CDSect | PI | Comment)*
[42] ETag ::= '</' Name S? '>'
[4]  NameChar ::= Letter | Digit | '.' | '-' | '_' | ':' | CombiningChar | Extender
[5]  Name ::= Letter | '_' | ':') (NameChar)*
*/
SAXScanner.prototype.scanQName = function(defaultPrefix) {
    var name = this.scanName();
    var localName = name;
    if (name.indexOf(":") !== -1) {
        var splitResult = name.split(":");
        defaultPrefix = splitResult[0];
        localName = splitResult[1];
    }
    return new Sax_QName(defaultPrefix, localName);
};

SAXScanner.prototype.scanElement = function() {
    var qName = this.scanQName("");
    this.elementsStack.push(qName.qName);
    var atts = this.scanAttributes(qName);
    var namespaceURI = null;
    try {
        namespaceURI = this.namespaceSupport.getURI(qName.prefix);
    } catch(e) {
        //should be a PrefixNotFoundException but not specified so no hypothesis
        this.saxParser.fireError("namespace of element : [" + qName.qName + "] not found", SAXParser.ERROR);
    }
    this.saxEvents.startElement(namespaceURI, qName.localName, qName.qName, atts);
    this.skipWhiteSpaces();
    if (this.ch === "/") {
        this.nextChar(true);
        if (this.ch === ">") {
            this.elementsStack.pop();
            this.endMarkup(namespaceURI, qName);
        } else {
            this.saxParser.fireError("invalid empty markup, must finish with /&gt;", SAXParser.FATAL);
        }
    }
    if (this.ch !== ">") {
        this.saxParser.fireError("invalid element, must finish with &gt;", SAXParser.FATAL);
    } else {
        this.nextChar(true);
    }
    return true;
};

SAXScanner.prototype.scanAttributes = function(qName) {
    var atts = new AttributesImpl();
    //namespaces declared at this step will be stored at one level of global this.namespaces
    this.namespaceSupport.pushContext();
    //same way, in all cases a baseUriAddition is recorded on each level
    var baseUriAddition = "";
    this.scanAttribute(qName, atts);
    //as namespaces are defined only after parsing all the attributes, adds the namespaceURI here
    var i = atts.getLength();
    while (i--) {
        var prefix = atts.getPrefix(i);
        var namespaceURI = null;
        try {
            namespaceURI = this.namespaceSupport.getURI(prefix);
        } catch(e) {
            this.saxParser.fireError("namespace of attribute : [" + qName.qName + "] not found", SAXParser.ERROR);
        }
        atts.setURI(i, namespaceURI);
        //handling special xml: attributes
        if (namespaceURI === this.namespaceSupport.XMLNS) {
            switch (atts.getLocalName(i)) {
                case "base":
                    baseUriAddition = atts.getValue(i);
                    break;
                default:
                    break;
            }
        }
    }
    this.relativeBaseUris.push(baseUriAddition);
    return atts;
};

SAXScanner.prototype.scanAttribute = function(qName, atts) {
    this.skipWhiteSpaces();
    if (this.ch !== ">" && this.ch !== "/") {
        var attQName = this.scanQName(null);
        this.skipWhiteSpaces();
        if (this.ch === "=") {
            this.nextChar();
            var value = this.scanAttValue();
            if (attQName.prefix === "xmlns") {
                this.namespaceSupport.declarePrefix(attQName.localName, value);
                this.saxEvents.startPrefixMapping(attQName.localName, value);
            } else if (attQName.qName === "xmlns") {
                this.namespaceSupport.declarePrefix("", value);
                this.saxEvents.startPrefixMapping("", value);
            } else {
                //get the type of that attribute from internal DTD if found (no support of namespace in DTD)
                var type = null;
                var elementName = qName.localName;
                var elementMap = this.attributesType[elementName];
                if (elementMap) {
                    type = elementMap[attQName.localName];
                }
                //check that an attribute with the same qName has not already been defined
                if (atts.getIndex(attQName.qName) !== -1) {
                    this.saxParser.fireError("multiple declarations for same attribute : [" + attQName.qName + "]", SAXParser.ERROR);
                } else {
                    //we do not know yet the namespace URI
                    atts.addPrefixedAttribute(undefined, attQName.prefix, attQName.localName, attQName.qName, type, value);
                }
            }
            this.scanAttribute(qName, atts);
        } else {
            this.saxParser.fireError("invalid attribute, must contain = between name and value", SAXParser.FATAL);
        }
    }
};

// [10] AttValue ::= '"' ([^<&"] | Reference)* '"' | "'" ([^<&'] | Reference)* "'"
SAXScanner.prototype.scanAttValue = function() {
    if (this.ch === '"' || this.ch === "'") {
        var quote = this.ch;
        try {
            this.nextChar(true);
            var attValue = this.nextCharRegExp(new RegExp("[" + quote + "<&]"));
            //if found a "&"
            while (this.ch === "&") {
                this.nextChar(true);
                try {
                    var ref = this.scanRef();
                    attValue += ref;
                } catch (e2) {
                    if (e2 instanceof InternalEntityNotFoundException) {
                        this.saxParser.fireError("entity reference : [" + e2.entityName + "] not declared, ignoring it", SAXParser.ERROR);
                    } else {
                        throw e2;
                    }
                }
                attValue += this.nextCharRegExp(new RegExp("[" + quote + "<&]"));
            }
            if (this.ch === "<") {
                return this.saxParser.fireError("invalid attribute value, must not contain &lt;", SAXParser.FATAL);
            }
            //current char is ending quote
            this.nextChar();
        //adding a message in that case
        } catch(e) {
            if (e instanceof EndOfInputException) {
                return this.saxParser.fireError("document incomplete, attribute value declaration must end with a quote", SAXParser.FATAL);
            } else {
                throw e;
            }
        }
        return attValue;
    } else {
        return this.saxParser.fireError("invalid attribute value declaration, must begin with a quote", SAXParser.FATAL);
    }
};

// [18]   	CDSect	   ::=   	 CDStart  CData  CDEnd
// [19]   	CDStart	   ::=   	'<![CDATA['
// [20]   	CData	   ::=   	(Char* - (Char* ']]>' Char*))
// [21]   	CDEnd	   ::=   	']]>'
SAXScanner.prototype.scanCData = function() {
    if (this.isFollowedBy("[CDATA[")) {
        this.saxEvents.startCDATA();
        // Reports the same as for text
        var start = this.index;
        var cdata = this.nextRegExp(/\]\]>/);
        var length = this.index - start;
        this.saxEvents.characters(cdata, start, length);
        //goes after final '>'
        this.nextNChar(3);
        this.saxEvents.endCDATA();
        return true;
    } else {
        return false;
    }
};

// [66] CharRef ::= '&#' [0-9]+ ';' | '&#x' [0-9a-fA-F]+ ';'
// current ch is char after "&#",  returned current char is after ";"
SAXScanner.prototype.scanCharRef = function() {
    var returned, charCode = "";
    if (this.ch === "x") {
        this.nextChar(true);
        while (this.ch !== ";") {
            if (!/[0-9a-fA-F]/.test(this.ch)) {
                this.saxParser.fireError("invalid char reference beginning with x, must contain alphanumeric characters only", SAXParser.ERROR);
            } else {
                charCode += this.ch;
            }
            this.nextChar(true);
        }
        returned = String.fromCharCode("0x" + charCode);
    } else {
        while (this.ch !== ";") {
            if (!/\d/.test(this.ch)) {
                this.saxParser.fireError("invalid char reference, must contain numeric characters only", SAXParser.ERROR);
            } else {
                charCode += this.ch;
            }
            this.nextChar(true);
        }
        returned = String.fromCharCode(charCode);
    }
    //current char is ';'
    this.nextChar(true);
    return returned;
};

/*
[68]  EntityRef ::= '&' Name ';'
may return undefined, has to be managed differently depending on
*/
SAXScanner.prototype.scanEntityRef = function() {
    try {
        var ref = this.scanName();
        //current char must be ';'
        if (this.ch !== ";") {
            this.saxParser.fireError("entity : [" + ref + "] contains an invalid character : [" + this.ch + "], or it is not ended by ;", SAXParser.ERROR);
            return "";
        }
        this.nextChar(true);
        this.saxEvents.startEntity(ref);
        this.saxEvents.endEntity(ref);
        // well-formed documents need not declare any of the following entities: amp, lt, gt, quot.
        if (NOT_REPLACED_ENTITIES.test(ref)) {
            return "&" + ref + ";";
        //apos is replaced by '
        } else if (APOS_ENTITY.test(ref)) {
            return "'";
        }
        var replacement = this.entities[ref];
        if (replacement === undefined) {
            throw new InternalEntityNotFoundException(ref);
        }
        return replacement;
    //adding a message in that case
    } catch(e) {
        if (e instanceof EndOfInputException) {
            return this.saxParser.fireError("document incomplete, entity reference must end with ;", SAXParser.FATAL);
        } else {
            throw e;
        }
    }
};

// [42] ETag ::= '</' Name S? '>'
SAXScanner.prototype.scanEndingTag = function() {
    var qName = this.scanQName("");
    var namespaceURI = null;
    try {
        namespaceURI = this.namespaceSupport.getURI(qName.prefix);
    } catch(e) {
        this.saxParser.fireError("namespace of ending tag : [" + qName.qName + "] not found", SAXParser.ERROR);
    }
    var currentElement = this.elementsStack.pop();
    if (qName.qName === currentElement) {
        this.skipWhiteSpaces();
        if (this.ch === ">") {
            this.endMarkup(namespaceURI, qName);
            this.nextChar(true);
            return true;
        } else {
            return this.saxParser.fireError("invalid ending markup, does not finish with &gt;", SAXParser.FATAL);
        }
    } else {
        return this.saxParser.fireError("invalid ending markup : [" + qName.qName + "], markup name does not match current one : [" + currentElement + "]", SAXParser.FATAL);
    }
};


SAXScanner.prototype.endMarkup = function(namespaceURI, qName) {
    this.saxEvents.endElement(namespaceURI, qName.localName, qName.qName);
    var namespacesRemoved = this.namespaceSupport.popContext();
    for (var i in namespacesRemoved) {
        this.saxEvents.endPrefixMapping(i);
    }
    this.relativeBaseUris.pop();
};

/*
[4]   	NameStartChar	   ::=   	":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]
[4a]   	NameChar	   ::=   	NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]
[5]   	Name	   ::=   	NameStartChar (NameChar)*
*/
SAXScanner.prototype.scanName = function() {
    if (NOT_START_CHAR.test(this.ch)) {
        this.saxParser.fireError("invalid starting character in Name : [" + this.ch + "]", SAXParser.FATAL);
        return "";
    }
    var name = this.ch;
    this.nextChar(true);
    name += this.nextCharRegExp(NOT_START_OR_END_CHAR);
    return name;
};

/*
if dontSkipWhiteSpace is not passed, then it is false so skipWhiteSpaces is default
if end of document, char is ''
*/
SAXScanner.prototype.nextChar = function(dontSkipWhiteSpace) {
    this.index++;
    this.ch = this.xml.charAt(this.index);
    if (!dontSkipWhiteSpace) {
        this.skipWhiteSpaces();
    }
    if (this.index >= this.length) {
        throw new EndOfInputException();
    }
};

SAXScanner.prototype.skipWhiteSpaces = function() {
    while (WS.test(this.ch)) {
        this.index++;
        if (this.index >= this.length) {
            throw new EndOfInputException();
        }
        this.ch = this.xml.charAt(this.index);
    }
};

/*
increases the token of 'n' chars
does not check for EndOfInputException as in general it is checked already
*/
SAXScanner.prototype.nextNChar = function(numberOfChars) {
    this.index += numberOfChars;
    this.ch = this.xml.charAt(this.index);
};

/*
goes to next reg exp and return content, from current char to the char before reg exp
At end of the method, current char is first char of the regExp
*/
SAXScanner.prototype.nextRegExp = function(regExp) {
    var oldIndex = this.index;
    var inc = this.xml.substr(this.index).search(regExp);
    if (inc === -1) {
        throw new EndOfInputException();
    } else {
        this.nextNChar(inc);
        return this.xml.substring(oldIndex, this.index);
    }
};

/*
memory usage reduction of nextRegExp, compares char by char, does not extract this.xml.substr(this.index)
for flexibility purpose, current char at end of that method is the character of the regExp found in xml
*/
SAXScanner.prototype.nextCharRegExp = function(regExp, continuation) {
    for (var oldIndex = this.index ; this.index < this.length ; this.index++) {
        this.ch = this.xml.charAt(this.index);
        if (regExp.test(this.ch)) {
            if (continuation && continuation.pattern.test(this.ch)) {
                return continuation.cb.call(this);
            }
            return this.xml.substring(oldIndex, this.index);
        }
    }
    throw new EndOfInputException();
};

/*

*/
SAXScanner.prototype.isFollowedBy = function(str) {
    var length = str.length;
    if (this.xml.substr(this.index, length) === str) {
        this.nextNChar(length);
        return true;
    }
    return false;
};

SAXScanner.prototype.nextGT = function() {
    var content = this.nextCharRegExp(/>/);
    this.index++;
    this.ch = this.xml.charAt(this.index);
    return content;
};

SAXScanner.prototype.nextEndPI = function() {
    var content = this.nextCharRegExp(new RegExp(NOT_CHAR+'|\\?'), NOT_A_CHAR_CB_OBJ);
    //if found a "?", end if it is followed by ">"
    while (this.ch === "?") {
        this.nextChar(true);
        if (this.isFollowedBy(">")) {
            break;
        }
        content += "?" + this.nextCharRegExp(new RegExp(NOT_CHAR+'|\\?'), NOT_A_CHAR_CB_OBJ);
    }
    return content;
};

/*
goes after ' or " and return content
current char is opening ' or "
*/
SAXScanner.prototype.quoteContent = function() {
    this.index++;
    var content = this.nextCharRegExp(new RegExp(this.ch));
    this.index++;
    this.ch = this.xml.charAt(this.index);
    return content;
};



this.SAXScanner = SAXScanner;

}()); // end namespace
