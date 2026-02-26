app.controller('AuthController', function($scope, $window, $location, AttendanceService) {
    var vm = this;

    vm.credentials = { employeeId: '', password: '' };

    // MOMENT.JS Greeting + date on login page
    vm.greeting = (function() {
        var h = moment().hour();
        return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
    })();
    vm.todayDisplay = moment().format('dddd, MMMM Do YYYY');

    vm.login = function() {
        var users = AttendanceService.getUsers();

        var user = _.find(users, function(u) {
            return u.employeeId === vm.credentials.employeeId && u.password === vm.credentials.password;
        });

        if (user) {
            user.lastLogin = moment().format('YYYY-MM-DD HH:mm:ss');
            var idx = _.findIndex(users, { employeeId: user.employeeId });
            if (idx > -1) users[idx] = user;
            AttendanceService.saveUsers(users);
            localStorage.setItem('currentUser', JSON.stringify(user));
            // Redirect to the correct dashboard based on role
            $window.location.href = 'index.html';
        } else {
            alert('Invalid credentials. Please contact your admin.');
        }
    };

    // ── Seed demo accounts only when localStorage is empty ──
    var users = AttendanceService.getUsers();
    if (users.length === 0) {
        var demoUsers = _.map([
            { name: 'John Doe',    employeeId: 'EMP001', department: 'Engineering', email: 'john@djubo.com',  password: 'password123', role: 'employee' },
            { name: 'Jane Smith',  employeeId: 'EMP002', department: 'Marketing',   email: 'jane@djubo.com',  password: 'password123', role: 'employee' },
            { name: 'Bob Johnson', employeeId: 'EMP003', department: 'Sales',       email: 'bob@djubo.com',   password: 'password123', role: 'employee' },
            { name: 'Admin User',  employeeId: 'ADMIN',  department: 'Management',  email: 'admin@djubo.com', password: 'admin123',    role: 'admin'    }
        ], function(u) {
            return _.extend({}, u, { createdAt: moment().format('YYYY-MM-DD HH:mm:ss') });
        });
        AttendanceService.saveUsers(demoUsers);
    }
});