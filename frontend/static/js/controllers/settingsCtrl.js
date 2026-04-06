app.controller('AdminController', function($scope,$timeout, AttendanceService) {
    var vm = this;

    vm.stats             = { totalEmployees: '-', presentToday: '-', absentToday: '-', lateToday: '-' };
    vm.leaveRequests     = [];
    vm.activeTab         = 'attendance';
    vm.leaveFilterStatus = '';
    vm.departments       = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
    vm.currentUser       = JSON.parse(localStorage.getItem('currentUser') || '{}');
    vm.employees         = [];
    vm.newEmp            = {};
    vm.showCharts        = false;
    vm.searchQuery       = '';
    vm.filterDept        = '';
    vm.filterStatus      = '';


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
    });
}
loadAdminStats();

//EMPLOYEES
    function loadEmployees() {
        AttendanceService.getEmployees().then(function(res) {
            vm.employees = res.data;
            vm.stats.totalEmployees = res.data.length;
        }, function(err) {
            console.log('Could not load employees', err);
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
            vm.newEmp = {};
        }, function(err) {
            alert(err.data.error || 'Could not create employee');
        });
    };

    vm.deleteEmployee = function(id) {
    if (!confirm('Delete this employee? This cannot be undone.')) return;
    AttendanceService.deleteEmployee(id).then(function() {
        loadEmployees();
        loadAdminStats();
    }, function(err) {
        alert(err.data.error || 'Could not delete employee');
    });
};

//LEAVE REQUESTS
    function loadLeaves() {
        AttendanceService.getMyLeaves().then(function(res) {
            vm.leaveRequests = _.map(res.data, function(l) {
                return {
                    id:           l.id,
                    employeeName: vm.currentUser.name,
                    department:   '-',
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
        });
    }
    loadLeaves();

    vm.getFilteredLeaves = function() {
        return _.filter(vm.leaveRequests, function(l) {
            return !vm.leaveFilterStatus || l.status === vm.leaveFilterStatus;
        });
    };

    vm.approveLeave = function(leave) {
        AttendanceService.decideLeave(leave.id, 'approved').then(function() {
            leave.status = 'approved';
            vm.pendingLeavesCount = _.filter(vm.leaveRequests, { status: 'pending' }).length;
        });
    };

    vm.rejectLeave = function(leave) {
        AttendanceService.decideLeave(leave.id, 'rejected').then(function() {
            leave.status = 'rejected';
            vm.pendingLeavesCount = _.filter(vm.leaveRequests, { status: 'pending' }).length;
        });
    };

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

    vm.exportReport = function() { alert('Export feature coming soon.'); };
    vm.closeModal   = function() { vm.selectedEmp = null; };
});