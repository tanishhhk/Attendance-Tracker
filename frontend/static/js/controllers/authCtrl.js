app.controller('AuthController', function($scope, $window, AttendanceService) {
    var auth = this;

    auth.credentials = { username: '', password: '' };
    auth.errorMsg    = '';

    // Greeting based on time of day
    var hour = new Date().getHours();
    auth.greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    auth.todayDisplay = moment().format('dddd, MMMM D YYYY');

    // If already logged in, skip login page
    if (AttendanceService.isLoggedIn()) {
        $window.location.href = 'index.html';
        return;
    }

    auth.login = function() {
        if (!auth.credentials.username || !auth.credentials.password) {
            auth.errorMsg = 'Please enter both username and password.';
            return;
        }

        AttendanceService.login(auth.credentials.username, auth.credentials.password)
            .then(function(res) {
    AttendanceService.saveToken(res.data.token);

    localStorage.setItem('currentUser', JSON.stringify({
        username:  res.data.user,
        name:      res.data.name,
        role:      res.data.is_staff ? 'admin' : 'employee', 
        lastLogin: moment().format('YYYY-MM-DD HH:mm:ss')
    }));

    $window.location.href = 'index.html';
}, function(err) {
                auth.errorMsg = 'Invalid username or password.';
            });
    };
});