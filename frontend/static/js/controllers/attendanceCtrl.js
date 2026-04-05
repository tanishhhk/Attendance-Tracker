app.controller('EmployeeController', function($scope, $interval, $window, $timeout, $http, AttendanceService) {
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
    vm.todayStatus    = { checkIn: null, checkOut: null, workDuration: null, totalBreakTime: null, breaks: [] };
    vm.myLeaves       = [];
    vm.attendanceData = [];
    vm.stats          = { presentDays: 0, absentDays: 0, lateDays: 0, attendanceRate: 0 };
    vm.activeBreakId  = null;

    $interval(function() { vm.currentTime = new Date(); }, 1000);

    // ── LOAD TODAY ──────────────────────────────────────────
    function loadToday() {
        AttendanceService.getToday().then(function(res) {
            var d = res.data;
            vm.todayStatus = {
                checkIn:        d.check_in,
                checkOut:       d.check_out,
                status:         d.status,
                workDuration:   d.work_duration,
                totalBreakTime: d.total_break_time,
                breaks:         []
            };
            vm.onBreak       = d.break_active;
            vm.activeBreakId = d.active_break_id;
            mainCtrl.onBreak = d.break_active;
        });
    }

    // ── LOAD STATS ──────────────────────────────────────────
    function loadStats() {
        AttendanceService.getStats().then(function(res) {
            var d = res.data;
            vm.stats = {
                presentDays:    d.present + d.late,
                absentDays:     d.absent,
                lateDays:       d.late,
                attendanceRate: d.total_days > 0 ? Math.round((d.present + d.late) / d.total_days * 100) : 0
            };
        });
    }

    // ── LOAD ALL ATTENDANCE (for calendar + charts) ─────────
    function loadAttendance() {
        AttendanceService.getAttendance().then(function(res) {
            vm.attendanceData = _.map(res.data, function(r) {
                return {
                    date:      r.date,
                    checkIn:   r.check_in,
                    checkOut:  r.check_out,
                    status:    r.status,
                    workDuration: r.work_duration
                };
            });
            vm.generateCalendar();
            vm.recentActivity = _.map(
                _.last(_.filter(vm.attendanceData, function(r) { return r.checkIn; }), 5).reverse(),
                function(r) {
                    return {
                        text: 'Checked in ' + moment(r.checkIn).fromNow(),
                        date: moment(r.date).format('MMM D, YYYY')
                    };
                }
            );
        });
    }

    // ── LOAD LEAVES ─────────────────────────────────────────
    function loadLeaves() {
        AttendanceService.getMyLeaves().then(function(res) {
            vm.myLeaves = _.map(res.data, function(l) {
                return {
                    id:        l.id,
                    type:      l.leave_type,
                    fromDate:  l.from_date,
                    toDate:    l.to_date,
                    reason:    l.reason,
                    status:    l.status,
                    appliedOn: l.applied_on
                };
            });
        });
    }

    // Init — load everything
    loadToday();
    loadStats();
    loadAttendance();
    loadLeaves();

    // ── CHECK IN ────────────────────────────────────────────
    vm.checkIn = function() {
        AttendanceService.checkIn().then(function(res) {
            alert('Check-in successful! Status: ' + res.data.status);
            loadToday();
            loadStats();
            loadAttendance();
        }, function(err) {
            alert(err.data.error || 'Check-in failed');
        });
    };

    // ── CHECK OUT ───────────────────────────────────────────
    vm.checkOut = function() {
        if (!confirm('Are you sure you want to check out?')) return;
        AttendanceService.checkOut().then(function(res) {
            alert('Checked out! You worked ' + res.data.work_duration);
            loadToday();
            loadStats();
            loadAttendance();
        }, function(err) {
            alert(err.data.error || 'Check-out failed');
        });
    };

    // ── START BREAK ─────────────────────────────────────────
    vm.startBreak = function() {
        AttendanceService.startBreak().then(function(res) {
            vm.activeBreakId  = res.data.break_id;
            vm.onBreak        = true;
            mainCtrl.onBreak  = true;
            vm.breakStartTime = new Date();

            if (vm.breakInterval) $interval.cancel(vm.breakInterval);
            vm.breakInterval = $interval(function() {
                var elapsed = moment().diff(moment(vm.breakStartTime), 'seconds');
                var d = moment.duration(elapsed, 'seconds');
                var t = (d.hours()   < 10 ? '0' : '') + d.hours()   + ':' +
                        (d.minutes() < 10 ? '0' : '') + d.minutes() + ':' +
                        (d.seconds() < 10 ? '0' : '') + d.seconds();
                vm.breakTimer = mainCtrl.breakTimer = t;
            }, 1000);
        }, function(err) {
            alert(err.data.error || 'Could not start break');
        });
    };

    // ── END BREAK ───────────────────────────────────────────
    vm.endBreak = function() {
        if (!vm.activeBreakId) return;
        if (vm.breakInterval) $interval.cancel(vm.breakInterval);

        AttendanceService.endBreak(vm.activeBreakId).then(function(res) {
            vm.onBreak        = false;
            mainCtrl.onBreak  = false;
            vm.breakTimer     = mainCtrl.breakTimer = '00:00:00';
            vm.breakStartTime = null;
            vm.activeBreakId  = null;
            loadToday();
        }, function(err) {
            alert(err.data.error || 'Could not end break');
        });
    };

    $scope.$on('endBreak', function() { vm.endBreak(); });

    // ── LEAVE ───────────────────────────────────────────────
    vm.openLeaveForm  = function() { vm.leaveForm = { type: '', fromDate: '', toDate: '', reason: '' }; vm.showLeaveForm = true; };
    vm.closeLeaveForm = function() { vm.showLeaveForm = false; };

    vm.submitLeave = function() {
        if (!vm.leaveForm.type || !vm.leaveForm.fromDate || !vm.leaveForm.toDate || !vm.leaveForm.reason) {
            alert('Please fill in all fields.'); return;
        }
        var from = moment(vm.leaveForm.fromDate), to = moment(vm.leaveForm.toDate);
        if (to.isBefore(from)) { alert('End date cannot be before start date.'); return; }

        AttendanceService.applyLeave({
            leave_type: vm.leaveForm.type,
            from_date:  vm.leaveForm.fromDate,
            to_date:    vm.leaveForm.toDate,
            reason:     vm.leaveForm.reason
        }).then(function() {
            alert('Leave request submitted!');
            vm.showLeaveForm = false;
            loadLeaves();
        }, function(err) {
            alert(err.data.error || 'Could not submit leave');
        });
    };

    vm.leaveStatusClass = function(s) {
        return s === 'approved' ? 'badge present' : s === 'rejected' ? 'badge absent' : 'badge late';
    };

    vm.checkInFromNow = function() {
        return vm.todayStatus.checkIn ? moment(vm.todayStatus.checkIn).fromNow() : '';
    };

    // ── CALENDAR ────────────────────────────────────────────
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
            var rec = _.find(vm.attendanceData, function(r) { return moment(r.date).isSame(cursor, 'day'); });
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

    // ── CHARTS ──────────────────────────────────────────────
    vm.renderAttendanceChart = function() {
        if (typeof Highcharts === 'undefined') {
            setTimeout(vm.renderAttendanceChart, 500); return;
        }
        var days = [];
        _.times(7, function(i) {
            var day = moment().subtract(6 - i, 'days');
            var rec = _.find(vm.attendanceData, function(r) { return moment(r.date).isSame(day, 'day'); });
            days.push({
                label:  day.format('ddd'),
                hours:  (rec && rec.checkIn && rec.checkOut) ? parseFloat(moment(rec.checkOut).diff(moment(rec.checkIn), 'hours', true).toFixed(1)) : 0,
                status: rec ? rec.status : 'absent'
            });
        });

        Highcharts.chart('attendanceChart', {
            chart: { type: 'column', backgroundColor: '#fff', borderRadius: 8 },
            title: { text: 'Work Hours – Last 7 Days' },
            xAxis: { categories: _.pluck(days, 'label') },
            yAxis: { min: 0, max: 10, title: { text: 'Hours' } },
            tooltip: { pointFormat: '{point.y} hours worked' },
            plotOptions: { column: { colorByPoint: true, borderRadius: 4,
                colors: _.map(days, function(d) { return d.status === 'present' ? '#E07A3F' : d.status === 'late' ? '#f59e0b' : '#e5e7eb'; }),
                dataLabels: { enabled: true, format: '{point.y}h' }
            }},
            series: [{ name: 'Work Hours', data: _.pluck(days, 'hours'), showInLegend: false }],
            credits: { enabled: false }
        });

        var grouped = _.countBy(vm.attendanceData, 'status');
        Highcharts.chart('attendancePie', {
            chart: { type: 'pie', backgroundColor: '#fff', borderRadius: 8 },
            title: { text: 'Attendance Breakdown' },
            plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.0f}%' } } },
            series: [{ name: 'Days', data: [
                { name: 'Present',  y: grouped.present    || 0, color: '#E07A3F' },
                { name: 'Late',     y: grouped.late       || 0, color: '#f59e0b' },
                { name: 'Absent',   y: grouped.absent     || 0, color: '#ef4444' }
            ]}],
            credits: { enabled: false }
        });
    };

    vm.toggleChart = function() {
        vm.showChart = !vm.showChart;
        if (vm.showChart) $timeout(vm.renderAttendanceChart, 150);
    };
});