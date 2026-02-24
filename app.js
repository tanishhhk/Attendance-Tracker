// ═══════════════════════════════════════════════════════════════
//  DJUBO — app.js
//  Shared helpers at the top; MainController, EmployeeController,
//  AdminController follow.
// ═══════════════════════════════════════════════════════════════

var app = angular.module('djuboAttendanceApp', []);

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
    var today  = moment().startOf('day');
    var start  = moment(joinDate).startOf('day');
    var cursor = start.clone();
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

// ── MAIN CONTROLLER ───────────────────────────────────────────

app.controller('MainController', function($scope, $window, $interval) {
    var vm = this;

    var currentUser = localStorage.getItem('currentUser');
    if (!currentUser) { $window.location.href = 'login.html'; return; }

    vm.currentUser = JSON.parse(currentUser);
    vm.onBreak     = false;
    vm.breakTimer  = '00:00:00';
    vm.showProfile = false;
    vm.profileData = {};

    // ── MOMENT.JS ── Last login relative time in header
    vm.lastLoginDisplay = vm.currentUser.lastLogin
        ? 'Last login: ' + moment(vm.currentUser.lastLogin, 'YYYY-MM-DD HH:mm:ss').fromNow()
        : '';

    vm.loadProfileData = function() {
        var users = JSON.parse(localStorage.getItem('djuboUsers') || '[]');
        var user  = _.find(users, function(u) { return u.employeeId === vm.currentUser.employeeId; });
        if (user) {
            // ── UNDERSCORE.JS ── _.pick for only the fields we display
            vm.profileData = _.extend(
                _.pick(user, 'name','employeeId','email','department','dob','phone','address','profilePicture'),
                { profilePicture: user.profilePicture || '' }
            );
        }
    };
    vm.loadProfileData();

    vm.openProfile  = function() { vm.loadProfileData(); vm.showProfile = true; };
    vm.closeProfile = function() { vm.showProfile = false; };
    vm.triggerFileUpload = function() { $('#profilePicture').click(); };

    $(document).ready(function() {
        $(document).on('change', '#profilePicture', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                $scope.$apply(function() { vm.profileData.profilePicture = ev.target.result; });
            };
            reader.readAsDataURL(file);
        });
    });

    vm.saveProfile = function() {
        var users = JSON.parse(localStorage.getItem('djuboUsers') || '[]');
        var idx   = _.findIndex(users, { employeeId: vm.currentUser.employeeId });
        if (idx > -1) {
            // ── UNDERSCORE.JS ── _.extend to merge changes
            users[idx] = _.extend(users[idx], {
                name: vm.profileData.name, email: vm.profileData.email,
                department: vm.profileData.department, dob: vm.profileData.dob,
                phone: vm.profileData.phone, address: vm.profileData.address,
                profilePicture: vm.profileData.profilePicture,
                profileUpdatedAt: moment().format('YYYY-MM-DD HH:mm:ss')
            });
            localStorage.setItem('djuboUsers', JSON.stringify(users));
            vm.currentUser = _.extend(vm.currentUser, _.pick(users[idx], 'name','email','department','profilePicture'));
            localStorage.setItem('currentUser', JSON.stringify(vm.currentUser));
            alert('Profile updated successfully!');
            vm.showProfile = false;
        }
    };

    vm.logout  = function() { localStorage.removeItem('currentUser'); $window.location.href = 'login.html'; };
    vm.endBreak = function() { $scope.$broadcast('endBreak'); };
});

// ── EMPLOYEE CONTROLLER ───────────────────────────────────────

app.controller('EmployeeController', function($scope, $interval, $window) {
    var vm      = this;
    var mainCtrl = $scope.$parent.main;

    vm.currentTime    = new Date();
    vm.onBreak        = false;
    vm.breakTimer     = '00:00:00';
    vm.breakStartTime = null;
    vm.breakInterval  = null;
    vm.showChart      = false;
    vm.showLeaveForm  = false;
    vm.leaveForm      = { type: '', fromDate: '', toDate: '', reason: '' };
    vm.leaveTypes     = ['Sick Leave', 'Casual Leave', 'Earned Leave', 'Emergency Leave'];

    $interval(function() { vm.currentTime = new Date(); }, 1000);

    var attendanceKey  = 'attendance_' + mainCtrl.currentUser.employeeId;
    var attendanceData = JSON.parse(localStorage.getItem(attendanceKey) || '[]');

    // ── AUTO-ABSENT: seed from employee's join date ──
    var joinDate = mainCtrl.currentUser.createdAt || mainCtrl.currentUser.joinDate;
    if (joinDate && seedAbsent(attendanceData, joinDate)) {
        localStorage.setItem(attendanceKey, JSON.stringify(attendanceData));
    }

    // ── UNDERSCORE.JS ── tally stats
    var presentRecs = _.filter(attendanceData, function(d) { return d.status === 'present' || d.status === 'late'; });
    vm.stats = {
        presentDays:    presentRecs.length,
        absentDays:     _.where(attendanceData, { status: 'absent' }).length,
        lateDays:       _.where(attendanceData, { status: 'late' }).length,
        attendanceRate: attendanceData.length > 0 ? Math.round(presentRecs.length / attendanceData.length * 100) : 0
    };

    // Today's record
    var todayRecord = _.find(attendanceData, function(d) { return moment(d.date).isSame(moment(), 'day'); });
    vm.todayStatus  = todayRecord || { checkIn: null, checkOut: null, workDuration: null, totalBreakTime: null, breaks: [] };

    // Recompute total break if records loaded from storage
    if (vm.todayStatus.breaks && vm.todayStatus.breaks.length > 0) {
        var totalSec = _.reduce(vm.todayStatus.breaks, function(sum, b) {
            return sum + (b.duration || moment(b.end).diff(moment(b.start), 'seconds'));
        }, 0);
        vm.todayStatus.totalBreakTime = fmtDuration(totalSec);
    }

    // ── MOMENT.JS ── relative check-in time
    vm.checkInFromNow = function() {
        return vm.todayStatus.checkIn ? moment(vm.todayStatus.checkIn).fromNow() : '';
    };

    // ── Calendar ──
    vm.weekDays    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    vm.currentMonth = moment();
    vm.calendarDays = [];

    vm.generateCalendar = function() {
        var som  = vm.currentMonth.clone().startOf('month');
        var eom  = vm.currentMonth.clone().endOf('month');
        var days = [];

        // Pad with prev-month days
        for (var i = 0; i < som.day(); i++) {
            var d = som.clone().subtract(som.day() - i, 'days');
            days.push({ date: d.date(), isCurrentMonth: false, isToday: false, status: null });
        }

        var cursor = som.clone();
        while (cursor.isSameOrBefore(eom, 'day')) {
            var rec = _.find(attendanceData, function(r) { return moment(r.date).isSame(cursor, 'day'); });
            days.push({
                date: cursor.date(),
                tooltip: cursor.format('ddd, MMM D'),
                isCurrentMonth: true,
                isToday: cursor.isSame(moment(), 'day'),
                status: rec ? rec.status : null
            });
            cursor.add(1, 'day');
        }

        // Pad to 42 cells
        for (var j = 1; days.length < 42; j++) {
            days.push({ date: j, isCurrentMonth: false, isToday: false, status: null });
        }
        vm.calendarDays = days;
    };

    vm.previousMonth      = function() { vm.currentMonth = vm.currentMonth.clone().subtract(1, 'month'); vm.generateCalendar(); };
    vm.nextMonth          = function() { vm.currentMonth = vm.currentMonth.clone().add(1, 'month');      vm.generateCalendar(); };
    vm.calendarMonthDisplay = function() { return vm.currentMonth.format('MMMM YYYY'); };
    vm.generateCalendar();

    // ── UNDERSCORE.JS + MOMENT.JS ── Recent activity
    vm.recentActivity = _.map(_.last(_.filter(attendanceData, function(r) { return r.checkIn; }), 5).reverse(), function(r) {
        return { text: 'Checked in ' + moment(r.checkIn).fromNow(), date: moment(r.date).format('MMM D, YYYY') };
    });

    // ── HIGHCHARTS ── Analytics charts
    vm.renderAttendanceChart = function() {
        var days = [];
        _.times(7, function(i) {
            var day = moment().subtract(6 - i, 'days');
            var rec = _.find(attendanceData, function(r) { return moment(r.date).isSame(day, 'day'); });
            days.push({
                label:  day.format('ddd'),
                hours:  (rec && rec.checkIn && rec.checkOut) ? parseFloat(moment(rec.checkOut).diff(moment(rec.checkIn), 'hours', true).toFixed(1)) : 0,
                status: rec ? rec.status : 'absent'
            });
        });

        Highcharts.chart('attendanceChart', {
            chart: { type: 'column', backgroundColor: '#fff', borderRadius: 8, style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: 'Work Hours – Last 7 Days', style: { fontSize: '14px', fontWeight: '600' } },
            xAxis: { categories: _.pluck(days, 'label') },
            yAxis: { min: 0, max: 10, title: { text: 'Hours' }, plotLines: [{ value: 8, color: '#E07A3F', dashStyle: 'dash', width: 1, label: { text: '8h target', style: { color: '#E07A3F', fontSize: '10px' } } }] },
            tooltip: { pointFormat: '{point.y} hours worked' },
            plotOptions: { column: { colorByPoint: true, borderRadius: 4, colors: _.map(days, function(d) { return d.status === 'present' ? '#E07A3F' : d.status === 'late' ? '#f59e0b' : '#e5e7eb'; }), dataLabels: { enabled: true, format: '{point.y}h', style: { fontSize: '10px' } } } },
            series: [{ name: 'Work Hours', data: _.pluck(days, 'hours'), showInLegend: false }],
            credits: { enabled: false }
        });

        // ── UNDERSCORE.JS ── _.countBy for donut data
        var grouped = _.countBy(attendanceData, 'status');
        Highcharts.chart('attendancePie', {
            chart: { type: 'pie', backgroundColor: '#fff', borderRadius: 8, style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: 'Attendance Breakdown', style: { fontSize: '14px', fontWeight: '600' } },
            plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.0f}%' } } },
            series: [{ name: 'Days', data: [
                { name: 'Present',  y: grouped.present  || 0, color: '#E07A3F' },
                { name: 'Late',     y: grouped.late     || 0, color: '#f59e0b' },
                { name: 'Absent',   y: grouped.absent   || 0, color: '#ef4444' },
                { name: 'On Leave', y: grouped['on-leave'] || 0, color: '#8b5cf6' }
            ]}],
            credits: { enabled: false }
        });
    };

    vm.toggleChart = function() {
        vm.showChart = !vm.showChart;
        if (vm.showChart) setTimeout(vm.renderAttendanceChart, 100);
    };

    // ── CHECK IN / OUT ──
    vm.checkIn = function() {
        var now    = moment();
        var cutoff = now.clone().startOf('day').add(10, 'hours').add(10, 'minutes');
        vm.todayStatus = {
            date: now.toDate(), checkIn: now.toDate(), checkOut: null,
            status: now.isAfter(cutoff) ? 'late' : 'present',
            workDuration: null, totalBreakTime: null, breaks: []
        };
        _saveAttendance();
        alert('Check-in successful! ' + (vm.todayStatus.status === 'late' ? '(Late arrival)' : '(On time)'));
    };

    vm.checkOut = function() {
        if (!confirm('Are you sure you want to check out?')) return;
        vm.todayStatus.checkOut = moment().toDate();
        var dur = moment.duration(moment(vm.todayStatus.checkOut).diff(moment(vm.todayStatus.checkIn)));
        vm.todayStatus.workDuration = fmtDuration(dur.asSeconds());
        _saveAttendance();
        alert('Check-out successful! You worked ' + vm.todayStatus.workDuration + ' today.');
    };

    // ── BREAK ──
    vm.startBreak = function() {
        vm.onBreak = mainCtrl.onBreak = true;
        vm.breakStartTime = new Date();
        if (vm.breakInterval) $interval.cancel(vm.breakInterval);
        vm.breakInterval = $interval(function() {
            var elapsed = moment().diff(moment(vm.breakStartTime), 'seconds');
            var d = moment.duration(elapsed, 'seconds');
            var t = (d.hours() < 10 ? '0' : '') + d.hours() + ':' + (d.minutes() < 10 ? '0' : '') + d.minutes() + ':' + (d.seconds() < 10 ? '0' : '') + d.seconds();
            vm.breakTimer = mainCtrl.breakTimer = t;
        }, 1000);
    };

    vm.endBreak = function() {
        if (vm.breakInterval) $interval.cancel(vm.breakInterval);
        var breakDur = moment().diff(moment(vm.breakStartTime), 'seconds');
        if (!vm.todayStatus.breaks) vm.todayStatus.breaks = [];
        vm.todayStatus.breaks.push({ start: vm.breakStartTime, end: new Date(), duration: breakDur });
        var totalSec = _.reduce(vm.todayStatus.breaks, function(s, b) { return s + b.duration; }, 0);
        vm.todayStatus.totalBreakTime = fmtDuration(totalSec);
        _saveAttendance();
        vm.onBreak = mainCtrl.onBreak = false;
        vm.breakTimer = mainCtrl.breakTimer = '00:00:00';
        vm.breakStartTime = null;
    };

    $scope.$on('endBreak', function() { vm.endBreak(); });

    function _saveAttendance() {
        var idx = _.findIndex(attendanceData, function(d) { return moment(d.date).isSame(moment(vm.todayStatus.date), 'day'); });
        if (idx > -1) attendanceData[idx] = vm.todayStatus; else attendanceData.push(vm.todayStatus);
        localStorage.setItem(attendanceKey, JSON.stringify(attendanceData));
    }

    // ── LEAVE ──
    vm.myLeaves = JSON.parse(localStorage.getItem('leaves_' + mainCtrl.currentUser.employeeId) || '[]');

    vm.openLeaveForm  = function() { vm.leaveForm = { type: '', fromDate: '', toDate: '', reason: '' }; vm.showLeaveForm = true; };
    vm.closeLeaveForm = function() { vm.showLeaveForm = false; };

    vm.submitLeave = function() {
        if (!vm.leaveForm.type || !vm.leaveForm.fromDate || !vm.leaveForm.toDate || !vm.leaveForm.reason) {
            alert('Please fill in all fields.'); return;
        }
        var from = moment(vm.leaveForm.fromDate), to = moment(vm.leaveForm.toDate);
        if (to.isBefore(from)) { alert('End date cannot be before start date.'); return; }

        var overlap = _.find(vm.myLeaves, function(l) {
            if (l.status === 'rejected') return false;
            return from.isSameOrBefore(moment(l.toDate)) && to.isSameOrAfter(moment(l.fromDate));
        });
        if (overlap) { alert('You already have a leave request covering those dates.'); return; }

        var leave = _.extend({}, vm.leaveForm, {
            id: 'LV' + Date.now(),
            employeeId:   mainCtrl.currentUser.employeeId,
            employeeName: mainCtrl.currentUser.name,
            department:   mainCtrl.currentUser.department,
            days:         to.diff(from, 'days') + 1,
            status:       'pending',
            appliedOn:    moment().format('YYYY-MM-DD HH:mm:ss')
        });

        vm.myLeaves.push(leave);
        localStorage.setItem('leaves_' + mainCtrl.currentUser.employeeId, JSON.stringify(vm.myLeaves));

        var allLeaves = JSON.parse(localStorage.getItem('allLeaveRequests') || '[]');
        allLeaves.push(leave);
        localStorage.setItem('allLeaveRequests', JSON.stringify(allLeaves));

        alert('Leave request submitted!');
        vm.showLeaveForm = false;
    };

    vm.leaveStatusClass = function(s) {
        return s === 'approved' ? 'badge present' : s === 'rejected' ? 'badge absent' : 'badge late';
    };
});

// ── ADMIN CONTROLLER ──────────────────────────────────────────

app.controller('AdminController', function($scope) {
    var vm = this;

    vm.searchQuery    = '';
    vm.filterDept     = '';
    vm.filterStatus   = '';
    vm.selectedEmp    = null;
    vm.showCharts     = false;
    vm.activeTab      = 'attendance';
    vm.leaveFilterStatus = '';
    vm.departments    = ['Engineering','Marketing','Sales','HR','Finance','Operations'];
    vm.showAddForm    = false;
    vm.newEmp         = {};

    var hotInstance = null;

    var users = JSON.parse(localStorage.getItem('djuboUsers') || '[]');

    // ── AUTO-ABSENT: seed for every employee from their join date ──
    _.each(_.filter(users, { role: 'employee' }), function(user) {
        var key     = 'attendance_' + user.employeeId;
        var records = JSON.parse(localStorage.getItem(key) || '[]');
        var joinDate = user.createdAt || user.joinDate;
        if (joinDate && seedAbsent(records, joinDate)) {
            localStorage.setItem(key, JSON.stringify(records));
        }
    });

    // ── UNDERSCORE.JS ── build employee list
    vm.employees = _.map(_.filter(users, { role: 'employee' }), function(user) {
        var key        = 'attendance_' + user.employeeId;
        var attendance = JSON.parse(localStorage.getItem(key) || '[]');
        var todayRec   = _.find(attendance, function(d) { return moment(d.date).isSame(moment(), 'day'); });

        var breakTime = '-';
        if (todayRec && todayRec.breaks && todayRec.breaks.length > 0) {
            var totalSec = _.reduce(todayRec.breaks, function(s, b) { return s + b.duration; }, 0);
            breakTime = fmtDuration(totalSec);
        }
        var presentCount = _.filter(attendance, function(d) { return d.status === 'present' || d.status === 'late'; }).length;

        return {
            id: user.employeeId, name: user.name, department: user.department, email: user.email,
            joined: user.createdAt ? moment(user.createdAt, 'YYYY-MM-DD HH:mm:ss').fromNow() : 'N/A',
            todayStatus:    todayRec ? todayRec.status : 'absent',
            checkInDisplay: todayRec && todayRec.checkIn  ? moment(todayRec.checkIn).format('HH:mm')  : '-',
            checkOutDisplay:todayRec && todayRec.checkOut ? moment(todayRec.checkOut).format('HH:mm') : '-',
            breakTime: breakTime, presentDays: presentCount,
            attendanceRate: attendance.length > 0 ? Math.round(presentCount / attendance.length * 100) : 0,
            attendanceHistory: attendance
        };
    });

    // ── UNDERSCORE.JS ── _.countBy for stat cards
    var statusCounts = _.countBy(vm.employees, 'todayStatus');
    vm.stats = {
        totalEmployees: vm.employees.length,
        presentToday:   statusCounts.present || 0,
        absentToday:    statusCounts.absent  || 0,
        lateToday:      statusCounts.late    || 0
    };

    vm.getFilteredEmployees = function() {
        var q = vm.searchQuery.toLowerCase();
        return _.filter(vm.employees, function(e) {
            return (!q || e.name.toLowerCase().indexOf(q) > -1 || e.department.toLowerCase().indexOf(q) > -1)
                && (!vm.filterDept   || e.department  === vm.filterDept)
                && (!vm.filterStatus || e.todayStatus === vm.filterStatus);
        });
    };

    vm.viewEmployee = function(emp) {
        vm.selectedEmp = emp;
        setTimeout(function() { _renderSparkline(emp); }, 150);
    };
    vm.closeModal = function() { vm.selectedEmp = null; };

    // ── ADD EMPLOYEE (admin creates accounts) ──
    vm.openAddForm  = function() { vm.newEmp = {}; vm.showAddForm = true; };
    vm.closeAddForm = function() { vm.showAddForm = false; };

    vm.addEmployee = function() {
        if (!vm.newEmp.name || !vm.newEmp.employeeId || !vm.newEmp.department || !vm.newEmp.email || !vm.newEmp.password) {
            alert('Please fill in all fields.'); return;
        }
        var allUsers = JSON.parse(localStorage.getItem('djuboUsers') || '[]');
        if (_.findWhere(allUsers, { employeeId: vm.newEmp.employeeId })) {
            alert('Employee ID already exists.'); return;
        }
        var newUser = _.extend({}, vm.newEmp, {
            role: 'employee',
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        });
        allUsers.push(newUser);
        localStorage.setItem('djuboUsers', JSON.stringify(allUsers));

        // Add to local list so grid updates immediately
        vm.employees.push({
            id: newUser.employeeId, name: newUser.name, department: newUser.department, email: newUser.email,
            joined: 'just now', todayStatus: 'absent',
            checkInDisplay: '-', checkOutDisplay: '-', breakTime: '-',
            presentDays: 0, attendanceRate: 0, attendanceHistory: []
        });

        vm.stats.totalEmployees++;
        vm.stats.absentToday++;

        if (hotInstance) hotInstance.loadData(_buildHOTData(vm.getFilteredEmployees()));

        alert('Employee ' + newUser.name + ' added. They can now log in with ID: ' + newUser.employeeId);
        vm.showAddForm = false;
    };

    // ── HIGHCHARTS ── Admin charts
    vm.renderAdminCharts = function() {
        var byDept    = _.groupBy(vm.employees, 'department');
        var deptNames = _.keys(byDept);
        var deptRates = _.map(deptNames, function(d) {
            return Math.round(_.reduce(byDept[d], function(s, e) { return s + e.attendanceRate; }, 0) / byDept[d].length);
        });

        Highcharts.chart('adminDeptChart', {
            chart: { type: 'bar', backgroundColor: '#fff', borderRadius: 8, style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: 'Avg Attendance Rate by Department', style: { fontSize: '14px', fontWeight: '600' } },
            xAxis: { categories: deptNames }, yAxis: { min: 0, max: 100, title: { text: 'Rate (%)' } },
            tooltip: { valueSuffix: '%' },
            plotOptions: { bar: { colorByPoint: true, colors: ['#E07A3F','#f59e0b','#10b981','#6366f1','#ef4444','#8b5cf6'], borderRadius: 3, dataLabels: { enabled: true, format: '{point.y}%' } } },
            series: [{ name: 'Rate', data: deptRates, showInLegend: false }],
            credits: { enabled: false }
        });

        Highcharts.chart('adminStatusPie', {
            chart: { type: 'pie', backgroundColor: '#fff', borderRadius: 8, style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: "Today's Status", style: { fontSize: '14px', fontWeight: '600' } },
            plotOptions: { pie: { innerSize: '50%', dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.y}' } } },
            series: [{ name: 'Employees', data: [
                { name: 'Present', y: vm.stats.presentToday, color: '#E07A3F' },
                { name: 'Late',    y: vm.stats.lateToday,    color: '#f59e0b' },
                { name: 'Absent',  y: vm.stats.absentToday,  color: '#ef4444' }
            ]}],
            credits: { enabled: false }
        });
    };

    vm.toggleCharts = function() {
        vm.showCharts = !vm.showCharts;
        if (vm.showCharts) setTimeout(vm.renderAdminCharts, 100);
    };

    function _renderSparkline(emp) {
        var labels = [], hours = [];
        _.times(7, function(i) {
            var day = moment().subtract(6 - i, 'days');
            labels.push(day.format('ddd'));
            var rec = _.find(emp.attendanceHistory, function(r) { return moment(r.date).isSame(day, 'day'); });
            hours.push(rec && rec.checkIn && rec.checkOut ? parseFloat(moment(rec.checkOut).diff(moment(rec.checkIn), 'hours', true).toFixed(1)) : 0);
        });
        Highcharts.chart('employeeSparkline', {
            chart: { type: 'area', backgroundColor: '#f9f9f9', borderRadius: 6, margin: [20,10,30,40], style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: 'Work Hours – Last 7 Days', style: { fontSize: '12px', color: '#666' } },
            xAxis: { categories: labels },
            yAxis: { min: 0, max: 10, title: { text: 'Hrs' }, plotLines: [{ value: 8, color: '#E07A3F', dashStyle: 'dash', width: 1 }] },
            series: [{ name: 'Hours', data: hours, color: '#E07A3F', fillOpacity: 0.15, marker: { enabled: true, radius: 3 } }],
            credits: { enabled: false }, legend: { enabled: false }
        });
    }

    // ── HANDSONTABLE ──
    function _buildHOTData(employees) {
        return _.map(employees, function(e) {
            return [e.id, e.name, e.department,
                e.todayStatus.charAt(0).toUpperCase() + e.todayStatus.slice(1),
                e.checkInDisplay, e.checkOutDisplay, e.breakTime, e.attendanceRate + '%'];
        });
    }

    vm.initHandsontable = function() {
        var container = document.getElementById('employeeHOT');
        if (!container) return;

        hotInstance = new Handsontable(container, {
            data: _buildHOTData(vm.employees),
            colHeaders: ['ID','Name','Department','Status','Check In','Check Out','Break','Rate'],
            columns: [
                { readOnly: true }, { readOnly: true },
                { type: 'dropdown', source: vm.departments },
                { type: 'dropdown', source: ['Present','Absent','Late','On-leave'] },
                { readOnly: true }, { readOnly: true }, { readOnly: true }, { readOnly: true }
            ],
            columnSorting: true, filters: true,
            dropdownMenu: ['filter_by_condition','filter_by_value','filter_action_bar'],
            fixedColumnsLeft: 2, stretchH: 'all', rowHeaders: true, height: 320,
            licenseKey: 'non-commercial-and-evaluation',
            cells: function(row, col) {
                if (col !== 3) return {};
                return { renderer: function(hot, td, r, c, p, value) {
                    Handsontable.renderers.TextRenderer.apply(this, arguments);
                    td.style.fontWeight = '600'; td.style.textAlign = 'center';
                    var map = { Present: ['#d1fae5','#065f46'], Late: ['#fef3c7','#92400e'], Absent: ['#fee2e2','#991b1b'], 'On-leave': ['#ede9fe','#5b21b6'] };
                    var c2 = map[value] || null;
                    if (c2) { td.style.background = c2[0]; td.style.color = c2[1]; }
                }};
            },
            afterChange: function(changes, source) {
                if (source === 'loadData' || !changes) return;
                changes.forEach(function(ch) {
                    var empId = hotInstance.getDataAtCell(ch[0], 0);
                    var emp   = _.find(vm.employees, { id: empId });
                    if (!emp) return;
                    if (ch[1] === 2) {
                        emp.department = ch[3];
                        var allUsers = JSON.parse(localStorage.getItem('djuboUsers') || '[]');
                        var u = _.find(allUsers, { employeeId: empId });
                        if (u) { u.department = ch[3]; localStorage.setItem('djuboUsers', JSON.stringify(allUsers)); }
                    }
                    if (ch[1] === 3) emp.todayStatus = ch[3].toLowerCase();
                });
            }
        });
    };

    vm.updateHOTFilter = function() {
        if (hotInstance) hotInstance.loadData(_buildHOTData(vm.getFilteredEmployees()));
    };

    $scope.$watch(function() { return vm.searchQuery + vm.filterDept + vm.filterStatus; }, function(n, o) {
        if (n !== o) vm.updateHOTFilter();
    });

    // ── LEAVE MANAGEMENT ──
    vm.allLeaves = _.sortBy(
        JSON.parse(localStorage.getItem('allLeaveRequests') || '[]'),
        function(l) { return -moment(l.appliedOn, 'YYYY-MM-DD HH:mm:ss').valueOf(); }
    );
    vm.pendingLeavesCount = _.filter(vm.allLeaves, { status: 'pending' }).length;

    vm.getFilteredLeaves = function() {
        return _.filter(vm.allLeaves, function(l) { return !vm.leaveFilterStatus || l.status === vm.leaveFilterStatus; });
    };

    vm.approveLeave = function(leave) {
        leave.status = 'approved';
        leave.decidedOn = moment().format('YYYY-MM-DD HH:mm:ss');
        _syncLeave(leave);

        // Mark days on-leave in attendance
        var key     = 'attendance_' + leave.employeeId;
        var records = JSON.parse(localStorage.getItem(key) || '[]');
        var cursor  = moment(leave.fromDate).clone();
        var end     = moment(leave.toDate);
        while (cursor.isSameOrBefore(end, 'day')) {
            if (cursor.day() !== 0 && cursor.day() !== 6) {
                var idx = _.findIndex(records, function(r) { return moment(r.date).isSame(cursor, 'day'); });
                var rec = { date: cursor.toDate(), checkIn: null, checkOut: null, status: 'on-leave', leaveId: leave.id, workDuration: null, totalBreakTime: null, breaks: [] };
                if (idx > -1) records[idx] = rec; else records.push(rec);
            }
            cursor.add(1, 'day');
        }
        records.sort(function(a, b) { return moment(a.date) - moment(b.date); });
        localStorage.setItem(key, JSON.stringify(records));
        vm.pendingLeavesCount = _.filter(vm.allLeaves, { status: 'pending' }).length;
    };

    vm.rejectLeave = function(leave) {
        leave.status = 'rejected';
        leave.decidedOn = moment().format('YYYY-MM-DD HH:mm:ss');
        _syncLeave(leave);
        vm.pendingLeavesCount = _.filter(vm.allLeaves, { status: 'pending' }).length;
    };

    function _syncLeave(leave) {
        var all  = JSON.parse(localStorage.getItem('allLeaveRequests') || '[]');
        var idx  = _.findIndex(all, { id: leave.id }); if (idx > -1) all[idx] = leave;
        localStorage.setItem('allLeaveRequests', JSON.stringify(all));
        var emp  = JSON.parse(localStorage.getItem('leaves_' + leave.employeeId) || '[]');
        var eidx = _.findIndex(emp, { id: leave.id }); if (eidx > -1) emp[eidx] = leave;
        localStorage.setItem('leaves_' + leave.employeeId, JSON.stringify(emp));
    }

    vm.leaveStatusClass = function(s) {
        if (s === 'approved') return 'badge present';
        if (s === 'rejected') return 'badge absent';
        if (s === 'on-leave') return 'badge on-leave';
        return 'badge late';
    };

    vm.exportReport = function() {
        var csv = 'Employee ID,Name,Department,Status,Check In,Check Out,Break,Rate\n';
        _.each(vm.employees, function(e) {
            csv += [e.id, e.name, e.department, e.todayStatus, e.checkInDisplay, e.checkOutDisplay, e.breakTime, e.attendanceRate + '%'].join(',') + '\n';
        });
        var a  = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        // ── MOMENT.JS ── Dated filename
        a.download = 'attendance_' + moment().format('YYYY-MM-DD') + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        alert('Report exported!');
    };
});