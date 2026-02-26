// ═══════════════════════════════════════════════════════════════
//  DJUBO — angular-app.js
//  Module declaration + shared helper functions
// ═══════════════════════════════════════════════════════════════

var app = angular.module('djuboAttendanceApp', ['ngRoute']);

// ── SHARED HELPERS ────────────────────────────────────────────

// Format seconds → "Xh Ym"
function fmtDuration(seconds) {
    var d = moment.duration(seconds, 'seconds');
    return Math.floor(d.asHours()) + 'h ' + d.minutes() + 'm';
}

// Stamp absent records for a single employee from their join date up to
// (but not including) today, skipping weekends and existing records.
// Returns true if anything was written so caller can save.
function seedAbsent(records, joinDate) {
    var today   = moment().startOf('day');
    var start   = moment(joinDate).startOf('day');
    var cursor  = start.clone();
    var changed = false;

    while (cursor.isBefore(today)) {
        var dow = cursor.day();
        if (dow !== 0 && dow !== 6) {               // skip weekends
            var exists = _.find(records, function(r) {
                return moment(r.date).isSame(cursor, 'day');
            });
            if (!exists) {
                records.push({
                    date: cursor.toDate(), checkIn: null, checkOut: null,
                    status: 'absent', workDuration: null, totalBreakTime: null,
                    breaks: [], autoMarked: true
                });
                changed = true;
            }
        }
        cursor.add(1, 'day');
    }

    if (changed) {
        records.sort(function(a, b) { return moment(a.date) - moment(b.date); });
    }
    return changed;
}