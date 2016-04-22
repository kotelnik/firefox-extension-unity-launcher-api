// load component utils
var { Cu } = require('chrome');

// load firefox download library
Cu.import('resource://gre/modules/Downloads.jsm');

//
// load unity library
//
Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function unity_library() {
    try {
        
        // open library
        var library = ctypes.open('libunity.so.9');

        // prepare bind function
        var self = this;
        function lazy_bind() {
            var args = Array.prototype.slice.call(arguments, 0);
            XPCOMUtils.defineLazyGetter(self, args[0], function () {
                let localArgs = [ args[0], ctypes.default_abi ].concat( Array.prototype.slice.call(args, 1) );
                return library.declare.apply(library, localArgs);
            });
        }

        // bind library methods
        var entryType = ctypes.StructType("UnityLauncherEntry");
        lazy_bind('unity_launcher_entry_get_for_desktop_id',   entryType.ptr, ctypes.char.ptr);
        lazy_bind('unity_launcher_entry_set_progress',         ctypes.void_t, entryType.ptr, ctypes.double);
        lazy_bind('unity_launcher_entry_set_progress_visible', ctypes.void_t, entryType.ptr, ctypes.int);
        lazy_bind('unity_launcher_entry_set_count',            ctypes.void_t, entryType.ptr, ctypes.int64_t);
        lazy_bind('unity_launcher_entry_set_count_visible',    ctypes.void_t, entryType.ptr, ctypes.int);
        
    } catch (e) {
        Cu.reportError(e);
    }
}

var unity = new unity_library();

// get entry for firefox
var entry = unity.unity_launcher_entry_get_for_desktop_id('firefox.desktop');

//
// add listening for download changes
//
// overall progress and counter visibility
Downloads.getSummary(Downloads.ALL).then(function (summary) {
    
    // globals
    var allHaveStopped = true;
    
    summary.addView({
        onSummaryChanged: function () {
            unity.unity_launcher_entry_set_progress_visible(entry, !summary.allHaveStopped);
            unity.unity_launcher_entry_set_progress(entry, summary.progressCurrentBytes / summary.progressTotalBytes);
            if (summary.allHaveStopped) {
                unity.unity_launcher_entry_set_count(entry, 0);
                unity.unity_launcher_entry_set_count_visible(entry, false);
                allHaveStopped = true;
            } else if (allHaveStopped === true) { // was previously true
                unity.unity_launcher_entry_set_count_visible(entry, true);
            }
        }
    });
});

// count
Downloads.getList(Downloads.ALL).then(function (list) {
    
    // globals
    var runningDownloadMap = new Map();
    var lastSize = -1;
    
    list.addView({
        onDownloadChanged: download => {
            
            // add or remove from map
            if (download.hasProgress && !download.stopped && !download.canceled && !download.succeeded) {
                runningDownloadMap.set(download.target.path, download);
            } else {
                runningDownloadMap.delete(download.target.path);
            }

            // set count if changed
            var newSize = runningDownloadMap.size;
            if (lastSize !== newSize) {
                unity.unity_launcher_entry_set_count(entry, newSize);
                lastSize = newSize;
            }
        }
    });
});
