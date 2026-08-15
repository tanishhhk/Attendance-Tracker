var app = angular.module('djuboAttendanceApp', ['ngRoute']);

// fmtDuration() and seedAbsent() used to live here. Both were globals used only
// by the deleted localStorage-era AdminController, and seedAbsent() fabricated
// client-side "absent" rows that the API-backed app never reads.
