app.controller('AdminController', function($timeout, AttendanceService, apiError) {
    var vm = this;

    vm.stats             = { totalEmployees: '-', presentToday: '-', absentToday: '-', lateToday: '-' };
    vm.leaveRequests     = [];
    vm.activeTab         = 'attendance';
    vm.leaveFilterStatus = '';
    vm.departments       = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
    vm.currentUser       = JSON.parse(localStorage.getItem('currentUser') || '{}');
    vm.employees         = [];
    // Was left undefined until the all_today request came back, so a failed or
    // slow request meant settings.html read .length off undefined.
    vm.attendanceList    = [];
    vm.pendingLeavesCount = 0;
    vm.newEmp            = {};
    vm.showCharts        = false;
    vm.searchQuery       = '';
    vm.filterDept        = '';
    vm.filterStatus      = '';
    vm.loadError         = '';


function loadAdminStats() {
    AttendanceService.getAllToday().then(function(res) {
        var s = res.data.stats;
        vm.stats = {
            totalEmployees: s.total,
            presentToday:   s.present + s.late,
            absentToday:    s.absent,
            lateToday:      s.late
        };
        vm.attendanceList = res.data.employees;
    }, function(err) {
        vm.loadError = apiError(err, 'Could not load today\'s attendance.');
    });
}
loadAdminStats();

//EMPLOYEES
    function loadEmployees() {
        AttendanceService.getEmployees().then(function(res) {
            vm.employees = res.data;
            // totalEmployees is owned by loadAdminStats(); setting it here too
            // made the displayed value depend on which request landed last.
        }, function(err) {
            vm.loadError = apiError(err, 'Could not load employees.');
        });
    }
    loadEmployees();

    vm.addEmployee = function() {
        if (!vm.newEmp.name || !vm.newEmp.employeeId || !vm.newEmp.password) {
            alert('Name, Employee ID and Password required.'); return;
        }
        AttendanceService.createEmployee({
            username:   vm.newEmp.employeeId,
            password:   vm.newEmp.password,
            email:      vm.newEmp.email || '',
            first_name: vm.newEmp.name,
            department: vm.newEmp.department
        }).then(function() {
            alert('Employee created!');
            loadEmployees();
            loadAdminStats();
            vm.newEmp = {};
        }, function(err) {
            alert(apiError(err, 'Could not create employee'));
        });
    };

    vm.deleteEmployee = function(id) {
    if (!confirm('Delete this employee? This cannot be undone.')) return;
    AttendanceService.deleteEmployee(id).then(function() {
        loadEmployees();
        loadAdminStats();
    }, function(err) {
        alert(apiError(err, 'Could not delete employee'));
    });
};

//LEAVE REQUESTS
    function loadLeaves() {
        // getAllLeaves(), not getMyLeaves(): this is the admin review queue.
        // Pointing it at my_leaves/ meant an admin only ever saw their OWN
        // requests, so the approve/reject buttons could never reach an employee.
        // employeeName/department now come from the serializer instead of being
        // stamped with the logged-in admin's own name.
        AttendanceService.getAllLeaves().then(function(res) {
            vm.leaveRequests = _.map(res.data, function(l) {
                return {
                    id:           l.id,
                    employeeName: l.employee_name,
                    department:   l.department,
                    type:         l.leave_type,
                    fromDate:     l.from_date,
                    toDate:       l.to_date,
                    reason:       l.reason,
                    status:       l.status,
                    appliedOn:    l.applied_on,
                    days:         moment(l.to_date).diff(moment(l.from_date), 'days') + 1
                };
            });
            vm.pendingLeavesCount = _.filter(vm.leaveRequests, { status: 'pending' }).length;
        }, function(err) {
            vm.loadError = apiError(err, 'Could not load leave requests.');
        });
    }
    loadLeaves();

    vm.getFilteredLeaves = function() {
        return _.filter(vm.leaveRequests, function(l) {
            return !vm.leaveFilterStatus || l.status === vm.leaveFilterStatus;
        });
    };

    // Both used to have no error callback, so a rejected decision (403, or an
    // already-decided leave) left the card looking unchanged with no feedback.
    function decide(leave, decision) {
        AttendanceService.decideLeave(leave.id, decision).then(function() {
            leave.status    = decision;
            leave.decidedOn = new Date();
            vm.pendingLeavesCount = _.filter(vm.leaveRequests, { status: 'pending' }).length;
        }, function(err) {
            alert(apiError(err, 'Could not update this leave request.'));
            loadLeaves();
        });
    }

    vm.approveLeave = function(leave) { decide(leave, 'approved'); };
    vm.rejectLeave  = function(leave) { decide(leave, 'rejected'); };

    vm.leaveStatusClass = function(s) {
        return s === 'approved' ? 'badge present' : s === 'rejected' ? 'badge absent' : 'badge late';
    };

    vm.renderCharts = function() {
    if (typeof Highcharts === 'undefined') {
        setTimeout(vm.renderCharts, 500); return;
    }

    // Department-wise employee count
    var deptCount = _.countBy(vm.attendanceList, 'department');
    var deptData  = _.map(deptCount, function(count, dept) {
        return { name: dept || 'Unknown', y: count };
    });

    Highcharts.chart('adminDeptChart', {
        chart:  { type: 'column', backgroundColor: '#fff', borderRadius: 8,
                  style: { fontFamily: 'Inter, sans-serif' } },
        title:  { text: 'Employees by Department', style: { fontSize: '14px' } },
        xAxis:  { categories: _.pluck(deptData, 'name') },
        yAxis:  { min: 0, title: { text: 'Employees' }, allowDecimals: false },
        tooltip: { pointFormat: '<b>{point.y}</b> employees' },
        plotOptions: { column: { borderRadius: 4, colorByPoint: true } },
        series: [{ name: 'Employees', data: _.pluck(deptData, 'y'), showInLegend: false }],
        credits: { enabled: false }
    });

    // Attendance status pie
    var statusCount = _.countBy(vm.attendanceList, 'status');
    Highcharts.chart('adminStatusPie', {
        chart:  { type: 'pie', backgroundColor: '#fff', borderRadius: 8,
                  style: { fontFamily: 'Inter, sans-serif' } },
        title:  { text: 'Today\'s Attendance', style: { fontSize: '14px' } },
        plotOptions: { pie: { innerSize: '55%',
            dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.0f}%' }
        }},
        series: [{ name: 'Employees', data: [
            { name: 'Present',        y: statusCount.present        || 0, color: '#E07A3F' },
            { name: 'Late',           y: statusCount.late           || 0, color: '#f59e0b' },
            { name: 'Absent',         y: statusCount.absent         || 0, color: '#ef4444' },
            { name: 'Not checked in', y: statusCount.not_checked_in || 0, color: '#9ca3af' }
        ]}],
        credits: { enabled: false }
    });
};

vm.toggleCharts = function() {
    vm.showCharts = !vm.showCharts;
    if (vm.showCharts) $timeout(vm.renderCharts, 150);
};

    // The button is labelled "Export CSV" but this was a
    // "coming soon" alert. The working implementation existed in the deleted
    // localStorage controller; this is the same thing over the API's data shape.
    vm.exportReport = function() {
        if (!vm.attendanceList.length) {
            alert('Nothing to export yet.');
            return;
        }
        function cell(value) {
            var s = (value === null || value === undefined) ? '' : String(value);
            return '"' + s.replace(/"/g, '""') + '"';   // quote, so commas in names survive
        }
        var csv = 'Employee ID,Name,Department,Status,Check In,Check Out\n';
        _.each(vm.attendanceList, function(e) {
            csv += [
                cell(e.username),
                cell(e.name),
                cell(e.department),
                cell(e.status),
                cell(e.check_in  ? moment(e.check_in).format('HH:mm:ss')  : '-'),
                cell(e.check_out ? moment(e.check_out).format('HH:mm:ss') : '-')
            ].join(',') + '\n';
        });

        var a = document.createElement('a');
        a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'attendance_' + moment().format('YYYY-MM-DD') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    };

    // settings.html advertised "Search by name or department" but only piped
    // through filter:{name: ...}, so department was never searched.
    vm.searchFilter = function(row) {
        var q = (vm.searchQuery || '').toLowerCase();
        if (!q) { return true; }
        return (row.name || '').toLowerCase().indexOf(q) > -1
            || (row.department || '').toLowerCase().indexOf(q) > -1;
    };

    vm.closeModal   = function() { vm.selectedEmp = null; };
});