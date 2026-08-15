app.config(function($routeProvider) {

    // A resolve only blocks a route by REJECTING. The previous version called
    // $location.path('/') and returned undefined, so the route resolved anyway
    // and rendered the dashboard to logged-out users.
    // It also redirected to '/login', a route that was never declared, so
    // otherwise() sent it back to '/' -> '/login' -> ... until AngularJS threw
    // $rootScope:infdig. Login lives on a separate page, so leave Angular
    // routing entirely instead.
    var requireAuth = ['$q', '$window', function($q, $window) {
        if (localStorage.getItem('auth_token')) { return true; }
        $window.location.href = 'login.html';
        return $q.reject('not-authenticated');
    }];

    $routeProvider

        .when('/', {
            redirectTo: function() {
                var user = JSON.parse(localStorage.getItem('currentUser') || '{}');
                return user.role === 'admin' ? '/admin' : '/dashboard';
            }
        })

        .when('/dashboard', {
            templateUrl:  'static/partial/layout.html',
            controller:   'MainController',
            controllerAs: 'main',
            resolve: { auth: requireAuth }
        })

        .when('/admin', {
            templateUrl:  'static/partial/layout.html',
            controller:   'MainController',
            controllerAs: 'main',
            resolve: { auth: requireAuth }
        })

        .otherwise({ redirectTo: '/' });
});

// Without this the rejected resolve above surfaces as an unhandled rejection in
// the console while the browser is already navigating to login.html.
app.run(function($rootScope) {
    $rootScope.$on('$routeChangeError', function(evt, cur, prev, rejection) {
        if (rejection !== 'not-authenticated') {
            console.error('Route change failed:', rejection);
        }
    });
});
