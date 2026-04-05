app.controller('AdminController', function($scope, AttendanceService) {
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
            presentToday:   s.present,
            absentToday:    s.absent,
            lateToday:      s.late
        };
        vm.attendanceList = res.data.employees;
    });
}
loadAdminStats();

    // ── EMPLOYEES ────────────────────────────────────────────
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
            first_name: vm.newEmp.name
        }).then(function() {
            alert('Employee created!');
            loadEmployees();
            vm.newEmp = {};
        }, function(err) {
            alert(err.data.error || 'Could not create employee');
        });
    };

    // ── LEAVE REQUESTS ───────────────────────────────────────
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

    vm.toggleCharts = function() { vm.showCharts = !vm.showCharts; };
    vm.exportReport = function() { alert('Export feature coming soon.'); };
    vm.closeModal   = function() { vm.selectedEmp = null; };
});