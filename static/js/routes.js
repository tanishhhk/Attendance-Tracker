app.config(function($routeProvider) {

    $routeProvider

    .when('/', {
        templateUrl: 'static/partial/my-day.html',
        controller: 'MainController',
        controllerAs: 'main'
    })

    .otherwise({
        redirectTo: '/'
    });

});