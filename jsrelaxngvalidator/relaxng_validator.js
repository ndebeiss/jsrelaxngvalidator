(function () {

var _rngURI = 'http://relaxng.org/ns/structure/1.0',
    _annURI = 'http://relaxng.org/ns/compatibility/annotations/1.0';

/**
 * @private
 * @constant
 */
function _extractNamespaces (node, namespaces) {
    if (node) {
        var nodeAtts = node.attributes;
        for (var i = 0 ; i < nodeAtts.length ; i++) {
            if (nodeAtts[i].nodeName.match('xmlns')) {
                var prefix = nodeAtts[i].localName.replace(/^xmlns$/, '');
                namespaces[prefix] = nodeAtts[i].value;
            }
        }
        for (var childNode = getFirstChildElement(node) ; childNode ; childNode = getNextSiblingElement(childNode)) {
            _extractNamespaces(childNode, namespaces);
        }
    }
}

/**
 * @private
 * @constant
 */
function _dumpNamespaces (relaxng, node, namespaces) {
    for (var i in namespaces) {
        //does not duplicate
        var isNotPresent = true;
        for (var childNode = getFirstChildElement(node) ; childNode ; childNode = getNextSiblingElement(childNode)) {
            if (childNode.nodeName == 'nsp:namespace') {
                if (childNode.getAttribute('prefix') == i) {
                    isNotPresent = false;
                }
            }
        }
        if (isNotPresent) {
            var namespace = relaxng.createElementNS('namespace_declaration', 'nsp:namespace');
            namespace.setAttribute('prefix', i);
            namespace.setAttribute('uri', namespaces[i]);
            node.appendChild(namespace);
        }
    }
}

/**
 * Returns an instance used for validating RelaxNG schemas (XML sytax), whose 
 *  process can begun by invoking the startDocument() method
 * @class Used for validating RelaxNG schemas (XML sytax)
 * @param {HTMLElement} result Where messages will be dumped
 * @param {HTMLElement} sax_events For reporting SAX events? (NOT IN USE)
 * @param {XMLDocument} relaxng The XML RelaxNG document node
 * @param {Boolean} debug Debug mode (invokes overridable method debugMsg() with HTML)
 * 
 * @property {XMLElement} childNode Root node of the xml being validated
 * @property {Context} context
 * @property {XMLElement} currentElementNode
 * @property {NodeList} defines The RelaxNG "define" elements
 * @property {Context} instanceContext
 * @property {Object} pattern Adheres to interface with methods toHTML() and toString()
 * @property {XMLDocument} relaxng The (simplified) XML RelaxNG document node
 * @property {Array} relaxng_namespaces
 * @property {HTMLElement} result Where messages will be dumped
 * @property {Object} resultPattern Adheres to interface with methods toHTML() and toString()
 * @property rootNode The documentElement of the "relaxng" document node argument
 * @property {HTMLElement} sax_events For reporting SAX events? NOT IN USE
 * @property {SaxParser} saxParser Keeps a reference on saxParser in order to fire an error and stops parsing
 * @property {ValidatorFunctions} validatorFunctions Reference to its validator_functions
 */
function RelaxNGValidator(result, sax_events, relaxng, debug, xsltPath) {
    this.result = result;
    this.sax_events = sax_events;
    if (debug) {
        this.debug = true;
    }
    if (!xsltPath) {
        xsltPath = "";
    } else if (xsltPath.charAt(xsltPath.length - 1) !== '/') {
        xsltPath = xsltPath + "/";
    }
    if (typeof relaxng === "string") {
        relaxng = createDocumentFromText(relaxng);
        if (relaxng.documentElement.nodeName === "parsererror") {
            result.innerHTML = innerXML(relaxng.documentElement);
            throw new Error();
        }
    }
    
    this.relaxng_namespaces = [];
    _extractNamespaces(relaxng.documentElement, this.relaxng_namespaces);
    
    // First transformation is to import included schemas
    this.relaxng = applyXslt(relaxng, xsltPath + 'rng-simplification/rng-simplification_step1.xsl');
    _extractNamespaces(this.relaxng.documentElement, this.relaxng_namespaces);
    
    // TODO 18
    for (var i = 2 ; i < 17 ; i++) {
        this.relaxng = applyXslt(this.relaxng, xsltPath + 'rng-simplification/rng-simplification_step' + i + '.xsl');
        // Work around the bug of the Firefox XSLT processor which does
        //   not copy namespaces mappings with function xsl:copy
        _dumpNamespaces(relaxng, this.relaxng.documentElement, this.relaxng_namespaces);
    }
    this.rootNode = this.relaxng.documentElement;	
    
    this.validatorFunctions = new ValidatorFunctions(this, new DatatypeLibrary());
}

RelaxNGValidator.prototype.setSaxParser = function(saxParser) {
    this.saxParser = saxParser;
};
    
    /*
    grammar	??::=??	<grammar> <start> top </start> define* </grammar>

    */
RelaxNGValidator.prototype.startDocument = function() {
    var baseURI = '';
    if (this.rootNode.baseURI) {
        baseURI = this.rootNode.baseURI;
    }
    this.context = new Context(baseURI, []);
    this.defines = this.rootNode.getElementsByTagNameNS(_rngURI, 'define');
    this.instanceContext = new Context(baseURI, []);
    var start = this.rootNode.getElementsByTagNameNS(_rngURI, 'start').item(0);		
    this.pattern = this.getPattern(getFirstChildElement(start), this.context);
    
    if (this.debug) {
        this.debugMsg("parsing the schema resulted in that pattern = <br/>" + this.pattern.toHTML());
    }
};

RelaxNGValidator.prototype.startElement = function(namespaceURI, localName, qName, atts) {        
    var attributeNodes = [];
    for (var i = 0 ; i < atts.getLength() ; i++) {
        attributeNodes.push(new AttributeNode(new QName(atts.getURI(i), atts.getLocalName(i)), atts.getValue(i)));
    }
    var newElement = new ElementNode(new QName(namespaceURI, localName), this.instanceContext, attributeNodes, []);
    //this.childNode must be an ElementNode
    if (!this.childNode) {
        this.childNode = this.currentElementNode = newElement;
    } else {
        this.currentElementNode.childNodes.push(newElement);
        newElement.setParentNode(this.currentElementNode);
        this.currentElementNode = newElement;
    }
};

/*
data Pattern = Empty
               | NotAllowed
               | Text
               | Choice Pattern Pattern
               | Interleave Pattern Pattern
               | Group Pattern Pattern
               | OneOrMore Pattern
               | List Pattern
               | Data Datatype ParamList
               | DataExcept Datatype ParamList Pattern
               | Value Datatype String Context
               | Attribute NameClass Pattern
               | Element NameClass Pattern
               | After Pattern Pattern
*/
RelaxNGValidator.prototype.getPattern = function(node, context) {
    var firstElement, secondElement;
    var newContext = this.addNamespaces(node, context);
    var name = node.nodeName;
    var prefix = '';
    if (name.indexOf(':') !== -1) {
        prefix = name.split(':')[0];
    }
    if (node.namespaceURI === _rngURI) {
        switch(node.localName) {
            case 'empty':
                return new Empty();
            case 'notAllowed':
                return new NotAllowed();
            case 'text':
                return new Text();
            case 'choice':
                firstElement = getFirstChildElement(node);
                secondElement = getNextSiblingElement(firstElement);
                return new Choice(this.getPattern(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'interleave':
                firstElement = getFirstChildElement(node);
                secondElement = getNextSiblingElement(firstElement);
                return new Interleave(this.getPattern(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'group':
                firstElement = getFirstChildElement(node);
                secondElement = getNextSiblingElement(firstElement);
                return new Group(this.getPattern(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'oneOrMore':
                firstElement = getFirstChildElement(node);
                return new OneOrMore(this.getPattern(firstElement, newContext));
            case 'list':
                firstElement = getFirstChildElement(node);
                return new List(this.getPattern(firstElement, newContext));
            case 'data':
                return this.getData(node, newContext);
            case 'value':
                return new Value(this.getDatatype(node), textContent(node), newContext);
            case 'attribute':
                firstElement = getFirstChildElement(node);
                secondElement = getNextSiblingElement(firstElement);
                return new Attribute(this.getNameClass(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'element':
                firstElement = getFirstChildElement(node);
                secondElement = getNextSiblingElement(firstElement);
                return new Element(this.getNameClass(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'ref':
                var ncName = node.getAttribute('name');
                var define = this.getDefine(ncName);
                return this.getPattern(define, new Context(newContext.uri, []));
            case 'define':
                firstElement = getFirstChildElement(node);
                return this.getPattern(firstElement, newContext);
            default:
                this.fireRelaxngError("invalid pattern found in relaxng : " + node.localName + "<br/>");
                return;
        }
    }
};

RelaxNGValidator.prototype.addNamespaces = function(node, context) {
    var contextCloned = new Context(context.uri, cloneArray(context.map));
    var atts = node.attributes;
    for (var i = 0; atts && i < atts.length; i++) {
        var att = atts[i];
        if (att.nodeName.match('xmlns')) {
            //if it is xmlns only
            var prefix = att.nodeName.replace(/^xmlns$/, '');
            contextCloned.map[prefix] = att.value;
        }
    }
    return contextCloned;
};


/*
      | Data Datatype ParamList
            | DataExcept Datatype ParamList Pattern
*/
RelaxNGValidator.prototype.getData = function(node, context) {
    var datatype = this.getDatatype(node);
    var paramList = [];
    var except;
    for (var childNode = getFirstChildElement(node) ; childNode ; childNode = getNextSiblingElement(childNode)) {
        //param	??::=??	<param name="NCName"> string </param>
        if (childNode.localName === 'param') {
            var name = childNode.getAttribute('name');
            //actually that param name should not have any prefix, but if not respected
            var index = name.indexOf(':');
            if (index !== -1) {
                name = name.substr(index + 1);
            }
            var string = textContent(childNode);
            paramList.push(new Param(name,string));
        //exceptPattern	??::=??	<except> pattern </except>
        } else if (childNode.localName === 'except') {
            except = this.getPattern(getFirstChildElement(childNode), context);
        }
    }
    if (except) {
        return new DataExcept(datatype, paramList, except);
    } else {
        return new Data(datatype, paramList);
    }
};

RelaxNGValidator.prototype.getDatatype = function(node) {
    var datatypeLibrary = node.getAttribute('datatypeLibrary');
    var type = node.getAttribute('type');
    return new Datatype(datatypeLibrary, type);
};

/*
data NameClass = AnyName
                 | AnyNameExcept NameClass
                 | Name Uri LocalName
                 | NsName Uri
                 | NsNameExcept Uri NameClass
                 | NameClassChoice NameClass NameClass
*/	
RelaxNGValidator.prototype.getNameClass = function(node, context) {
    var uri, firstElement;
    if (node.localName === 'anyName') {
        firstElement = getFirstChildElement(node);
        if (firstElement && firstElement.localName === 'except') {
            return new AnyNameExcept(this.getPattern(getFirstChildElement(firstElement), context));
        } else {
            return new AnyName();
        }
    } else if (node.localName === 'name') {
        uri = node.getAttribute('ns');
        //not sure it is possible to modify the xsl in order to have null in uri instead of ""
        // so for now empty uri is considered as null (no namespace)
        if (!uri) {
            uri = null;
        }
        var localName = textContent(node);
        return new Name(uri, localName);
    } else if (node.localName === 'nsName') {
        uri = node.getAttribute('ns');
        firstElement = getFirstChildElement(node);
        if (firstElement && firstElement.localName === 'except') {
            return new NsNameExcept(uri, this.getPattern(getFirstChildElement(firstElement), context));
        } else {
            return new NsName(uri);
        }
    } else if (node.localName === 'choice') {
        firstElement = getFirstChildElement(node);
        var secondElement = getNextSiblingElement(firstElement);
        return new NameClassChoice(this.getNameClass(firstElement, context), this.getNameClass(secondElement, context));
    }
};



/*
define	  ::=  	<define name="NCName" [combine="method"]> pattern+ </define>
*/
RelaxNGValidator.prototype.getDefine = function(ncName) {
    for (var i = 0 ; i < this.defines.length ; i ++) {
        if (this.defines[i].getAttribute('name') == ncName) {
            return this.defines[i];
        }
    }
};

/*
validates again the tree in order to detect missing element
*/
RelaxNGValidator.prototype.endElement = function(namespaceURI,localName,qName) {
    if (this.currentElementNode.parentNode) {
        this.currentElementNode = this.currentElementNode.parentNode;
    }
    
};


RelaxNGValidator.prototype.startPrefixMapping = function(prefix, uri) {
    this.instanceContext.map[prefix] = uri;
};

RelaxNGValidator.prototype.endPrefixMapping = function(prefix) {
    delete this.instanceContext.map[prefix];
};

RelaxNGValidator.prototype.processingInstruction = function(target, data) {};

RelaxNGValidator.prototype.ignorableWhitespace = function(ch, start, length) {};

RelaxNGValidator.prototype.characters = function(ch, start, length) {
    var newText = new TextNode(ch);
    this.currentElementNode.childNodes.push(newText);
};

RelaxNGValidator.prototype.skippedEntity = function(name) {};

RelaxNGValidator.prototype.endDocument = function() {
    if (this.debug) {
        this.debugMsg("validating childNode =<br/>" + this.childNode.toHTML());
    }
    this.resultPattern = this.validatorFunctions.childDeriv(this.context, this.pattern, this.childNode);
    if (this.debug) {
        this.debugMsg("result pattern of that validation is =<br/>" + this.resultPattern.toHTML());
    }
    if (this.resultPattern instanceof NotAllowed) {
        var msg = "document not valid : " + this.resultPattern.message + ", expected : " + this.resultPattern.pattern.toHTML() + ", found : ";
        if (this.resultPattern.childNode.toHTML) {
            msg += this.resultPattern.childNode.toHTML();
        } else {
            msg += this.resultPattern.childNode;
        }
        this.fireRelaxngError(msg);
    } else {
        this.result.innerHTML += "<h4>That XML is valid</h4>";
    }
};

RelaxNGValidator.prototype.setDocumentLocator = function(locator) {};

RelaxNGValidator.prototype.debugMsg = function(message) {};

RelaxNGValidator.prototype.warning = function(saxException) {
    this.relaxngError(saxException.message);
};
RelaxNGValidator.prototype.error = function(saxException) {
    this.relaxngError(saxException.message);
};
RelaxNGValidator.prototype.fatalError = function(saxException) {
    this.relaxngError(saxException.message);
};

RelaxNGValidator.prototype.fireRelaxngError = function(message) {
    this.relaxngError(message);
};

RelaxNGValidator.prototype.relaxngError = function(message) {
    this.result.innerHTML += "<div>validation error : <span>" + message + "</span></div>";
};


// Class "constants"
RelaxNGValidator.namespace = _rngURI;
RelaxNGValidator.annotationNamespace = _annURI;


// EXPORTS
this.RelaxNGValidator = RelaxNGValidator;

}());
