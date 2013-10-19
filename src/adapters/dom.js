/**
 * dom storage adapter 
 * === 
 * - originally authored by Joseph Pecoraro
 *
 */ 
//
// TODO does it make sense to be chainable all over the place?
// chainable: nuke, remove, all, get, save, all    
// not chainable: valid, keys
//
Lawnchair.adapter('dom', (function() {
    var storage = window.localStorage
    
    // Generates (quite) small incremental UUID's which are tacked onto the end
    // of LocalStorage keys to remove the requirement for a seperate indexer.
    //
    // NOTE: Taken from https://github.com/forbesmyester/SyncIt, Could be used
    // for Lawnchair.uuid()
    var getTLIdEncoderDecoder = function(epoch,uniqueLength) {
    
		var lastDate = null;
		var index = -1;
		if (uniqueLength === undefined) {
			uniqueLength = 1;
		}
	
		if (typeof epoch != 'number') {
			throw "Only takes timestamps";
		}
		
		var genUid = function(now) {
			
			if (now === undefined) {
				now = new Date().getTime();
			}
			if (typeof now == 'object') {
				throw "Only takes timestamps";
			}
			
			if ((lastDate === null) || (now !== lastDate)) {
				index = -1;
			}
	
			var superUnique = (++index).toString(32);
			if (superUnique.length < uniqueLength) {
					superUnique = '0' + superUnique;
			}
			var timeEncoded = (now - epoch).toString(32);
	
			if (superUnique.length > uniqueLength) {
				throw "getUidGenerator.genUid cannot generate TLId until next millisecond!";
			}
	
			lastDate = now;
			if (timeEncoded.substr(0,1) <= '9') {
					return "X"+timeEncoded+superUnique;
			}
			return timeEncoded+superUnique;
		};
		
		var uidToTimestamp = function(tlid) {
			if (tlid.substr(0,1) == 'X') {
					tlid = tlid.substr(1);
			}
			tlid = tlid.substr(0, tlid.length - uniqueLength);
			return parseInt(tlid,32) + epoch;
		};
	
		var sort = function(tlidA, tlidB) {
			if (tlidA.substr(0,1) == 'X') {
					tlidA = tlidA.substr(1);
			}
			if (tlidB.substr(0,1) == 'X') {
					tlidB = tlidB.substr(1);
			}
			tlidA = tlidA.replace(/.*\./,'');
			tlidB = tlidB.replace(/.*\./,'');
			if (tlidA.length != tlidB.length) {
					return (tlidA.length < tlidB.length) ? -1 : 1;
			}
			return (tlidA < tlidB) ? -1 : 1;
		};
		
		return {encode: genUid, decode: uidToTimestamp, sort: sort};
	};
	
	var keyCollector = function(inst, searchKey) {
        var keys = [];
        var key;
        var subKey;
        for (var i = 0, l = storage.length; i<l; i++) {
            key = storage.key(i);
            if (key.substring(0, inst.name.length + 1) == inst.name + ".") {
                if (
                    (searchKey === undefined) ||
                    (key.substring(inst.name.length + 1).replace(/\.[^\.]+$/,'') == searchKey)
                ) {
                    keys.push(key.substring(inst.name.length + 1));
                }
            }
        }
        keys.sort(inst.indexer.sort);
        return keys;
    }
    
    // adapter api 
    return {
    
        // ensure we are in an env with localStorage 
        valid: function () {
            return !!storage && function() {
              // in mobile safari if safe browsing is enabled, window.storage
              // is defined but setItem calls throw exceptions.
              var success = true
              var value = Math.random()
              try {
                storage.setItem(value, value)
              } catch (e) {
                success = false
              }
              storage.removeItem(value)
              return success
            }()
        },

        init: function (options, callback) {
            this.indexer = getTLIdEncoderDecoder(new Date(2013,9,19).getTime());
            if (callback) this.fn(this.name, callback).call(this, this)  
        },
        
        save: function (obj, callback) {
            var key;
            // Calculate key in localStorage
            if (obj.key) {
                key = keyCollector(this, obj.key);
                if (key.length) {
                    key = this.name + '.' + key[0];
                } else {
                    key = this.name + '.' + obj.key + '.' + this.indexer.encode();
                }
            } else {
                key = this.name + '.' + this.uuid() +'.' + this.indexer.encode();
            }
            
            // now we kil the key and use it in the store colleciton
            delete obj.key;
            storage.setItem(key, JSON.stringify(obj))
            // if the key is not in the index push it on
            obj.key = key.slice(this.name.length + 1).replace(/\.[^.]+$/,'');
            if (callback) {
                this.lambda(callback).call(this, obj)
            }
            return this
        },

        batch: function (ary, callback) {
            var saved = []
            // not particularily efficient but this is more for sqlite situations
            for (var i = 0, l = ary.length; i < l; i++) {
                this.save(ary[i], function(r){
                    saved.push(r)
                })
            }
            if (callback) this.lambda(callback).call(this, saved)
            return this
        },
        
        // accepts [options], callback
        keys: function(callback) {
            
            var replaceFunc = function(r){
                return r.replace(/\.[^\.]+$/,'')
            };
            
            var keys = [];
            
            if (callback) {
                if(Array.prototype.map) {
                    keys = keyCollector(this).map(replaceFunc)
                } else {
                    var indices = keyCollector(this);
                    for (var i = 0, l = indices.length; i < l; i++) {
                        keys.push(replaceFunc(indices[i]));
                    }
                }
                
                this.fn('keys', callback).call(this, keys)
            }
            return this // TODO options for limit/offset, return promise
        },
        
        get: function (key, callback) {
            
            var getRealKeyObj = function(realKey) {
                var r = {};
                for (var i = 0, l = realKey.length; i < l; i++) {
                    r[realKey[i].replace(/\.[^\.]+$/,'')] = realKey[i].replace(/.*\./,'');
                }
                return r;
            }
            
            var obj = null,
                realKeyObj,
                realKey;

            if (this.isArray(key)) {
                realKeyObj = getRealKeyObj(keyCollector(this));
                
                var r = []
                for (var i = 0, l = key.length; i < l; i++) {
                    obj = null;
                    if (realKeyObj.hasOwnProperty(key[i])) {
                        obj = storage.getItem(this.name + '.' + key[i] + '.' + realKeyObj[key[i]]);
                        if (obj) {
                            obj = JSON.parse(obj)
                            obj.key = key[i]
                        } 
                    }
                    r.push(obj)
                }
                if (callback) this.lambda(callback).call(this, r)
            } else {
                realKey = keyCollector(this, key);
                if (realKey.length) {
                    obj = storage.getItem(this.name + '.' + realKey[0]);
                    if (obj) {
                        obj = JSON.parse(obj)
                        obj.key = key
                    }
                }
                if (callback) this.lambda(callback).call(this, obj)
            }
            return this
        },

        exists: function (key, cb) {
            var exists = keyCollector(this, key).length ? true : false;
            this.lambda(cb).call(this, exists);
            return this;
        },
        // NOTE adapters cannot set this.__results but plugins do
        // this probably should be reviewed
        all: function (callback) {
        
            var realKey = keyCollector(this)
            ,   r       = []
            ,   o
            for (var i = 0, l = realKey.length; i < l; i++) {
                o = storage.getItem(this.name + '.' + realKey[i]);
                if (o) {
                    o = JSON.parse(o)
                    o.key = realKey[i].replace(/\.[^\.]+$/,'');
                } 
                r.push(o);
            }
            
            if (callback) this.fn(this.name, callback).call(this, r)
            return this
        },
        
        remove: function (keyOrArray, callback) {
            var self = this;
            if (this.isArray(keyOrArray)) {
                // batch remove
                var i, done = keyOrArray.length;
                var removeOne = function(i) {
                    self.remove(keyOrArray[i], function() {
                        if ((--done) > 0) { return; }
                        if (callback) {
                            self.lambda(callback).call(self);
                        }
                    });
                };
                for (i=0; i < keyOrArray.length; i++)
                    removeOne(i);
                return this;
            }
            
            var realKey = keyCollector(this, keyOrArray.key ? keyOrArray.key : keyOrArray);
            if (realKey.length) {
                storage.removeItem(this.name + '.' + realKey[0])
            }
            
            if (callback) this.lambda(callback).call(this)
            return this
        },
        
        nuke: function (callback) {
            var realKey = keyCollector(this);
            for (var i = 0, l = realKey.length; i < l; i++) {
                storage.removeItem(this.name + '.' + realKey[i])
            }
            if (callback) this.lambda(callback).call(this)
            return this
        }
}})());
