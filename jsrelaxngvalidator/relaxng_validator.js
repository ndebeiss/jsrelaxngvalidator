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

function RelaxNGValidator(result, sax_events, relaxng, debug) {
    //result is where messages will be dumped
    this.result = result;
    this.sax_events = sax_events;
    if (debug) {
        this.debug = true;
    }
    
    this.extractNamespaces = function(node, relaxng, namespaces) {
        if (node) {
            var nodeAtts = node.attributes;
            for (var i = 0 ; i < nodeAtts.length ; i++) {
                if (nodeAtts[i].nodeName.match('xmlns')) {
                    var prefix = nodeAtts[i].localName.replace(/^xmlns$/, "");
                    namespaces[prefix] = nodeAtts[i].value;
                }
            }
            for (var childNode = getFirstChildElement(node) ; childNode ; childNode = getNextSiblingElement(childNode)) {
                this.extractNamespaces(childNode, relaxng, namespaces);
            }
        }
    }
    this.dumpNamespaces = function(node) {
        for (var i in this.relaxng_namespaces) {
            //does not duplicate
            var isNotPresent = true;
            for (var childNode = getFirstChildElement(this.relaxng.documentElement) ; childNode ; childNode = getNextSiblingElement(childNode)) {
                if (childNode.nodeName == 'nsp:namespace') {
                    if (childNode.getAttribute("prefix") == i) {
                        isNotPresent = false;
                    }
                }
            }
            if (isNotPresent) {
                var namespace = relaxng.createElementNS("namespace_declaration", "nsp:namespace");
                namespace.setAttribute("prefix", i);
                namespace.setAttribute("uri", this.relaxng_namespaces[i]);
                node.appendChild(namespace);
            }
        }
    }
    this.relaxng_namespaces = new Array();
    this.extractNamespaces(relaxng.documentElement, relaxng, this.relaxng_namespaces);
    
    //first transformation is to import included schemas
    this.relaxng = applyXslt(relaxng, "rng-simplification/rng-simplification_step1.xsl");
    this.extractNamespaces(this.relaxng.documentElement, this.relaxng, this.relaxng_namespaces);
    
    //TODO 18
    for (var i = 2 ; i < 17 ; i++) {
        this.relaxng = applyXslt(this.relaxng, "rng-simplification/rng-simplification_step" + i + ".xsl");
        //work around the bug of firefox XSLT processor which does not copy namespaces mappings with function xsl:copy
        this.dumpNamespaces(this.relaxng.documentElement);
    }
    this.rootNode = this.relaxng.documentElement;	
    
    //keeps a reference on saxParser in order to fire an error and stops parsing
    this.saxParser;
    //reference to its validator_functions
    this.validatorFunctions = new ValidatorFunctions(this, new DatatypeLibrary());
    
    this.context;
    this.instanceContext;
    
    this.pattern;
    this.resultPattern;
    //root node of the xml being validated
    this.childNode;
    this.currentElementNode;
    
    this.defines;
    
    this.rngUri = "http://relaxng.org/ns/structure/1.0";
    this.aUri = "http://relaxng.org/ns/compatibility/annotations/1.0";
}

RelaxNGValidator.prototype.setSaxParser = function(saxParser) {
    this.saxParser = saxParser;
};
    
    /*
    grammar	??::=??	<grammar> <start> top </start> define* </grammar>

    */
RelaxNGValidator.prototype.startDocument = function() {
    var baseURI = "";
    if (this.rootNode.baseURI) {
        baseURI = this.rootNode.baseURI;
    }
    this.context = new Context(baseURI, new Array());
    this.defines = this.rootNode.getElementsByTagNameNS(this.rngUri, "define");
    this.instanceContext = new Context(baseURI, new Array());
    var start = this.rootNode.getElementsByTagNameNS(this.rngUri, "start").item(0);		
    this.pattern = this.getPattern(getFirstChildElement(start), this.context);
    
    if (this.debug) {
        this.debugMsg("parsing the schema resulted in that pattern = <br/>" + this.pattern.toHTML());
    }
};

RelaxNGValidator.prototype.startElement = function(namespaceURI, localName, qName, atts) {        
    var attributeNodes = new Array();
    for (var i = 0 ; i < atts.getLength() ; i++) {
        attributeNodes.push(new AttributeNode(new QName(atts.getURI(i), atts.getLocalName(i)), atts.getValue(i)));
    }
    var newElement = new ElementNode(new QName(namespaceURI, localName), this.instanceContext, attributeNodes, new Array());
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
    var newContext = this.addNamespaces(node, context);
    var name = node.nodeName;
    var prefix = "";
    if (name.indexOf(":") !== -1) {
        prefix = name.split(":")[0];
    }
    if (node.namespaceURI === this.rngUri) {
        switch(node.localName) {
            case 'empty':
                return new Empty();
            case 'notAllowed':
                return new NotAllowed();
            case 'text':
                return new Text();
            case 'choice':
                var firstElement = getFirstChildElement(node);
                var secondElement = getNextSiblingElement(firstElement);
                return new Choice(this.getPattern(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'interleave':
                var firstElement = getFirstChildElement(node);
                var secondElement = getNextSiblingElement(firstElement);
                return new Interleave(this.getPattern(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'group':
                var firstElement = getFirstChildElement(node);
                var secondElement = getNextSiblingElement(firstElement);
                return new Group(this.getPattern(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'oneOrMore':
                var firstElement = getFirstChildElement(node);
                return new OneOrMore(this.getPattern(firstElement, newContext));
            case 'list':
                var firstElement = getFirstChildElement(node);
                return new List(this.getPattern(firstElement, newContext));
            case 'data':
                return this.getData(node, newContext);
            case 'value':
                return new Value(this.getDatatype(node), textContent(node), newContext);
            case 'attribute':
                var firstElement = getFirstChildElement(node);
                var secondElement = getNextSiblingElement(firstElement);
                return new Attribute(this.getNameClass(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'element':
                var firstElement = getFirstChildElement(node);
                var secondElement = getNextSiblingElement(firstElement);
                return new Element(this.getNameClass(firstElement, newContext), this.getPattern(secondElement, newContext));
            case 'ref':
                var ncName = node.getAttribute("name");
                var define = this.getDefine(ncName);
                return this.getPattern(define, new Context(newContext.uri, new Array()));
            case 'define':
                var firstElement = getFirstChildElement(node);
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
            var prefix = att.nodeName.replace(/^xmlns$/,"");
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
    var paramList = new Array();
    var except;
    for (var childNode = getFirstChildElement(node) ; childNode ; childNode = getNextSiblingElement(childNode)) {
        //param	??::=??	<param name="NCName"> string </param>
        if (childNode.localName === 'param') {
            var name = childNode.getAttribute('name');
            //actually that param name should not have any prefix, but if not respected
            var index = name.indexOf(":");
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
    if (node.localName === 'anyName') {
        var firstElement = getFirstChildElement(node);
        if (firstElement && firstElement.localName === 'except') {
            return new AnyNameExcept(this.getPattern(getFirstChildElement(firstElement), context));
        } else {
            return new AnyName();
        }
    }  else if (node.localName === 'name') {
        var uri = node.getAttribute('ns');
        //not sure it is possible to modify the xsl in order to have null in uri instead of ""
        // so for now empty uri is considered as null (no namespace)
        if (!uri) {
            uri = null;
        }
        var localName = textContent(node);
        return new Name(uri, localName);
    } else if (node.localName === 'nsName') {
        var uri = node.getAttribute('ns');
        var firstElement = getFirstChildElement(node);
        if (firstElement && firstElement.localName === 'except') {
            return new NsNameExcept(uri, this.getPattern(getFirstChildElement(firstElement), context));
        } else {
            return new NsName(uri);
        }
    } else if (node.localName === 'choice') {
        var firstElement = getFirstChildElement(node);
        var secondElement = getNextSiblingElement(firstElement);
        return new NameClassChoice(this.getNameClass(firstElement, context), this.getNameClass(secondElement, context));
    }
};



/*
define	  ::=  	<define name="NCName" [combine="method"]> pattern+ </define>
*/
RelaxNGValidator.prototype.getDefine = function(ncName) {
    for (var i = 0 ; i < this.defines.length ; i ++) {
        if (this.defines[i].getAttribute("name") == ncName) {
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
        this.fireRelaxngError("document not valid : " + this.resultPattern.toHTML() + "<br/>");
    } else {
        this.result.innerHTML += "<h4>That XML is valid</h4>";
    }
};

RelaxNGValidator.prototype.setDocumentLocator = function(locator) {};

RelaxNGValidator.prototype.debugMsg = function(message) {};

RelaxNGValidator.prototype.warning = function(saxException) {
    this.relaxngError(saxException.char, saxException.index, saxException.message);
};
RelaxNGValidator.prototype.error = function(saxException) {
    this.relaxngError(saxException.char, saxException.index, saxException.message);
};
RelaxNGValidator.prototype.fatalError = function(saxException) {
    this.relaxngError(saxException.char, saxException.index, saxException.message);
};

RelaxNGValidator.prototype.fireRelaxngError = function(message) {
    this.relaxngError(this.saxParser.char, this.saxParser.index, message);
};

RelaxNGValidator.prototype.relaxngError = function(char, index, message) {
    this.result.innerHTML += "validation error at char : [" + char + "] at index : " + index + "<br/>";
    this.result.innerHTML += "message is : [" + message + "]<br/>";
};
