// ═══════════════════════════════════════════════════════════════
//  DJUBO — routes.js
//  index.html body = <div ng-view> only.
//
//  Flow:
//    /#/          → redirect to /#/dashboard or /#/admin
//    /#/dashboard → layout.html shell (MainController)
//                   layout.html ng-includes my-day.html
//    /#/admin     → layout.html shell (MainController)
//                   layout.html ng-includes settings.html
// ═══════════════════════════════════════════════════════════════

app.config(function($routeProvider) {

    $routeProvider

        // ── Root: redirect based on logged-in role ──
        .when('/', {
            redirectTo: function() {
                var user = JSON.parse(localStorage.getItem('currentUser') || 'null');
                if (!user) return '/login';
                return user.role === 'admin' ? '/admin' : '/dashboard';
            }
        })

        // ── Employee dashboard — loads layout shell ──
        .when('/dashboard', {
            templateUrl:  'static/partial/layout.html',
            controller:   'MainController',
            controllerAs: 'main',
            resolve: {
                auth: function($location) {
                    var user = JSON.parse(localStorage.getItem('currentUser') || 'null');
                    if (!user)                    { $location.path('/login'); return; }
                    if (user.role !== 'employee') { $location.path('/admin'); return; }
                }
            }
        })

        // ── Admin dashboard — loads layout shell ──
        .when('/admin', {
            templateUrl:  'static/partial/layout.html',
            controller:   'MainController',
            controllerAs: 'main',
            resolve: {
                auth: function($location) {
                    var user = JSON.parse(localStorage.getItem('currentUser') || 'null');
                    if (!user)                 { $location.path('/login');     return; }
                    if (user.role !== 'admin') { $location.path('/dashboard'); return; }
                }
            }
        })

        .otherwise({ redirectTo: '/' });
});