class HttpRouter {
  constructor() {
    this.routes = [];
  }

  get(path, handler) {
    this.addRoute({ method: "GET", path, handler });
  }

  post(path, handler) {
    this.addRoute({ method: "POST", path, handler });
  }

  getPrefix(prefix, handler) {
    this.addRoute({ method: "GET", prefix, handler });
  }

  addRoute(route) {
    this.routes.push(route);
  }

  async handle(request, response, url) {
    const route = this.routes.find(function (candidate) {
      return matchesRoute(candidate, request, url);
    });

    if (!route) {
      return false;
    }

    await route.handler(request, response, url);
    return true;
  }
}

function matchesRoute(route, request, url) {
  if (route.method && route.method !== request.method) {
    return false;
  }

  if (route.path) {
    return url.pathname === route.path;
  }

  return url.pathname.startsWith(route.prefix);
}

module.exports = {
  HttpRouter
};
