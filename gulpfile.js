/* eslint-disable no-console */

let gulp = require("gulp"),
    sass = require("gulp-sass"),
    uglify = require("gulp-uglify-es").default,
    postcss = require("gulp-postcss"),
    autoprefixer = require("autoprefixer"),
    mqpacker = require("css-mqpacker"),
    cssnano = require("cssnano"),
    touch = require("gulp-touch-fd"),
    browserSync = require("browser-sync").create();

/**
 * Browsersync setup - https://www.npmjs.com/package/browser-sync
*/
function browserSyncInit(callback) {
    browserSync.init({
        port: 3001,
        proxy: {
            target: "http://localhost:8080",
            ws: true
        }
    });

    callback();
}

/**
 * Compiles SCSS, applies required PostCSS plugins:
 * Autoprefixer - https://www.npmjs.com/package/autoprefixer
 * MQPacker - https://www.npmjs.com/package/css-mqpacker
 * 
 * output: www/css/welcome.css & www/css/dashboard.css
*/
function cssBundle() {
    let postcssPlugins = [
        autoprefixer({ browsers: ["last 3 version"] }),
        mqpacker(),
    ];

    return gulp.src(["assets/scss/dashboard.scss", "assets/scss/welcome.scss"])
        .pipe(sass().on("error", sass.logError))
        .pipe(postcss(postcssPlugins))
        .pipe(gulp.dest("www/css"))
        .pipe(touch());
}

/**
 * Minifies CSS with cssnano - https://cssnano.co/
 * output: minified www/css/welcome.css & www/css/dashboard.css
 */
function cssMinify() {
    return gulp.src(["www/css/welcome.css", "www/css/dashboard.css"])
        .pipe(postcss([
            cssnano()
        ]))
        .pipe(gulp.dest("www/css"))
        .pipe(touch());
}

/**
 * Use Rollup.js to bundle JavaScript - https://rollupjs.org
 * 
 * Used plugins:
 * Babel - https://www.npmjs.com/package/rollup-plugin-babel
 * Alias - https://www.npmjs.com/package/rollup-plugin-alias
 * Replace - https://www.npmjs.com/package/rollup-plugin-replace
 * CommonJS - https://www.npmjs.com/package/rollup-plugin-commonjs
 * Node Resolve - https://www.npmjs.com/package/rollup-plugin-node-resolve
 * JSON - https://www.npmjs.com/package/rollup-plugin-json
 * SASS - https://www.npmjs.com/package/rollup-plugin-sass
 * Vue.js - https://www.npmjs.com/package/rollup-plugin-vue
 * CSS Only - https://www.npmjs.com/package/rollup-plugin-css-only
 * 
 * @param  {string} input - input (entry) file path
 * @param  {string} output - output file path
 * @param  {bool} watch - use Rollup's build-in watch function to detect file changes
 * @param  {function} callback
*/
async function rollup(input, output, watch, callback) {
    let rollup = require("rollup"),
        babel = require("rollup-plugin-babel"),
        alias = require("rollup-plugin-alias"),
        replace = require("rollup-plugin-replace"),
        commonjs = require("rollup-plugin-commonjs"),
        noderesolve = require("rollup-plugin-node-resolve"),
        json = require("rollup-plugin-json"),
        sass = require("rollup-plugin-sass"),
        css = require("rollup-plugin-css-only"),
        vue = require("rollup-plugin-vue");

    let inputOptions = {
        input: input,
        plugins: [
            json(),
            babel({
                "presets": [
                    [
                        "@babel/env", { "modules": false, "targets": { "chrome": "58", "ie": "11" } }
                    ]
                ],
                "exclude": ["node_modules/**", "assets/js/vendor/**"]
            }),
            replace({
                "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV)
            }),
            alias({
                "vue": require.resolve("vue/dist/vue.esm.js"),
                "axios": require.resolve("axios/dist/axios"),
                "babel-polyfill": require.resolve("@babel/polyfill/lib"),
                "core": "assets/js/core.js",
                "options": "assets/js/options.js"
            }),
            commonjs(),
            noderesolve({ extensions: [".js", ".json", ".vue"] }),
            sass(),
            css({ output: "assets/scss/vue-components.scss" }),
            vue({ css: false })
        ]
    };

    let outputOptions = {
        file: output,
        format: "iife"
    };

    // if files watching is not required then rollup, write and exit
    if (!watch) {
        let bundle = await rollup.rollup(inputOptions);
        await bundle.write(outputOptions);
        typeof callback === "function" && callback();
        return;
    }

    // rollup.watch(...) does rollup.rollup and bundle.write()
    var watcher = rollup.watch({
        ...inputOptions,
        output: outputOptions,
        watch: {
            include: "assets/js/**",
            exclude: "node_modules/**"
        }
    });

    watcher.on("event", e => {
        switch (e.code) {
            case "BUNDLE_START":
                console.log(`Rollup ${e.input} started`);
                break;
            case "BUNDLE_END":
                console.log(`Rollup ${e.input} finished in ${e.duration} ms`);
                break;
            case "END":
                browserSync.reload();
                typeof callback === "function" && callback();
                break;
            case "ERROR":
            case "FATAL":
                console.log(`ERROR while rollup ${e.input}`);
                console.log(e);
                typeof callback === "function" && callback();
                break;
        }
    });
}

// rollups Welcome scripts
function jsWelcomeRollup(watch) {
    return function jsWelcomeRollup(callback) {
        rollup("assets/js/welcome/index.js", "www/js/welcome.js", watch, callback);
    };
}

// minifies Welcome scripts
function jsWelcomeMinify() {
    return gulp.src("www/js/welcome.js")
        .pipe(uglify())
        .pipe(gulp.dest("www/js"))
        .pipe(touch());
}

// rollups Dashboard scripts
function jsDashboardRollup(watch) {
    return function jsDashboardRollup(callback) {
        rollup("assets/js/dashboard/index.js", "www/js/dashboard.js", watch, callback);
    };
}


// minifies Dashboard scripts
function jsDashboardMinify() {
    return gulp.src("www/js/dashboard.js")
        .pipe(uglify())
        .pipe(gulp.dest("www/js"))
        .pipe(touch());
}


// prepares service-worker.js
function jsServiceWorker() {

    var replace = require("gulp-replace"),
        shush = require("shush"),
        argv = require("minimist")(process.argv.slice(2)),
        version = shush(process.cwd() + "/package.json").version,
        hash = require("crypto").randomBytes(20).toString("hex").slice(0, 10),
        commit = argv.commit || hash;

    return gulp.src("assets/js/service-worker.js")
        .pipe(replace("${version}", version))
        .pipe(replace("${commit}", commit))
        .pipe(gulp.dest("www"))
        .pipe(touch());
}


function watch(callback) {
    gulp.watch(["assets/scss/**/*.scss"], cssBundle);
    gulp.watch(["assets/js/service-worker.js"], jsServiceWorker);

    // NOTE: native rollup.watch() is used to watch on welcome & dashboard JS file changes

    callback();
}


function deploy() {
    var replace = require("gulp-replace"),
        argv = require("minimist")(process.argv.slice(2)),
        dest = argv.dest || "dist",
        commit = argv.commit || "---",
        backup = argv.backup || "---";

    console.log(`Deploying commit '${commit}' into folder: ${dest}`);
    var files = [
        "app/**/*",
        "www/**/*",
        "views/**/*",
        "*.html",
        "*.json",
        "*.js",
        "*.md",
        ".foreverignore",
        // ignore the following files:
        "!config.json",
        "!package.json", // will be added separately
        "!package-lock.json",
        "!gulpfile.js"
    ];

    return gulp.src("package.json")             // add package.json
        .pipe(replace("${commit}", commit))     // set actual Git commit short SHA-1 hash in package.json, if specified
        .pipe(replace("${backup}", backup))     // set path to backup archive in package.json, if specified
        .pipe(gulp.src(files, { base: "." }))   // add all other files to be deployed
        .pipe(gulp.dest(dest));
}


// default task is for development purposes
exports.default = gulp.series(
    gulp.parallel(jsWelcomeRollup(true), jsDashboardRollup(true), jsServiceWorker, watch),
    cssBundle, // cssBundle is after jsDashboardRollup because of extracted Vue Single File Component styles (vue-components.scss)
    browserSyncInit
);


// concatenates and minifies all styles and scripts
exports.build = gulp.series(
    gulp.parallel(cssBundle, jsWelcomeRollup(false), jsDashboardRollup(false)),
    gulp.parallel(cssMinify, jsWelcomeMinify, jsDashboardMinify)
);


/*
Deploys required files. Accepts command line arguments:
    --dest       deploy path, 'dist' folder by default
    --commit     Git commit short SHA-1 hash, '---' by default
    --backup     path to backup archive, '---' by default
*/
exports.deploy = gulp.series(jsServiceWorker, deploy);
