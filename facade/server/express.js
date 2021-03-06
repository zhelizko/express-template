var express = require("express"),
    path = require("path"),
    bodyParser = require("body-parser"),
    cookieParser = require("cookie-parser"),
    methodOverride = require("method-override"),
    favicon = require("serve-favicon"),
    errorHandler = require("errorhandler"),
    hbs = require("express-hbs"),
    hbsHelpers = require("./lib/hbs-helpers"),
    cors = require("cors"),
    compression = require("compression");

module.exports = function (config) {

    var app = express();

    // set Express properties
    app.set("env", config.env);
    app.set("port", config.port);
    app.set("x-powered-by", false);
    app.set("view cache", true);

    // on production app is behind a front-facing proxy, so use X-Forwarded-* header to determine client's IP
    app.set("trust proxy", config.prod);

    // enable CORS
    app.use(cors());

    // setup Handlebars view engine (express-hbs)
    const viewsPath = path.resolve("server/views");
    app.engine("html", hbs.express4({
        partialsDir: viewsPath,
        layoutsDir: viewsPath,
        defaultLayout: path.join(viewsPath, "_layout"),
        extname: ".html",
    }));
    app.set("view engine", "html");
    app.set("views", viewsPath);

    // register custom Handlebars helpers
    hbsHelpers(hbs);

    const staticPath = path.resolve(config.staticPath),
        commonStaticPath = path.resolve(config.commonStaticPath);

    // set favicon
    app.use(favicon(staticPath + "/favicon.ico"));

    // set the static files location /www/img will be /img for users
    app.use(express.static(staticPath));
    app.use(express.static(commonStaticPath));

    // init cookie parser
    app.use(cookieParser());

    // init Gzip compression
    app.use(compression({ level: 2 }));

    // parse incoming request body
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());

    // simulate DELETE and PUT
    app.use(methodOverride());

    // for development environment
    if (config.dev) {
        // init error handler
        app.use(errorHandler());
    }


    // custom middlewares
    app.use(function (req, res, next) {

        res.error = function (status, options, callback) {
            options = options || {};
            if (typeof options == "function") {
                callback = options;
                options = {};
            }
            if (req.xhr) {
                return res.status(status).json(options.json || {}).end();
            } else {
                return res.status(status).render(status.toString(), options, callback);
            }
        };

        next();
    });

    return app;
};
