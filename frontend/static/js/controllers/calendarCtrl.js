app.controller('AdminController', function($scope, $timeout, AttendanceService) {
    var vm = this;

    vm.searchQuery       = '';
    vm.filterDept        = '';
    vm.filterStatus      = '';
    vm.selectedEmp       = null;
    vm.showCharts        = false;
    vm.activeTab         = 'attendance';
    vm.leaveFilterStatus = '';
    vm.departments       = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
    vm.showAddForm       = false;
    vm.newEmp            = {};

    var hotInstance = null;
    var users = AttendanceService.getUsers();

// AUTO-ABSENT: seed for every employee  
    _.each(_.filter(users, { role: 'employee' }), function(user) {
        var records  = AttendanceService.getAttendance(user.employeeId);
        var joinDate = user.createdAt || user.joinDate;
        if (joinDate && seedAbsent(records, joinDate)) {
            AttendanceService.saveAttendance(user.employeeId, records);
        }
    });

// Build employee list  
    vm.employees = _.map(_.filter(users, { role: 'employee' }), function(user) {
        var attendance = AttendanceService.getAttendance(user.employeeId);
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
            todayStatus:     todayRec ? todayRec.status : 'absent',
            checkInDisplay:  todayRec && todayRec.checkIn  ? moment(todayRec.checkIn).format('HH:mm')  : '-',
            checkOutDisplay: todayRec && todayRec.checkOut ? moment(todayRec.checkOut).format('HH:mm') : '-',
            breakTime: breakTime, presentDays: presentCount,
            attendanceRate: attendance.length > 0 ? Math.round(presentCount / attendance.length * 100) : 0,
            attendanceHistory: attendance
        };
    });

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
        $timeout(function() { _renderSparkline(emp); }, 150);
    };
    vm.closeModal = function() { vm.selectedEmp = null; };

    // ADD EMPLOYEE  
    vm.openAddForm  = function() { vm.newEmp = {}; vm.showAddForm = true; };
    vm.closeAddForm = function() { vm.showAddForm = false; };

    vm.addEmployee = function() {
        if (!vm.newEmp.name || !vm.newEmp.employeeId || !vm.newEmp.department || !vm.newEmp.email || !vm.newEmp.password) {
            alert('Please fill in all fields.'); return;
        }
        var allUsers = AttendanceService.getUsers();
        if (_.findWhere(allUsers, { employeeId: vm.newEmp.employeeId })) {
            alert('Employee ID already exists.'); return;
        }
        var newUser = _.extend({}, vm.newEmp, {
            role: 'employee',
            createdAt: moment().format('YYYY-MM-DD HH:mm:ss')
        });
        allUsers.push(newUser);
        AttendanceService.saveUsers(allUsers);

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

    //  HIGHCHARTS   Admin charts
    vm.renderAdminCharts = function() {
        if (typeof Highcharts === 'undefined') {
            console.warn('Highcharts not loaded yet — retrying in 500ms');
            setTimeout(vm.renderAdminCharts, 500);
            return;
        }
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
            plotOptions: { bar: { colorByPoint: true, colors: ['#E07A3F', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#8b5cf6'], borderRadius: 3, dataLabels: { enabled: true, format: '{point.y}%' } } },
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
        if (vm.showCharts) $timeout(vm.renderAdminCharts, 150);
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
            chart: { type: 'area', backgroundColor: '#f9f9f9', borderRadius: 6, margin: [20, 10, 30, 40], style: { fontFamily: 'Inter, sans-serif' } },
            title: { text: 'Work Hours – Last 7 Days', style: { fontSize: '12px', color: '#666' } },
            xAxis: { categories: labels },
            yAxis: { min: 0, max: 10, title: { text: 'Hrs' }, plotLines: [{ value: 8, color: '#E07A3F', dashStyle: 'dash', width: 1 }] },
            series: [{ name: 'Hours', data: hours, color: '#E07A3F', fillOpacity: 0.15, marker: { enabled: true, radius: 3 } }],
            credits: { enabled: false }, legend: { enabled: false }
        });
    }

    //   HANDSONTABLE  
    function _buildHOTData(employees) {
        return _.map(employees, function(e) {
            return [e.id, e.name, e.department,
                e.todayStatus.charAt(0).toUpperCase() + e.todayStatus.slice(1),
                e.checkInDisplay, e.checkOutDisplay, e.breakTime, e.attendanceRate + '%'];
        });
    }

    vm.initHandsontable = function() {
        // Use $timeout to ensure the DOM element exists after ng-view renders
        $timeout(function() {
            var container = document.getElementById('employeeHOT');
            if (!container) return;
            if (hotInstance) { hotInstance.destroy(); hotInstance = null; }

            hotInstance = new Handsontable(container, {
                data: _buildHOTData(vm.employees),
                colHeaders: ['ID', 'Name', 'Department', 'Status', 'Check In', 'Check Out', 'Break', 'Rate'],
                columns: [
                    { readOnly: true }, { readOnly: true },
                    { type: 'dropdown', source: vm.departments },
                    { type: 'dropdown', source: ['Present', 'Absent', 'Late', 'On-leave'] },
                    { readOnly: true }, { readOnly: true }, { readOnly: true }, { readOnly: true }
                ],
                columnSorting: true, filters: true,
                dropdownMenu: ['filter_by_condition', 'filter_by_value', 'filter_action_bar'],
                fixedColumnsLeft: 2, stretchH: 'all', rowHeaders: true, height: 320,
                licenseKey: 'non-commercial-and-evaluation',
                cells: function(row, col) {
                    if (col !== 3) return {};
                    return {
                        renderer: function(hot, td, r, c, p, value) {
                            Handsontable.renderers.TextRenderer.apply(this, arguments);
                            td.style.fontWeight = '600'; td.style.textAlign = 'center';
                            var map = { Present: ['#d1fae5', '#065f46'], Late: ['#fef3c7', '#92400e'], Absent: ['#fee2e2', '#991b1b'], 'On-leave': ['#ede9fe', '#5b21b6'] };
                            var c2 = map[value] || null;
                            if (c2) { td.style.background = c2[0]; td.style.color = c2[1]; }
                        }
                    };
                },
                afterChange: function(changes, source) {
                    if (source === 'loadData' || !changes) return;
                    changes.forEach(function(ch) {
                        var empId = hotInstance.getDataAtCell(ch[0], 0);
                        var emp   = _.find(vm.employees, { id: empId });
                        if (!emp) return;
                        if (ch[1] === 2) {
                            emp.department = ch[3];
                            var allUsers = AttendanceService.getUsers();
                            var u = _.find(allUsers, { employeeId: empId });
                            if (u) { u.department = ch[3]; AttendanceService.saveUsers(allUsers); }
                        }
                        if (ch[1] === 3) emp.todayStatus = ch[3].toLowerCase();
                    });
                }
            });
        }, 0);
    };

    // Auto-init Handsontable when the attendance tab is active on load
    $timeout(function() { vm.initHandsontable(); }, 100);

    vm.updateHOTFilter = function() {
        if (hotInstance) hotInstance.loadData(_buildHOTData(vm.getFilteredEmployees()));
    };

    $scope.$watch(function() { return vm.searchQuery + vm.filterDept + vm.filterStatus; }, function(n, o) {
        if (n !== o) vm.updateHOTFilter();
    });

    //  LEAVE MANAGEMENT
    vm.allLeaves = _.sortBy(
        AttendanceService.getAllLeaves(),
        function(l) { return -moment(l.appliedOn, 'YYYY-MM-DD HH:mm:ss').valueOf(); }
    );
    vm.pendingLeavesCount = _.filter(vm.allLeaves, { status: 'pending' }).length;

    vm.getFilteredLeaves = function() {
        return _.filter(vm.allLeaves, function(l) { return !vm.leaveFilterStatus || l.status === vm.leaveFilterStatus; });
    };

    vm.approveLeave = function(leave) {
        leave.status    = 'approved';
        leave.decidedOn = moment().format('YYYY-MM-DD HH:mm:ss');
        _syncLeave(leave);

        var records = AttendanceService.getAttendance(leave.employeeId);
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
        AttendanceService.saveAttendance(leave.employeeId, records);
        vm.pendingLeavesCount = _.filter(vm.allLeaves, { status: 'pending' }).length;
    };

    vm.rejectLeave = function(leave) {
        leave.status    = 'rejected';
        leave.decidedOn = moment().format('YYYY-MM-DD HH:mm:ss');
        _syncLeave(leave);
        vm.pendingLeavesCount = _.filter(vm.allLeaves, { status: 'pending' }).length;
    };

    function _syncLeave(leave) {
        var all  = AttendanceService.getAllLeaves();
        var idx  = _.findIndex(all, { id: leave.id }); if (idx > -1) all[idx] = leave;
        AttendanceService.saveAllLeaves(all);
        var emp  = AttendanceService.getLeaves(leave.employeeId);
        var eidx = _.findIndex(emp, { id: leave.id }); if (eidx > -1) emp[eidx] = leave;
        AttendanceService.saveLeaves(leave.employeeId, emp);
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
        a.download = 'attendance_' + moment().format('YYYY-MM-DD') + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        alert('Report exported!');
    };
});