// A raw WebDAV interface
var WebDAV = {
  GET: function(url, callback) {
    return this.request('GET', url, {}, null, 'text', callback);
  },

  PROPFIND: function(url, callback) {
    return this.request('PROPFIND', url, {Depth: "1"}, null, 'xml', callback);
  },

  MKCOL: function(url, callback) {
    return this.request('MKCOL', url, {}, null, 'text', callback);
  },
  
  DELETE: function(url, callback) {
    return this.request('DELETE', url, {}, null, 'text', callback);
  },

  PUT: function(url, data, callback) {
    return this.request('PUT', url, {}, data, 'text', callback);
  },

  MOVE: function(url, dest, overwrite, callback){
    var headers = {Destination : dest, 
                  Overwrite : overwrite ? "T" : "F"};

    return this.request('MOVE', url, headers, null, 'text', callback);
  },

  COPY: function(url, dest, overwrite, callback){
    var headers = {Destination : dest, 
                  Overwrite : overwrite ? "T" : "F"};

    return this.request('COPY', url, headers, null, 'text', callback);
  },
  
  request: function(verb, url, headers, data, type, callback) {
    var xhr = new XMLHttpRequest();
    var body = function() {
      var b = xhr.responseText;
      if (type == 'xml') {
        var xml = xhr.responseXML;
        if(xml) {
          b = xml.firstChild.nextSibling ? xml.firstChild.nextSibling : xml.firstChild;
        }
      }
      return b;
    };
    
    if(callback) {
      xhr.onreadystatechange = function() {
        if(xhr.readyState === 4) { // complete.
          var code = xhr['status'];
          var b = body();
          if(code !== 200 && code !== 201 && code != 207 && code != 102 ){
            callback({code : code, message : xhr['statusText']}, b);
          }else{
            callback(null, b);
          }
        }
      };
    }
    xhr.open(verb, url, !!callback);
    xhr.setRequestHeader("Content-Type", "text/xml; charset=UTF-8");
    for (var header in headers) {
      xhr.setRequestHeader(header, headers[header]);
    }
    xhr.send(data);

    if(!callback) {
      return body();
    }
  }
};

// An Object-oriented API around WebDAV.
WebDAV.Fs = function(rootUrl) {
  this.rootUrl = rootUrl;
  var fs = this;
  var parseElement = function(element){
    if(!element.firstChild){
      return null;
    }else if(element.firstChild.nodeType === 3){
      return element.firstChild.nodeValue;
    }else{
      var childNodes = element.childNodes;
      var result = {};
      for(var i=0; i<childNodes.length; i++){
        result[childNodes[i].localName] = parseElement(childNodes[i]);
      }
      return result;
    }
  }
 
  this.file = function(href, properties, statusCode) {
    this.type = 'file';

    this.url = fs.urlFor(href);

    this.name = fs.nameFor(this.url);

    this.properties= properties;

    this.statusCode = statusCode;

    this.read = function(callback) {
      return WebDAV.GET(this.url, callback);
    };

    this.write = function(data, callback) {
      return WebDAV.PUT(this.url, data, callback);
    };

    this.rm = function(callback) {
      return WebDAV.DELETE(this.url, callback);
    };

    this.move = function(destination, overwrite, callback){
      return WebDAV.MOVE(this.url, destination, overwrite, callback);
    };

    this.copy = function(destination, overwrite, callback){
      return WebDAV.COPY(this.url, destination, overwrite, callback);
    };

    return this;
  };
  
  this.dir = function(href, properties, statusCode) {
    this.type = 'dir';

    this.url = fs.urlFor(href);

    this.name = fs.nameFor(this.url);

    this.properties= properties;

    this.statusCode = statusCode;

    this.children = function(callback) {
      var childrenFunc = function(doc) {
        if(doc.childNodes == null) {
          throw('No such directory: ' + url);
        }

        var ns = 'DAV:';
        var result = [];
        // Start at 1, because the 0th is the same as self.
        for(var i=1; i< doc.childNodes.length; i++) {
          var response     = doc.childNodes[i];
          var href         = response.getElementsByTagNameNS(ns, 'href')[0].firstChild.nodeValue;
          href = href.replace(/\/$/, ''); // Strip trailing slash
          var propstat     = parseElement(response.getElementsByTagNameNS(ns, 'propstat')[0]);

          if(propstat['prop']['resourcetype'] !== null && typeof propstat['prop']['resourcetype']['collection'] !=='undefined') {
            result[i-1] = new fs.dir(href, propstat['prop'], propstat['status']);
          } else {
            result[i-1] = new fs.file(href, propstat['prop'], propstat['status']);
          }
        }
        return result;
      };

      if(callback) {
        WebDAV.PROPFIND(this.url, function(httpStatus, doc) {
          callback(httpStatus, childrenFunc(doc));
        });
      } else {
        return childrenFunc(WebDAV.PROPFIND(this.url));
      }
    };

    this.rm = function(callback) {
      return WebDAV.DELETE(this.url, callback);
    };

    this.mkdir = function(callback) {
      return WebDAV.MKCOL(this.url, callback);
    };

    this.move = function(destination, overwrite, callback){
      return WebDAV.MOVE(this.url, destination, overwrite, callback);
    };

    this.copy = function(destination, overwrite, callback){
      return WebDAV.COPY(this.url, destination, overwrite, callback);
    };

    return this;
  };
  
  this.urlFor = function(href) {
    return (/^http/.test(href) ? href : this.rootUrl + href);
  };
  
  this.nameFor = function(url) {
    return url.replace(/.*\/(.*)/, '$1');
  };

  return this;
};
