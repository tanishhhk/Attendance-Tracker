app.config(function($routeProvider) {

    $routeProvider

        .when('/', {
            redirectTo: function() {
                var token = localStorage.getItem('auth_token');
                if (!token) return '/login';
                var user = JSON.parse(localStorage.getItem('currentUser') || '{}');
                return user.role === 'admin' ? '/admin' : '/dashboard';
            }
        })

        .when('/dashboard', {
            templateUrl:  'static/partial/layout.html',
            controller:   'MainController',
            controllerAs: 'main',
            resolve: {
                auth: function($location) {
                    var token = localStorage.getItem('auth_token');
                    if (!token) { $location.path('/'); }
                }
            }
        })

        .when('/admin', {
            templateUrl:  'static/partial/layout.html',
            controller:   'MainController',
            controllerAs: 'main',
            resolve: {
                auth: function($location) {
                    var token = localStorage.getItem('auth_token');
                    if (!token) { $location.path('/'); }
                }
            }
        })

        .otherwise({ redirectTo: '/' });
});