// ═══════════════════════════════════════════════════════════════
//  DJUBO — static/js/services/attendance.service.js
//  Handles localStorage read/write for attendance & leaves
// ═══════════════════════════════════════════════════════════════

app.service('AttendanceService', function() {

    this.getAttendance = function(employeeId) {
        return JSON.parse(localStorage.getItem('attendance_' + employeeId) || '[]');
    };

    this.saveAttendance = function(employeeId, records) {
        localStorage.setItem('attendance_' + employeeId, JSON.stringify(records));
    };

    this.getLeaves = function(employeeId) {
        return JSON.parse(localStorage.getItem('leaves_' + employeeId) || '[]');
    };

    this.saveLeaves = function(employeeId, leaves) {
        localStorage.setItem('leaves_' + employeeId, JSON.stringify(leaves));
    };

    this.getAllLeaves = function() {
        return JSON.parse(localStorage.getItem('allLeaveRequests') || '[]');
    };

    this.saveAllLeaves = function(leaves) {
        localStorage.setItem('allLeaveRequests', JSON.stringify(leaves));
    };

    this.getUsers = function() {
        return JSON.parse(localStorage.getItem('djuboUsers') || '[]');
    };

    this.saveUsers = function(users) {
        localStorage.setItem('djuboUsers', JSON.stringify(users));
    };
});