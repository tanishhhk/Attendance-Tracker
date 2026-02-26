app.controller('EmployeeController', function($scope, $interval, $window, $timeout, AttendanceService) {
    var vm       = this;
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

    var attendanceData = AttendanceService.getAttendance(mainCtrl.currentUser.employeeId);

    // AUTO-ABSENT: seed from employee's join date
    var joinDate = mainCtrl.currentUser.createdAt || mainCtrl.currentUser.joinDate;
    if (joinDate && seedAbsent(attendanceData, joinDate)) {
        AttendanceService.saveAttendance(mainCtrl.currentUser.employeeId, attendanceData);
    }

    //UNDERSCORE.JS tally stats
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

    if (vm.todayStatus.breaks && vm.todayStatus.breaks.length > 0) {
        var totalSec = _.reduce(vm.todayStatus.breaks, function(sum, b) {
            return sum + (b.duration || moment(b.end).diff(moment(b.start), 'seconds'));
        }, 0);
        vm.todayStatus.totalBreakTime = fmtDuration(totalSec);
    }

    vm.checkInFromNow = function() {
        return vm.todayStatus.checkIn ? moment(vm.todayStatus.checkIn).fromNow() : '';
    };

    // Calendar
    vm.weekDays     = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    vm.currentMonth = moment();
    vm.calendarDays = [];

    vm.generateCalendar = function() {
        var som  = vm.currentMonth.clone().startOf('month');
        var eom  = vm.currentMonth.clone().endOf('month');
        var days = [];

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

        for (var j = 1; days.length < 42; j++) {
            days.push({ date: j, isCurrentMonth: false, isToday: false, status: null });
        }
        vm.calendarDays = days;
    };

    vm.previousMonth        = function() { vm.currentMonth = vm.currentMonth.clone().subtract(1, 'month'); vm.generateCalendar(); };
    vm.nextMonth            = function() { vm.currentMonth = vm.currentMonth.clone().add(1, 'month');      vm.generateCalendar(); };
    vm.calendarMonthDisplay = function() { return vm.currentMonth.format('MMMM YYYY'); };
    vm.generateCalendar();

    // Recent activity
    vm.recentActivity = _.map(_.last(_.filter(attendanceData, function(r) { return r.checkIn; }), 5).reverse(), function(r) {
        return { text: 'Checked in ' + moment(r.checkIn).fromNow(), date: moment(r.date).format('MMM D, YYYY') };
    });

    //HIGHCHARTS Analytics charts
    vm.renderAttendanceChart = function() {
        if (typeof Highcharts === 'undefined') {
            console.warn('Highcharts not loaded yet — retrying in 500ms');
            setTimeout(vm.renderAttendanceChart, 500);
            return;
        }
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

        var grouped = _.countBy(attendanceData, 'status');
        Highcharts.chart('attendancePie', {
            chart: { type: 'pie', backgroundColor: '#fff', borderRadius: 8, style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: 'Attendance Breakdown', style: { fontSize: '14px', fontWeight: '600' } },
            plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.0f}%' } } },
            series: [{ name: 'Days', data: [
                { name: 'Present',  y: grouped.present    || 0, color: '#E07A3F' },
                { name: 'Late',     y: grouped.late       || 0, color: '#f59e0b' },
                { name: 'Absent',   y: grouped.absent     || 0, color: '#ef4444' },
                { name: 'On Leave', y: grouped['on-leave'] || 0, color: '#8b5cf6' }
            ]}],
            credits: { enabled: false }
        });
    };

    vm.toggleChart = function() {
        vm.showChart = !vm.showChart;
        if (vm.showChart) $timeout(vm.renderAttendanceChart, 150);
    };

    //CHECK IN / OUT
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

    //BREAk
    vm.startBreak = function() {
        vm.onBreak = mainCtrl.onBreak = true;
        vm.breakStartTime = new Date();
        if (vm.breakInterval) $interval.cancel(vm.breakInterval);
        vm.breakInterval = $interval(function() {
            var elapsed = moment().diff(moment(vm.breakStartTime), 'seconds');
            var d = moment.duration(elapsed, 'seconds');
            var t = (d.hours() < 10 ? '0' : '') + d.hours() + ':' +
                    (d.minutes() < 10 ? '0' : '') + d.minutes() + ':' +
                    (d.seconds() < 10 ? '0' : '') + d.seconds();
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
        AttendanceService.saveAttendance(mainCtrl.currentUser.employeeId, attendanceData);
    }

    // ── LEAVE ──
    vm.myLeaves = AttendanceService.getLeaves(mainCtrl.currentUser.employeeId);

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
        AttendanceService.saveLeaves(mainCtrl.currentUser.employeeId, vm.myLeaves);

        var allLeaves = AttendanceService.getAllLeaves();
        allLeaves.push(leave);
        AttendanceService.saveAllLeaves(allLeaves);

        alert('Leave request submitted!');
        vm.showLeaveForm = false;
    };

    vm.leaveStatusClass = function(s) {
        return s === 'approved' ? 'badge present' : s === 'rejected' ? 'badge absent' : 'badge late';
    };
});