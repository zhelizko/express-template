const express = require("express"),
    router = express.Router(),
    logger = require("./../lib/logger"),
    config = require("./../lib/config"),
    store = require("./../store");

router.get("/profile", function (req, res) {
    let user = req.user;
    res.json({
        name: user.name,
        email: user.email
    });
});

router.post("/profile", async function (req, res) {
    let changes = req.body;

    // validate
    if (!changes.name) {
        return res.status(400).send("Name is required");
    }
    if (!changes.email) {
        return res.status(400).send("Email is required");
    }
    if (!/.+@.+/.test(changes.email)) {
        return res.status(400).send("Invalid email format");
    }

    await store.users.update(req.user._id, changes);

    // update current user info in session
    // see https://github.com/jaredhanson/passport/issues/208
    req.login(Object.assign(req.user, changes), function () {
        res.sendStatus(200);
    });
});

router.post("/change-password", async function (req, res) {
    let data = req.body,
        password = data.password,
        newPassword = data.newPassword;

    // validate
    if (!password) {
        return res.status(400).send("Current password is required");
    }
    if (!newPassword) {
        return res.status(400).send("New password is required");
    }

    const security = require("./../lib/security"),
        user = await store.users.getById(req.user._id);

    switch (config.passwordHashAlgorithm) {
        case "md5": {
            if (security.md5(password) !== user.password) {
                return res.status(400).send("Current password is incorrect");
            }

            let changes = { password: security.md5(newPassword) };
            await store.users.update(req.user._id, changes);
            return res.sendStatus(200);
        }
        case "bcrypt": {
            security.bcryptCheck(password, user.password, function (err, result) {
                if (err) {
                    logger.error("password check failed", err);
                    return res.sendStatus(500);
                }

                if (!result) {
                    logger.info("Password is incorrect");
                    return res.status(400).send("Current password is incorrect");
                }

                security.bcryptHash(newPassword, async function (err, passwordHash) {
                    let changes = { password: passwordHash };
                    await store.users.update(req.user._id, changes);
                    return res.sendStatus(200);
                });
            });
            break;
        }
        default:
            logger.error("Incorrect passwordHashAlgorithm specified in config.json");
            return res.sendStatus(500);
    }
});


router.post("/send-email", async function (req, res) {
    let subject = req.body.subject,
        message = req.body.message;

    const mailer = require("./../lib/mailer");
    await mailer.send(req.user.email, subject, message);
    return res.sendStatus(200);
});

router.get("/storage/local/list", async function (req, res) {
    const root = process.cwd() + "/www/files",
        fs = require("fs"),
        nodePath = require("path"),
        util = require("util"),
        readdir = util.promisify(fs.readdir),
        stat = util.promisify(fs.stat);

    let path = req.query.path,
        dirs = [],
        files = [];

    if (path[path.length - 1] !== "/") {
        path += "/";
    }

    let items = await readdir(root + path, { withFileTypes: true });

    for (let item of items) {
        console.log(item.name);
        let isFile = item.isFile(),
            isDir = item.isDirectory();

        if (!isFile && !isDir) {
            return;
        }
        console.log(isDir, isFile);

        let result = {
            type: isFile ? "file" : "dir",
            path: path + item.name,
        };

        result.basename = result.name = nodePath.basename(result.path);

        if (isFile) {
            let fileStat = await stat(root + result.path);
            result.size = fileStat.size;
            result.extension = nodePath.extname(result.path).slice(1);
            result.name = nodePath.basename(result.path, "." + result.extension);
            console.log(result);
            files.push(result);
        } else {
            console.log(result);
            dirs.push(result);
        }
    }

    return res.json(dirs.concat(files));
});

router.get("/storage/s3/list", async function (req, res) {
    let path = req.query.path;
    return res.json([
        {
            type: "dir",
            path: path + "subfolder/",
            basename: "subfolder",
            extension: "",
            name: "subfolder",
            children: []
        },
        {
            type: "file",
            path: path + "test.txt",
            basename: "test.txt",
            extension: "txt",
            name: "test"
        }]);

    const AWS = require("aws-sdk");

    // Configure AWS with your access and secret key.
    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET } = process.env;
    AWS.config.update({ accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY, region: AWS_REGION });

    // Create a new service object
    var s3 = new AWS.S3({
        apiVersion: "2006-03-01",
        params: { Bucket: AWS_S3_BUCKET }
    });
    var data = await s3.listObjectsV2({
        Delimiter: "/",
        Prefix: req.query.path
    }).promise();
    console.log(data);
    res.json(data);
});


module.exports = router;